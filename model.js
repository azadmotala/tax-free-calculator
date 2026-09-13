/*
 * Tax-free savings model. One file, shared by index.html (browser) and test/ (Node).
 *
 * Sources for the rules encoded here:
 *  - SARS, Tax Free Investments: https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/
 *  - SARS, Budget 2026 FAQ:     https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TFSA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // SARS annual limits, keyed by the tax year in which a deposit is made. A South African tax year
  // runs from 1 March, so a deposit made in the tax year starting 1 March Y falls in the Y+1 year
  // of assessment. SARS: "The annual limits for the 2016 and 2017 years of assessment amounted to
  // R30 000. For the 2018 to 2020 years of assessment, these were increased to R33 000. For the
  // 2021 to 2026 year of assessment, the annual limit amounted to R36 000. With effect from the
  // 2027 year of assessment, the annual limit is R46 000."
  const ANNUAL_LIMITS = [
    { from: 2015, limit: 30000, yearsOfAssessment: '2016 to 2017' },
    { from: 2017, limit: 33000, yearsOfAssessment: '2018 to 2020' },
    { from: 2020, limit: 36000, yearsOfAssessment: '2021 to 2026' },
    { from: 2026, limit: 46000, yearsOfAssessment: '2027 onwards' }
  ];

  // SARS: "There is also a lifetime limit of R500 000 per person." Budget 2026 FAQ: unchanged.
  // SARS: "There is a 'penalty' (in the form of normal tax payable) of 40% on the excess amount
  // above the annual and the lifetime limits." The model never lets a deposit exceed either limit,
  // so the penalty rate is recorded here for completeness and tested as never applying.
  const LIMIT = { lifetime: 500000, penaltyRate: 0.4 };

  function limitFor(year) {
    let l = ANNUAL_LIMITS[0].limit;
    for (const a of ANNUAL_LIMITS) if (year >= a.from) l = a.limit;
    return l;
  }
  function limitForYearOfAssessment(yoa) { return limitFor(yoa - 1); }

  // Assumptions for the "ordinary investment account" comparison. Not SARS rules; stated on the page.
  const TAXABLE = { divYield: 0.03, divTax: 0.2, cgt: 0.18 };

  const FIELDS = {
    age:       { min: 1,    max: 99,    step: 1 },
    startYear: { min: 2015, max: 2080,  step: 1 },
    contrib:   { min: 0,    max: Math.max.apply(null, ANNUAL_LIMITS.map(a => a.limit)), step: 500 },
    gross:     { min: 0,    max: 20,    step: 0.05, prec: 2 },
    fees:      { min: 0,    max: 5,     step: 0.01, prec: 2 },
    until:     { min: 2,    max: 100,   step: 1 },
    rate:      { min: 0,    max: 20,    step: 0.25, prec: 2 },
    end:       { min: 3,    max: 110,   step: 1 }
  };
  const DEFAULTS = { age: 30, startYear: 2026, contrib: 46000, gross: 8.37, fees: 0.37, until: 65, rate: 4, end: 90 };

  // Normalises a plan: rounds to each field's step, clamps to its range, caps the yearly deposit at
  // the start year's SARS limit, and keeps age < until < end.
  function clampState(s) {
    const o = Object.assign({}, s);
    for (const k in FIELDS) {
      const f = FIELDS[k];
      let v = Number(o[k]); if (!Number.isFinite(v)) v = f.min;
      v = f.prec ? Number(v.toFixed(f.prec)) : Math.round(v / f.step) * f.step;
      const max = k === 'contrib' ? limitFor(o.startYear) : f.max;
      o[k] = Math.min(max, Math.max(f.min, v));
    }
    if (o.until <= o.age) o.until = o.age + 1;
    if (o.end <= o.until) o.end = o.until + 1;
    if (o.end > FIELDS.end.max) { o.end = FIELDS.end.max; o.until = Math.min(o.until, o.end - 1); }
    return o;
  }

  // Year-by-year projection.
  //  - Deposits go in at the start of each year up to and including age `until`, capped by that
  //    year's SARS annual limit and the R500 000 lifetime limit. A plan at the start year's limit
  //    follows the limit as it rises; a plan below it stays fixed.
  //  - From the year after `until`, a withdrawal of `rate`% of the opening balance is taken before
  //    growth. Withdrawals are tax-free and do not restore contribution room.
  //  - Growth is (opening - withdrawal) x (gross - fees). Nothing inside the account is taxed.
  function simulate(s) {
    const g = (s.gross - s.fees) / 100;
    const rows = []; let cum = 0, prev = 0, growthSum = 0, drawn = 0;
    const n = s.end - s.age + 1, untilIdx = s.until - s.age;
    const atMax = s.contrib >= limitFor(s.startYear);
    for (let i = 0; i < n; i++) {
      const year = s.startYear + i, limit = limitFor(year), drawing = i > untilIdx;
      const planned = drawing ? 0 : (atMax ? limit : Math.min(s.contrib, limit));
      const deposit = Math.max(0, Math.min(planned, LIMIT.lifetime - cum));
      cum += deposit;
      const opening = prev + deposit;
      const withdrawal = drawing ? opening * s.rate / 100 : 0;
      const growth = (opening - withdrawal) * g, closing = opening - withdrawal + growth;
      rows.push({ i, age: s.age + i, year, limit, planned, deposit, cum, opening, withdrawal, growth, closing });
      if (!drawing) growthSum += growth;
      drawn += withdrawal; prev = closing;
    }
    const final = rows[untilIdx].closing;
    const r = { rows, n, untilIdx, final, endValue: prev, drawn, contributed: cum, growth: growthSum, atMax };
    r.firstDraw = untilIdx + 1 < n ? rows[untilIdx + 1].withdrawal : 0;
    const acc = rows.slice(0, untilIdx + 1);
    r.outpace = acc.findIndex(x => x.planned > 0 && x.growth > x.planned);
    r.limit = rows.findIndex(x => x.cum >= LIMIT.lifetime);
    r.half = final > 0 ? acc.findIndex(x => x.closing >= final / 2) : -1;
    if (r.half <= 0 || r.half >= untilIdx) r.half = -1;
    r.draw = s.rate > 0 && untilIdx < n - 1 ? untilIdx : -1;
    return r;
  }

  // The same deposits in an ordinary investment account: dividends taxed each year, capital gains
  // taxed on exit. Runs over the saving years only.
  function simulateTaxable(s) {
    const g = (s.gross - s.fees) / 100;
    const rows = []; let cum = 0, prev = 0;
    const n = s.until - s.age + 1;
    const atMax = s.contrib >= limitFor(s.startYear);
    for (let i = 0; i < n; i++) {
      const limit = limitFor(s.startYear + i);
      const deposit = Math.max(0, Math.min(atMax ? limit : Math.min(s.contrib, limit), LIMIT.lifetime - cum)); cum += deposit;
      const opening = prev + deposit;
      const closing = opening + opening * g - opening * TAXABLE.divYield * TAXABLE.divTax;
      rows.push({ age: s.age + i, closing }); prev = closing;
    }
    const final = prev - Math.max(0, prev - cum) * TAXABLE.cgt;
    return { rows, final, preCgt: prev };
  }

  return { ANNUAL_LIMITS, LIMIT, limitFor, limitForYearOfAssessment, TAXABLE, FIELDS, DEFAULTS, clampState, simulate, simulateTaxable };
});
