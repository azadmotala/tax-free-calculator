/*
 * Shared calculator interface: the sentence inputs, chart, scrubber card, tiles, Year by year table,
 * What if scenarios, theme toggle and share link. A country page sets window.TFSC_CONFIG before this
 * file loads:
 *
 *   model   the rules, with FIELDS, DEFAULTS, limitFor, clampState, simulate and simulateTaxable
 *   money   { symbol, group }: the currency symbol and the thousands separator
 *   text    the country's own wording, each a function of the current plan (see config.js):
 *             limits(c)            the rules summary that follows the hint, as HTML
 *             lifetimeMilestone    the label for the year the lifetime limit is reached
 *             lifetimeNote(c, r)   the scrubber card note for that year, as HTML
 *             taxableTile(c, tax)  the text under the tile comparing with an ordinary account
 *
 * The page's markup (sentence wording, labels, table headings, footer) lives in each page's HTML.
 */
(function () {
  'use strict';
  const CFG = window.TFSC_CONFIG;
  const M = CFG.model;
  const { limitFor, clampState, simulate, simulateTaxable } = M;
  const UI = {
    age:       { px: 10, fmt: v => String(v) },
    startYear: { px: 10, fmt: v => String(v) },
    contrib:   { px: 3,  fmt: v => fmtR(v) },
    gross:     { px: 6,  fmt: v => fmtPct(v) },
    fees:      { px: 4,  fmt: v => fmtPct(v) },
    until:     { px: 10, fmt: v => String(v) },
    rate:      { px: 6,  fmt: v => fmtPct(v) },
    end:       { px: 10, fmt: v => String(v) }
  };
  const FIELDS = {};
  for (const k in M.FIELDS) FIELDS[k] = Object.assign({}, M.FIELDS[k], UI[k]);
  const SCENARIOS = [
    { id: 'late1',   label: 'Start one year later',    dash: '6 4',      make: s => ({ ...s, age: s.age + 1, startYear: s.startYear + 1 }) },
    { id: 'late5',   label: 'Start five years later',  dash: '2 4',      make: s => ({ ...s, age: s.age + 5, startYear: s.startYear + 5 }) },
    { id: 'fees1',   label: 'Fees 1% higher',          dash: '10 4',     make: s => ({ ...s, fees: s.fees + 1 }) },
    { id: 'half',    label: 'Half the deposit',        dash: '1 3',      make: s => ({ ...s, contrib: s.contrib / 2 }) },
    { id: 'taxable', label: 'Taxable account instead', dash: '4 4 1 4',  taxable: true }
  ];

  let S = Object.assign({}, M.DEFAULTS);
  let view = 'plan';
  let active = new Set();
  let scrub = -1;
  let base = null;
  let curves = [];

  const $ = id => document.getElementById(id);
  const CUR = CFG.money.symbol, GROUP = CFG.money.group;
  function group(n) { return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP); }
  function fmtR(n, sign) { const s = n < 0 ? '\u2212' : (sign && n > 0 ? '+' : ''); return s + CUR + group(n); }
  function fmtShort(n) {
    const a = Math.abs(n), s = n < 0 ? '\u2212' : '';
    if (a >= 1e12) return s + CUR + (a / 1e12).toFixed(2) + 'tn';
    if (a >= 1e9) return s + CUR + (a / 1e9).toFixed(a >= 1e11 ? 0 : 1) + 'bn';
    if (a >= 1e6) return s + CUR + (a / 1e6).toFixed(2) + 'm';
    if (a >= 1e4) return s + CUR + Math.round(a / 1e3) + 'k';
    return s + CUR + group(a);
  }
  function fmtBig(n, sign) { return Math.abs(n) >= 1e7 ? (sign && n > 0 ? '+' : '') + fmtShort(n) : fmtR(n, sign); }
  function trim(x) { return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(1))); }
  function fmtTick(v) {
    if (v >= 1e12) return CUR + trim(v / 1e12) + 'tn';
    if (v >= 1e9) return CUR + trim(v / 1e9) + 'bn';
    if (v >= 1e6) return CUR + trim(v / 1e6) + 'm';
    if (v >= 1e3) return CUR + Math.round(v / 1e3) + 'k';
    return CUR + Math.round(v);
  }
  function fmtPct(v) { return v.toFixed(2) + '%'; }
  const pct = fmtPct;
  // What a country's wording functions can use: the plan, its projection, the rules and the formatters.
  const ctx = () => ({ S, base, M, limitFor, fmtR, fmtShort, fmtBig, fmtPct });

  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

  function scenarioSeries(sc) {
    if (sc.taxable) { const t = simulateTaxable(S); return { rows: t.rows, final: t.final, note: 'after capital gains tax' }; }
    const s2 = clampState(sc.make(S));
    if (s2.until <= s2.age + 0) return null;
    const r = simulate(s2);
    const at = r.rows.find(x => x.age === S.until) || r.rows[r.rows.length - 1];
    return { rows: r.rows.map(x => ({ age: x.age, closing: x.closing })), final: at.closing };
  }

  function render() {
    base = simulate(S);
    const tax = simulateTaxable(S);
    for (const el of document.querySelectorAll('.num')) {
      const k = el.dataset.key; if (el.querySelector('input')) continue;
      el.textContent = FIELDS[k].fmt(S[k]); el.setAttribute('aria-valuenow', S[k]); el.setAttribute('aria-valuetext', FIELDS[k].fmt(S[k]));
    }
    const last = base.rows[base.untilIdx];
    const drawYears = base.n - 1 - base.untilIdx;
    if (S.rate > 0) $('drawSummary').textContent = 'That\u2019s ' + fmtBig(base.firstDraw / 12) + ' a month to start, ' + fmtBig(base.drawn) + ' drawn over ' + drawYears + (drawYears === 1 ? ' year' : ' years') + ', and ' + fmtShort(base.endValue) + ' still there at ' + S.end + '.';
    else $('drawSummary').textContent = 'Nothing comes out, so it keeps growing to ' + fmtShort(base.endValue) + ' at ' + S.end + '.';
    $('rDrawnCap').textContent = 'Drawn over ' + drawYears + (drawYears === 1 ? ' year' : ' years');
    $('rLeftCap').textContent = 'Left at ' + S.end;
    $('rLeft').textContent = fmtBig(base.endValue);
    if (S.rate > 0) {
      $('drawCap').textContent = 'From ' + (S.until + 1) + ' \u00b7 a month, tax-free';
      $('drawValue').textContent = fmtBig(base.firstDraw / 12);
      $('rYear').textContent = fmtBig(base.firstDraw);
      $('rDrawn').textContent = fmtBig(base.drawn);
    } else {
      $('drawCap').textContent = 'At ' + S.end + ' \u00b7 untouched';
      $('drawValue').textContent = fmtShort(base.endValue);
      $('rYear').textContent = '\u2014';
      $('rDrawn').textContent = fmtR(0);
    }
    $('hint').innerHTML = '<span class="mouse-only">Drag a number to change it, or click to type</span><span class="touch-only">Drag a number, or tap it to type. Tap or drag the chart to pick a year</span> &middot; ' + CFG.text.limits(ctx());
    $('heroCap').textContent = 'At ' + last.age + ' \u00b7 ' + last.year;
    $('heroValue').textContent = fmtShort(base.final);
    $('rPutIn').textContent = fmtR(base.contributed);
    $('rGrowth').textContent = fmtBig(base.growth);
    const mult = base.contributed > 0 ? base.final / base.contributed : 0;
    $('rMultiple').textContent = base.contributed > 0 ? (mult >= 1000 ? fmtR(mult) : CUR + mult.toFixed(2)) : '\u2014';
    $('rTax').textContent = fmtBig(base.final - tax.final);
    renderTiles(tax);
    renderChart();
    renderTable();
    renderWhatIf();
    const h = '#a=' + S.age + '&y=' + S.startYear + '&c=' + S.contrib + '&g=' + S.gross + '&f=' + S.fees + '&u=' + S.until + '&r=' + S.rate + '&e=' + S.end;
    try { history.replaceState(null, '', h); } catch (e) {}
  }

  function renderTiles(tax) {
    const yrs = S.until - S.age;
    if (yrs > 1) {
      const a1 = simulate(clampState({ ...S, age: S.age + 1, startYear: S.startYear + 1 }));
      $('tWait').textContent = fmtBig(-(base.final - a1.final));
      if (yrs > 5) { const a5 = simulate(clampState({ ...S, age: S.age + 5, startYear: S.startYear + 5 })); $('tWaitT').textContent = 'Start at ' + (S.age + 5) + ' and it costs ' + fmtBig(base.final - a5.final) + '.'; }
      else $('tWaitT').textContent = 'That\u2019s starting at ' + (S.age + 1) + ' instead of ' + S.age + '.';
    } else { $('tWait').textContent = '\u2014'; $('tWaitT').textContent = 'Give the plan a few more years to see this.'; }
    const f1 = simulate(clampState({ ...S, fees: S.fees + 1 })), f2 = simulate(clampState({ ...S, fees: S.fees + 2 }));
    $('tFees').textContent = fmtBig(-(base.final - f1.final));
    $('tFeesT').textContent = 'That\u2019s fees of ' + pct(S.fees + 1) + ' instead of ' + pct(S.fees) + '. At ' + pct(S.fees + 2) + ' it\u2019s ' + fmtBig(base.final - f2.final) + '.';
    $('tWrap').textContent = fmtBig(base.final - tax.final, true);
    $('tWrapT').textContent = CFG.text.taxableTile(ctx(), tax);
  }


  function renderChart() {
    const chart = $('chart'); if (chart.hidden) return;
    const W = chart.clientWidth, H = $('svg').clientHeight || 300, n = base.n;
    if (!W) return;
    lastW = W;
    const extras = view === 'whatif' ? SCENARIOS.filter(sc => active.has(sc.id)).map(sc => ({ sc, s: scenarioSeries(sc) })).filter(x => x.s) : [];
    let raw = Math.max(1, ...base.rows.map(r => r.closing), ...extras.flatMap(x => x.s.rows.map(r => r.closing)));
    const step = niceStep(raw / 5), yMax = Math.ceil(raw / step) * step;
    const x = i => n > 1 ? i / (n - 1) * W : 0, y = v => H - v / yMax * H;
    const xa = age => x(age - S.age);
    const pts = base.rows.map(r => x(r.i).toFixed(1) + ',' + y(r.closing).toFixed(1));
    curves = [base.rows.map(r => [x(r.i), y(r.closing)])].concat(extras.map(e => e.s.rows.map(r => [xa(r.age), y(r.closing)])));
    let svg = '';
    // Every colour in the chart comes from a theme variable, so switching themes needs no redraw.
    for (let v = step; v <= yMax + 1e-6; v += step) svg += '<line x1="0" x2="' + W + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" style="stroke: var(--line)" stroke-width="1"></line>';
    svg += '<line x1="0" x2="' + W + '" y1="' + H + '" y2="' + H + '" style="stroke: var(--line)" stroke-width="1"></line>';
    svg += '<defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color: var(--accent-fill); stop-opacity: var(--fill-top)"></stop><stop offset="1" style="stop-color: var(--accent-fill); stop-opacity: 0"></stop></linearGradient>'
        + '<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" style="fill: var(--draw-line); fill-opacity: var(--hatch-tint-op)"></rect><line x1="0" y1="0" x2="0" y2="7" style="stroke: var(--draw-line); stroke-opacity: var(--hatch-line-op)" stroke-width="1.2"></line></pattern></defs>';
    const u = base.untilIdx, xu = x(u).toFixed(1), drawing = S.rate > 0 && u < n - 1;
    const ptsSave = drawing ? pts.slice(0, u + 1) : pts, ptsDraw = pts.slice(u);
    svg += '<path d="M' + ptsSave.join(' L') + ' L' + (drawing ? xu : W) + ',' + H + ' L0,' + H + ' Z" fill="url(#fade)"></path>';
    if (drawing) {
      svg += '<path d="M' + ptsDraw.join(' L') + ' L' + W + ',' + H + ' L' + xu + ',' + H + ' Z" fill="url(#hatch)"></path>';
      svg += '<line x1="' + xu + '" x2="' + xu + '" y1="0" y2="' + H + '" style="stroke: var(--draw-line)" stroke-width="1"></line>';
    } else if (u < n - 1) {
      svg += '<line x1="' + xu + '" x2="' + xu + '" y1="0" y2="' + H + '" style="stroke: var(--line-3)" stroke-width="1" stroke-dasharray="3 5"></line>';
    }
    svg += '<path d="M' + base.rows.map(r => x(r.i).toFixed(1) + ',' + y(r.cum).toFixed(1)).join(' L') + '" fill="none" style="stroke: var(--line-3)" stroke-width="1.5" stroke-dasharray="2 5"></path>';
    for (const e of extras) {
      const p = e.s.rows.map(r => xa(r.age).toFixed(1) + ',' + y(r.closing).toFixed(1));
      svg += '<path class="ln-scen" d="M' + p.join(' L') + '" fill="none" style="stroke: var(--muted)" stroke-width="1.5" stroke-dasharray="' + e.sc.dash + '"></path>';
    }
    svg += '<path class="ln-save" d="M' + ptsSave.join(' L') + '" fill="none" style="stroke: var(--save-line)" stroke-width="2.5" stroke-linejoin="round"></path>';
    if (drawing) svg += '<path class="ln-draw" d="M' + ptsDraw.join(' L') + '" fill="none" style="stroke: var(--draw-line)" stroke-width="2" stroke-linejoin="round"></path>';
    for (const i of [base.outpace, base.limit, base.half, base.draw]) if (i >= 0) svg += '<line x1="' + x(i).toFixed(1) + '" x2="' + x(i).toFixed(1) + '" y1="' + y(base.rows[i].closing).toFixed(1) + '" y2="' + H + '" style="stroke: var(--muted)" stroke-width="1"></line>';
    svg += '<line id="scrubLine" x1="0" x2="0" y1="0" y2="' + H + '" style="stroke: var(--text)" stroke-width="1" stroke-dasharray="4 4"></line>';
    $('svg').innerHTML = svg;

    let ov = '';
    for (let v = step; v <= yMax + 1e-6; v += step) ov += '<div class="ylab" style="top:' + (y(v) - 14).toFixed(1) + 'px">' + fmtTick(v) + '</div>';
    ov += '<div class="phase" data-c="' + (x(u) * 0.5).toFixed(1) + '" data-short="Saving" data-long="Saving \u00b7 ' + S.age + ' to ' + S.until + '"></div>';
    if (u < n - 1) {
      const lbl = drawing ? 'Drawing ' + fmtPct(S.rate) : 'Left to grow';
      ov += '<div class="phase" data-c="' + ((x(u) + W) / 2).toFixed(1) + '" data-short="' + lbl + '" data-long="' + (drawing ? lbl + ' a year' : lbl) + ' \u00b7 ' + (S.until + 1) + ' to ' + S.end + '"></div>';
    }
    for (const e of extras) { const lastRow = e.s.rows[e.s.rows.length - 1]; ov += '<div class="endlab" style="left:' + W + 'px; top:' + y(lastRow.closing).toFixed(1) + 'px">' + e.sc.label + ' \u00b7 ' + fmtShort(e.s.final) + '</div>'; }
    $('overlay').innerHTML = ov;
    fitPhases(W);

    const marks = [];
    if (base.outpace >= 0) marks.push({ i: base.outpace, t: base.rows[base.outpace].age + ' \u00b7 growth outpaces deposits' });
    if (base.limit >= 0) marks.push({ i: base.limit, t: base.rows[base.limit].age + ' \u00b7 ' + CFG.text.lifetimeMilestone });
    if (base.half >= 0) marks.push({ i: base.half, t: base.rows[base.half].age + ' \u00b7 halfway to ' + fmtShort(base.final) });
    if (base.draw >= 0) marks.push({ i: base.draw, t: base.rows[base.draw].age + ' \u00b7 you start drawing' });
    marks.sort((a, b) => a.i - b.i);
    // On a narrow chart the explanations don't fit under their ticks, so show only the age there.
    // The scrubber card explains each milestone when you park on it.
    if (W < 600) for (const m of marks) { m.t = String(base.rows[m.i].age); m.c = true; }
    const CH = 6.7, placed = [{ s: 0, e: String(S.age).length * CH, row: 0 }, { s: W - String(S.end).length * CH, e: W, row: 0 }];
    let ax = '<span class="edge" style="left:0">' + S.age + '</span><span class="edge" style="right:0">' + S.end + '</span>';
    for (const m of marks) {
      const px = x(m.i), w = m.t.length * CH + 6;
      let side = m.c ? 'c' : (px + w <= W ? 'l' : 'r');
      if (side === 'r' && px - w < 0) side = 'l';
      const s = side === 'l' ? px : side === 'r' ? px - w : px - w / 2, e = s + w;
      let row = 0;
      while (placed.some(p => p.row === row && s < p.e + 8 && e > p.s - 8)) row++;
      placed.push({ s, e, row });
      ax += '<span class="' + side + '" style="left:' + px.toFixed(1) + 'px; top:' + (row * 15) + 'px">' + m.t + '</span>';
    }
    $('axis').innerHTML = ax;
    const rowsUsed = Math.max(1, ...placed.map(p => p.row + 1));
    chart.style.height = (H + 6 + rowsUsed * 15 + 8) + 'px';

    if (scrub < 0 || scrub >= n) scrub = Math.round((n - 1) / 2);
    placeScrub(W, H, x, y);
  }

  function placeScrub(W, H, x, y) {
    const r = base.rows[scrub], px = x(r.i), py = y(r.closing);
    const line = $('scrubLine'); if (line) { line.setAttribute('x1', px.toFixed(1)); line.setAttribute('x2', px.toFixed(1)); }
    const dot = $('dot'); dot.style.left = px + 'px'; dot.style.top = py + 'px';
    const tip = $('tip');
    tip.classList.toggle('draw', r.withdrawal > 0);
    const since = base.limit >= 0 && r.i > base.limit ? r.i - base.limit : 0;
    let dep = r.deposit > 0 ? fmtR(r.deposit) + ' deposited' : since > 0 ? 'deposits stopped ' + since + ' yr' + (since > 1 ? 's' : '') + ' ago' : 'no deposit';
    if (r.withdrawal > 0) dep = fmtBig(-r.withdrawal) + ' drawn (' + fmtBig(r.withdrawal / 12) + ' a month)';
    let note = '';
    if (r.i === base.draw) {
      const next = base.rows[r.i + 1], keeps = (1 - S.rate / 100) * (1 + (S.gross - S.fees) / 100) >= 1;
      note += '<div class="note"><strong>You start drawing.</strong> From next year you take ' + fmtPct(S.rate) + ' of the balance each year, ' + fmtBig(next.withdrawal / 12) + ' a month to start. ' + (keeps ? 'Growth at ' + fmtPct(S.gross - S.fees) + ' after fees outpaces what you take, so the balance keeps rising.' : 'That is more than the ' + fmtPct(S.gross - S.fees) + ' it earns after fees, so the balance shrinks each year.') + '</div>';
    }
    if (r.i === base.outpace) note += '<div class="note"><strong>Growth outpaces deposits.</strong> It earned ' + fmtBig(r.growth) + ' this year, more than your ' + fmtR(r.planned) + '.</div>';
    if (r.i === base.limit) note += '<div class="note">' + CFG.text.lifetimeNote(ctx(), r) + '</div>';
    if (r.i === base.half) {
      const left = base.untilIdx - r.i;
      note += '<div class="note"><strong>Halfway there.</strong> You\u2019re past half of the ' + fmtShort(base.final) + ' you\u2019ll have at ' + S.until + '. It took ' + (r.i + 1) + ' years to get here, and ' + (left === 1 ? 'the last year adds' : 'the last ' + left + ' add') + ' as much again.</div>';
    }
    tip.innerHTML = '<div class="cap">' + r.year + ' \u00b7 age ' + r.age + '</div><div class="v">' + fmtBig(r.closing) + '</div>' + (note
      ? '<div class="s">' + fmtBig(r.growth, true) + ' growth \u00b7 ' + dep + '</div>'
      : '<div class="s">' + fmtBig(r.growth, true) + ' growth this year</div><div class="s">' + dep + '</div>') + note;
    // A narrow chart has no room beside the scrubber, so the card docks underneath the chart instead.
    const dock = $('tipdock');
    if (W < 600) {
      if (tip.parentNode !== dock) dock.appendChild(tip);
      tip.style.left = ''; tip.style.top = '';
      return;
    }
    if (tip.parentNode !== $('chart')) $('chart').insertBefore(tip, $('axis'));
    tip.style.left = '0px'; tip.style.top = '0px';
    const tw = tip.offsetWidth || 200, th = tip.offsetHeight || 96;
    const pos = placeCard(px, py, tw, th, W, H);
    tip.style.left = pos.l + 'px';
    tip.style.top = pos.t + 'px';
  }

  // Keeps the Saving and Drawing labels inside the chart. If they would collide, drop the age
  // ranges; if they still collide, keep only the drawing label.
  function fitPhases(W) {
    const ps = [...$('overlay').querySelectorAll('.phase')];
    const place = mode => {
      for (const p of ps) {
        p.hidden = false; p.textContent = p.dataset[mode];
        const w = p.offsetWidth;
        p.style.left = Math.max(0, Math.min(W - w, Number(p.dataset.c) - w / 2)) + 'px';
      }
    };
    const clash = () => ps.length > 1 && ps[0].offsetLeft + ps[0].offsetWidth + 12 > ps[1].offsetLeft;
    place('long'); if (!clash()) return;
    place('short'); if (!clash()) return;
    ps[0].hidden = true;
  }

  // Picks where the scrubber card goes: either side of the scrubber, above or below the dot, or
  // pinned to the top or bottom of the chart. Each spot is scored by how much of any drawn line
  // would run behind the card; the clearest spot wins, with a small preference for right and above.
  function placeCard(px, py, tw, th, W, H) {
    const GAP = 14, TOP = 28, PAD = 8, bottom = H - th;
    const sides = [{ l: px + GAP, pref: 0 }, { l: px - GAP - tw, pref: 1 }];
    const rows = [{ t: py - th - GAP, pref: 0 }, { t: py + GAP, pref: 0.5 }, { t: TOP, pref: 1 }, { t: bottom, pref: 1.5 }];
    const cands = [];
    for (const s of sides) for (const rw of rows) cands.push({ l: s.l, t: rw.t, pref: s.pref + rw.pref });
    // Farther spots along the top and bottom edges, for when a diagonal curve fills the band beside
    // the scrubber. They cost more the farther they sit from it.
    for (let l = 48; l + tw <= W; l += 24) for (const t of [TOP, bottom]) cands.push({ l, t, pref: 3 + Math.abs(l + tw / 2 - px) / W * 4 });
    let best = null;
    for (const cd of cands) {
      if (cd.l < 0 || cd.l + tw > W) continue;
      if (cd.l - 6 <= px && px <= cd.l + tw + 6) continue;
      const t = Math.min(bottom, Math.max(TOP, cd.t));
      const rect = { l: cd.l - PAD, r: cd.l + tw + PAD, t: t - PAD, b: t + th + PAD };
      const score = lineHits(rect) * 10 + cd.pref + (cd.l < 48 ? 2 : 0);
      if (!best || score < best.score) best = { l: cd.l, t, score };
    }
    if (!best) best = { l: Math.max(0, Math.min(W - tw, px + GAP)), t: Math.min(bottom, Math.max(TOP, py - th - GAP)) };
    return best;
  }
  function lineHits(rect) {
    let hits = 0;
    for (const c of curves) {
      for (let k = 0; k + 1 < c.length; k++) {
        const x1 = c[k][0], y1 = c[k][1], x2 = c[k + 1][0], y2 = c[k + 1][1];
        if (x2 < rect.l || x1 > rect.r) continue;
        const steps = Math.max(1, Math.ceil((x2 - x1) / 4));
        for (let s = 0; s <= steps; s++) {
          const xx = x1 + (x2 - x1) * s / steps, yy = y1 + (y2 - y1) * s / steps;
          if (xx >= rect.l && xx <= rect.r && yy >= rect.t && yy <= rect.b) hits++;
        }
      }
    }
    return hits;
  }

  function renderTable() {
    if ($('table').hidden) return;
    if (scrub < 0 || scrub >= base.n) scrub = Math.round((base.n - 1) / 2);
    let h = '';
    base.rows.forEach(r => {
      const notes = [];
      if (r.i === base.outpace) notes.push('growth outpaces deposits');
      if (r.i === base.limit) notes.push(CFG.text.lifetimeMilestone);
      if (r.i === base.half) notes.push('halfway');
      if (r.i === base.draw + 1 && base.draw >= 0) notes.push('withdrawals begin');
      if (base.atMax && r.i > 0 && r.deposit > 0 && r.limit > base.rows[r.i - 1].limit) notes.push('limit rises to ' + fmtR(r.limit));
      const cls = (notes.length ? 'mark' : '') + (r.i === scrub ? ' sel' : '');
      h += '<tr data-i="' + r.i + '" class="' + cls.trim() + '" aria-selected="' + (r.i === scrub) + '"><td>' + r.age + '</td><td>' + r.year + '</td><td>' + fmtR(r.deposit) + '</td><td>' + fmtR(r.cum) + '</td><td>' + fmtR(r.opening) + '</td><td>' + (r.withdrawal > 0 ? fmtR(r.withdrawal) : '\u2014') + '</td><td>' + fmtR(r.growth) + '</td><td>' + fmtR(r.closing) + '</td><td class="note">' + notes.join(', ') + '</td></tr>';
    });
    $('tbody').innerHTML = h;
  }

  function selectRow(i, reveal) {
    if (!base) return;
    i = Math.max(0, Math.min(base.n - 1, i));
    scrub = i;
    const tb = $('tbody');
    const prev = tb.querySelector('tr.sel');
    if (prev) { prev.classList.remove('sel'); prev.setAttribute('aria-selected', 'false'); }
    const tr = tb.children[i];
    if (!tr) return;
    tr.classList.add('sel'); tr.setAttribute('aria-selected', 'true');
    if (reveal) revealRow(tr, reveal === 'center');
  }
  function revealRow(tr, center) {
    const wrap = $('tablewrap'), head = wrap.querySelector('thead').offsetHeight;
    const w = wrap.getBoundingClientRect(), b = tr.getBoundingClientRect();
    if (center) { wrap.scrollTop += (b.top + b.height / 2) - (w.top + head + (w.height - head) / 2); return; }
    if (b.top < w.top + head) wrap.scrollTop -= (w.top + head) - b.top;
    else if (b.bottom > w.bottom) wrap.scrollTop += b.bottom - w.bottom;
  }

  function renderWhatIf() {
    if ($('whatif').hidden) return;
    let c = '';
    for (const sc of SCENARIOS) c += '<button type="button" class="chip" data-id="' + sc.id + '" aria-pressed="' + active.has(sc.id) + '">' + sc.label + '</button>';
    $('chips').innerHTML = c;
    let l = '<div class="row plan"><span>Your plan</span><span class="mono">' + fmtBig(base.final) + '</span><span class="delta mono">at ' + S.until + '</span></div>';
    let any = false;
    for (const sc of SCENARIOS) {
      if (!active.has(sc.id)) continue;
      const s = scenarioSeries(sc); if (!s) continue; any = true;
      l += '<div class="row"><span>' + sc.label + (s.note ? ' <span class="empty">(' + s.note + ')</span>' : '') + '</span><span class="mono">' + fmtBig(s.final) + '</span><span class="delta mono">' + fmtBig(s.final - base.final, true) + '</span></div>';
    }
    $('scenList').innerHTML = l + (any ? '' : '<div class="row"><span class="empty">Pick a scenario above to draw it on the chart.</span></div>');
  }

  function setView(v) {
    view = v;
    for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
    $('chart').hidden = v === 'table';
    $('tiles').hidden = v !== 'plan';
    $('whatif').hidden = v !== 'whatif';
    $('table').hidden = v !== 'table';
    $('tipdock').hidden = v === 'table';
    render();
    if (v === 'table') { const tr = $('tbody').children[scrub]; if (tr) revealRow(tr, true); }
  }

  function setValue(k, v) {
    const keepAge = base && scrub >= 0 && base.rows[scrub] ? base.rows[scrub].age : null;
    const o = { ...S, [k]: v };
    if (k === 'age' && o.until <= o.age) o.until = o.age + 1;
    if (k === 'startYear' && S.contrib >= limitFor(S.startYear)) o.contrib = limitFor(Math.min(FIELDS.startYear.max, Math.max(FIELDS.startYear.min, Math.round(v))));
    S = clampState(o);
    const idx = keepAge === null ? -1 : keepAge - S.age;
    scrub = idx >= 0 && idx <= S.end - S.age ? idx : -1;
    render();
  }

  let drag = null;
  document.querySelectorAll('.num').forEach(el => {
    const k = el.dataset.key, f = FIELDS[k];
    el.addEventListener('pointerdown', e => {
      if (el.querySelector('input')) return;
      drag = { el, k, x: e.clientX, v: S[k], moved: false };
      el.setPointerCapture(e.pointerId); el.classList.add('dragging');
    });
    el.addEventListener('pointermove', e => {
      if (!drag || drag.el !== el) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 3) drag.moved = true;
      if (drag.moved) { const v = drag.v + Math.round(dx / f.px) * f.step; if (v !== S[k]) setValue(k, v); }
    });
    const end = e => {
      if (!drag || drag.el !== el) return;
      const moved = drag.moved; drag = null; el.classList.remove('dragging');
      if (!moved && e.type === 'pointerup') beginEdit(el, k);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', e => {
      if (el.querySelector('input')) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); setValue(k, S[k] + f.step * (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); setValue(k, S[k] - f.step * (e.shiftKey ? 10 : 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); beginEdit(el, k); }
    });
  });
  function beginEdit(el, k) {
    const inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = String(S[k]); inp.setAttribute('aria-label', el.getAttribute('aria-label'));
    el.textContent = ''; el.appendChild(inp); inp.focus(); inp.select();
    let done = false;
    const commit = ok => { if (done) return; done = true; const v = parseFloat(inp.value.replace(/[^\d.\-]/g, '')); inp.remove(); if (ok && Number.isFinite(v)) setValue(k, v); else render(); el.focus(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commit(true); } else if (e.key === 'Escape') { e.preventDefault(); commit(false); } });
    inp.addEventListener('blur', () => commit(true));
    inp.addEventListener('pointerdown', e => e.stopPropagation());
  }

  function scrubAt(e) {
    if ($('chart').hidden || !base) return;
    const rect = $('chart').getBoundingClientRect(); const W = rect.width;
    const i = Math.round((e.clientX - rect.left) / W * (base.n - 1));
    const ni = Math.min(base.n - 1, Math.max(0, i));
    if (ni !== scrub) { scrub = ni; renderChart(); }
  }
  // Mouse hover scrubs; on touch, a tap or a sideways drag scrubs and a vertical swipe still scrolls the page.
  $('chart').addEventListener('pointermove', scrubAt);
  $('chart').addEventListener('pointerdown', scrubAt);
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  $('tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-i]'); if (tr) { selectRow(Number(tr.dataset.i), false); $('tablewrap').focus({ preventScroll: true }); } });
  $('tablewrap').addEventListener('keydown', e => {
    if (!base) return;
    const page = Math.max(1, Math.floor(($('tablewrap').clientHeight - 40) / 41));
    const moves = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page, Home: -Infinity, End: Infinity };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const m = moves[e.key];
    selectRow(m === -Infinity ? 0 : m === Infinity ? base.n - 1 : scrub + m, true);
  });
  $('chips').addEventListener('click', e => { const b = e.target.closest('.chip'); if (!b) return; const id = b.dataset.id; if (active.has(id)) active.delete(id); else active.add(id); render(); });

  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }
  $('share').addEventListener('click', async () => {
    const url = location.href;
    try { await navigator.clipboard.writeText(url); toast('Link copied. It opens with these numbers.'); }
    catch (e) { toast('Couldn\u2019t copy. The link in the address bar carries these numbers.'); }
  });

  // Theme toggle. The page follows the device setting (or the claude.ai viewer's stamp) until someone
  // presses the toggle; that choice is saved on this device and applied before paint on the next visit.
  const THEME_KEY = 'tfsc-theme';
  const currentTheme = () => getComputedStyle(document.documentElement).getPropertyValue('--mode').trim() === 'light' ? 'light' : 'dark';
  function syncThemeUI() {
    const t = currentTheme(), next = t === 'dark' ? 'light' : 'dark', btn = $('theme');
    btn.dataset.mode = t;
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.title = 'Switch to ' + next + ' theme';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  }
  $('theme').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    syncThemeUI();
  });
  try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', syncThemeUI); } catch (e) {}
  new MutationObserver(syncThemeUI).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncThemeUI();

  (function fromHash() {
    const m = new URLSearchParams(location.hash.slice(1));
    const map = { a: 'age', y: 'startYear', c: 'contrib', g: 'gross', f: 'fees', u: 'until', r: 'rate', e: 'end' };
    const o = { ...S }; let any = false;
    for (const k in map) { const v = parseFloat(m.get(k)); if (Number.isFinite(v)) { o[map[k]] = v; any = true; } }
    if (any) S = clampState(o);
  })();

  let rt, lastW = -1;
  function chartResized() { const w = $('chart').clientWidth; if (w === lastW || !base) return; lastW = w; clearTimeout(rt); rt = setTimeout(renderChart, 30); }
  window.addEventListener('resize', chartResized);
  if (window.ResizeObserver) new ResizeObserver(chartResized).observe($('chart'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderChart);
  render();
})();
