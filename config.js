/*
 * South Africa: the tax-free savings account rules (model.js) and the page's SARS wording.
 * Loaded after model.js and before shared/calculator.js, which describes each entry.
 */
(function () {
  'use strict';
  const M = window.TFSA;
  const LATEST = M.ANNUAL_LIMITS[M.ANNUAL_LIMITS.length - 1];

  window.TFSC_CONFIG = {
    model: M,
    money: { symbol: 'R', group: ' ' },
    text: {
      // The rules summary after the hint. A plan at the limit follows SARS's increases, so say so.
      limits(c) {
        const rises = c.base.atMax && c.limitFor(c.S.startYear) < LATEST.limit;
        return 'SARS limit for ' + c.S.startYear + ': ' + c.fmtR(c.limitFor(c.S.startYear)) + ' a year &middot; ' + c.fmtR(M.LIMIT.lifetime) + ' lifetime' +
          (rises ? ' &middot; you&rsquo;re at the limit, so each year&rsquo;s deposit follows it up to ' + c.fmtR(LATEST.limit) + ' in ' + LATEST.from : '');
      },
      lifetimeMilestone: 'lifetime limit reached',
      lifetimeNote(c, r) {
        const left = c.base.untilIdx - r.i;
        return '<strong>Lifetime limit reached.</strong> This ' + c.fmtR(r.deposit) + ' takes you to ' + c.fmtR(M.LIMIT.lifetime) + ', the most SARS allows.' +
          (left > 0 ? ' The next ' + left + (left === 1 ? ' year is' : ' years are') + ' growth alone.' : '');
      },
      taxableTile(c, tax) {
        return 'The same money in an ordinary investment account ends near ' + c.fmtShort(tax.final) + ' once dividends tax and capital gains tax are paid.';
      }
    }
  };
})();
