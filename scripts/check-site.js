// Checks that every local file the published pages use is in the folder being published: scripts,
// stylesheets, icons, the manifest, and the icons the manifest names. Run by the deploy workflow on
// the collected site, so a page can't go live with a file left out.
// Usage: node scripts/check-site.js _site
'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || '.');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else files.push(p);
  }
})(dir);

let checked = 0, missing = 0;
function expect(from, ref) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return; // another site, a data: URI, or an anchor
  const target = path.resolve(path.dirname(from), ref.split(/[?#]/)[0]);
  checked++;
  if (!fs.existsSync(target)) { missing++; console.error('missing: ' + path.relative(dir, from) + ' uses ' + ref); }
}

for (const file of files) {
  if (file.endsWith('.html')) {
    const html = fs.readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) expect(file, m[1]);
  } else if (file.endsWith('.webmanifest')) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const icon of manifest.icons || []) expect(file, icon.src);
  }
}

console.log(checked + ' local file reference(s) checked, ' + missing + ' missing');
process.exit(missing ? 1 : 0);
