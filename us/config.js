/*
 * United States: the Roth IRA rules (us/model.js) and the page's IRS wording.
 * Loaded after model.js and before ../shared/calculator.js, which describes each entry.
 */
(function () {
  'use strict';
  const M = window.ROTH;
  const LATEST = M.ANNUAL_LIMITS[M.ANNUAL_LIMITS.length - 1];
  const CATCH_UP_AGE = M.LIMIT.catchUpAge;

  window.TFSC_CONFIG = {
    model: M,
    money: { symbol: '$', group: ',', units: { k: 'K', m: 'M', bn: 'B', tn: 'T' } },
    text: {
      // The rules summary after the hint. A plan at the limit follows the IRS's increases and the
      // catch-up from 50, so say which of those applies.
      limits(c) {
        const S = c.S, lim = c.limitFor(S.startYear, S.age);
        // Before 2002 there was no catch-up, so only mention it when it adds something.
        const hasCatchUp = M.bandFor(S.startYear).catchUp > 0;
        const older = S.age >= CATCH_UP_AGE && hasCatchUp;
        const reaches50 = S.age < CATCH_UP_AGE && S.until >= CATCH_UP_AGE;
        const risesWithIrs = M.bandFor(S.startYear).limit < LATEST.limit;
        // Whether any deposit year will qualify for the catch-up (50 or over, from 2002).
        const catchUpLater = c.base.rows.some(r => r.planned > 0 && r.age >= CATCH_UP_AGE && M.bandFor(r.year).catchUp > 0);
        let s = 'IRS limit for ' + S.startYear + ': ' + c.fmtR(lim) + ' a year' + (older ? ', including the catch-up for ' + CATCH_UP_AGE + ' and over' : '');
        if (c.base.atMax && risesWithIrs) {
          s += ' &middot; you&rsquo;re maxing it out, so your deposit follows the limit up to ' + c.fmtR(LATEST.limit + (older ? LATEST.catchUp : 0)) + ' in ' + LATEST.from +
            (catchUpLater && !older ? ', plus the catch-up for ' + CATCH_UP_AGE + ' and over' : '');
        } else if (c.base.atMax && reaches50) {
          const yearAt50 = S.startYear + CATCH_UP_AGE - S.age;
          s += ' &middot; you&rsquo;re maxing it out, so your deposit rises to ' + c.fmtR(c.limitFor(yearAt50, CATCH_UP_AGE)) + ' at ' + CATCH_UP_AGE;
        } else if (S.age < CATCH_UP_AGE && hasCatchUp) {
          s += ', ' + c.fmtR(c.limitFor(S.startYear, CATCH_UP_AGE)) + ' from ' + CATCH_UP_AGE;
        }
        return s + ' &middot; no lifetime limit';
      },
      // Only call the income tax-free when every withdrawal is qualified.
      drawCap(c) {
        return 'From ' + (c.S.until + 1) + ' · a month' + (c.base.early ? '' : ', tax-free');
      },
      // Withdrawals that aren't qualified owe tax on the growth taken out. The 10% penalty only applies
      // under 59 1/2: Publication 590-B lists "You have reached age 59 1/2" as an exception to it.
      drawNote(c) {
        const e = c.base.early;
        if (!e) return '';
        const lead = e.years === 1 ? 'Your first year of withdrawals comes ' : 'Your first ' + e.years + ' years of withdrawals come ';
        const why = e.tooYoung && e.tooSoon ? 'before 59½ or within five tax years of your first deposit'
          : e.tooYoung ? 'before 59½' : 'within five tax years of your first deposit';
        const owe = e.tooYoung && e.tooSoon ? 'so you could owe tax on the growth you take out, plus a 10% penalty while you’re under 59½.'
          : e.tooYoung ? 'so you could owe tax and a 10% penalty on the growth you take out.'
          : 'so you could owe tax on the growth you take out.';
        return lead + why + ', ' + owe;
      },
      taxableTile(c, tax) {
        return 'The same money in a regular brokerage account ends near ' + c.fmtShort(tax.final) + ' once you’ve paid tax on the dividends and gains.';
      }
    }
  };
})();
