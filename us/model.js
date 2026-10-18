/*
 * United States Roth IRA model. Same shape as ../model.js, so the shared interface can use it.
 *
 * Sources for the rules encoded here:
 *  - IRS, Retirement topics - IRA contribution limits:
 *    https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits
 *  - IRS, Retirement plans FAQs regarding IRAs:
 *    https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras
 *  - IRS news release IR-2025-111, 2026 limits:
 *    https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
 *  - IRS, Roth IRAs: https://www.irs.gov/retirement-plans/roth-iras
 *  - IRS Publication 590-B, Distributions from IRAs: https://www.irs.gov/publications/p590b
 *  - IRS Publication 590 for 1998 to 2013 and 590-A for 2014, for the limits in those years:
 *    https://www.irs.gov/pub/irs-prior/p590--1998.pdf (and --1999 to --2013), p590a--2014.pdf
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ROTH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // IRA limits by tax year: the base amount, and the extra catch-up allowed from age 50. The limit is
  // the total across all of a person's traditional and Roth IRAs. Roth IRAs began in 1998, and the
  // catch-up in 2002. Years after the last entry keep its values; the IRS adjusts them for inflation,
  // but the page doesn't guess future increases.
  const ANNUAL_LIMITS = [
    { from: 1998, limit: 2000, catchUp: 0,    years: '1998 to 2001' },
    { from: 2002, limit: 3000, catchUp: 500,  years: '2002 to 2004' },
    { from: 2005, limit: 4000, catchUp: 500,  years: '2005' },
    { from: 2006, limit: 4000, catchUp: 1000, years: '2006 and 2007' },
    { from: 2008, limit: 5000, catchUp: 1000, years: '2008 to 2012' },
    { from: 2013, limit: 5500, catchUp: 1000, years: '2013 to 2018' },
    { from: 2019, limit: 6000, catchUp: 1000, years: '2019 to 2022' },
    { from: 2023, limit: 6500, catchUp: 1000, years: '2023' },
    { from: 2024, limit: 7000, catchUp: 1000, years: '2024 and 2025' },
    { from: 2026, limit: 7500, catchUp: 1100, years: '2026 onwards' }
  ];

  // There is no lifetime cap on Roth IRA contributions. A qualified, tax-free withdrawal comes after
  // the account's first five tax years and on or after age 59 and a half (Publication 590-B).
  const LIMIT = { lifetime: Infinity, catchUpAge: 50, qualifiedAge: 59.5, qualifiedYears: 5, earlyPenalty: 0.1 };

  // 2026 income ranges over which a Roth contribution shrinks to nothing (IR-2025-111). Not modelled:
  // the page assumes income below the range, and says so.
  const PHASE_OUT_2026 = {
    single: [153000, 168000],
    marriedJoint: [242000, 252000],
    marriedSeparate: [0, 10000]
  };

  function bandFor(year) {
    let b = ANNUAL_LIMITS[0];
    for (const a of ANNUAL_LIMITS) if (year >= a.from) b = a;
    return b;
  }
  // The most a person can put in for a tax year: the base limit, plus the catch-up from age 50.
  function limitFor(year, age) {
    const b = bandFor(year);
    return b.limit + (age >= LIMIT.catchUpAge ? b.catchUp : 0);
  }

  // Assumptions for the regular brokerage account comparison. Not IRS rules; stated on the page.
  // 15% is the federal rate most people pay on qualified dividends and long-term gains.
  const TAXABLE = { divYield: 0.015, divTax: 0.15, cgt: 0.15 };

  const FIELDS = {
    age:       { min: 1,    max: 99,    step: 1 },
    startYear: { min: 1998, max: 2080,  step: 1 },
    contrib:   { min: 0,    max: Math.max.apply(null, ANNUAL_LIMITS.map(a => a.limit + a.catchUp)), step: 100 },
    gross:     { min: 0,    max: 20,    step: 0.05, prec: 2 },
    fees:      { min: 0,    max: 5,     step: 0.01, prec: 2 },
    until:     { min: 2,    max: 100,   step: 1 },
    rate:      { min: 0,    max: 20,    step: 0.25, prec: 2 },
    end:       { min: 3,    max: 110,   step: 1 }
  };
  const DEFAULTS = { age: 30, startYear: 2026, contrib: 7500, gross: 7, fees: 0.1, until: 65, rate: 4, end: 90 };

  // Normalises a plan: rounds to each field's step, clamps to its range, caps the yearly deposit at the
  // starting limit for that year and age, and keeps age < until < end.
  function clampState(s) {
    const o = Object.assign({}, s);
    for (const k in FIELDS) {
      const f = FIELDS[k];
      let v = Number(o[k]); if (!Number.isFinite(v)) v = f.min;
      v = f.prec ? Number(v.toFixed(f.prec)) : Math.round(v / f.step) * f.step;
      const max = k === 'contrib' ? limitFor(o.startYear, o.age) : f.max;
      o[k] = Math.min(max, Math.max(f.min, v));
    }
    if (o.until <= o.age) o.until = o.age + 1;
    if (o.end <= o.until) o.end = o.until + 1;
    if (o.end > FIELDS.end.max) { o.end = FIELDS.end.max; o.until = Math.min(o.until, o.end - 1); }
    return o;
  }

  // Year-by-year projection.
  //  - Deposits go in at the start of each year up to and including age `until`, capped by that
  //    year's IRA limit for the person's age. A plan at its starting limit follows the limit as it
  //    rises, including the catch-up from 50; a plan below it stays fixed.
  //  - From the year after `until`, a withdrawal of `rate`% of the opening balance is taken before
  //    growth. Growth is (opening - withdrawal) x (gross - fees). Nothing is taxed in the account.
  //  - Withdrawals before 59 and a half, or within five tax years of the first deposit, aren't
  //    qualified. The projection still treats them as tax-free but lists them in `early`.
  function simulate(s) {
    const g = (s.gross - s.fees) / 100;
    const rows = []; let cum = 0, prev = 0, growthSum = 0, drawn = 0;
    const n = s.end - s.age + 1, untilIdx = s.until - s.age;
    const atMax = s.contrib >= limitFor(s.startYear, s.age);
    for (let i = 0; i < n; i++) {
      const year = s.startYear + i, age = s.age + i, limit = limitFor(year, age), drawing = i > untilIdx;
      const planned = drawing ? 0 : (atMax ? limit : Math.min(s.contrib, limit));
      const deposit = Math.max(0, Math.min(planned, LIMIT.lifetime - cum));
      cum += deposit;
      const opening = prev + deposit;
      const withdrawal = drawing ? opening * s.rate / 100 : 0;
      const growth = (opening - withdrawal) * g, closing = opening - withdrawal + growth;
      rows.push({ i, age, year, limit, planned, deposit, cum, opening, withdrawal, growth, closing });
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
    // Years whose withdrawal isn't qualified. Ages are whole years, so a year at 59 counts as early.
    const firstDepositYear = cum > 0 ? s.startYear : null;
    const early = rows.filter(x => x.withdrawal > 0 && (x.age < Math.ceil(LIMIT.qualifiedAge) ||
      firstDepositYear === null || x.year < firstDepositYear + LIMIT.qualifiedYears));
    r.early = early.length ? {
      years: early.length,
      firstAge: early[0].age,
      lastAge: early[early.length - 1].age,
      tooYoung: early.some(x => x.age < Math.ceil(LIMIT.qualifiedAge)),
      tooSoon: early.some(x => firstDepositYear === null || x.year < firstDepositYear + LIMIT.qualifiedYears)
    } : null;
    return r;
  }

  // The same deposits in a regular brokerage account: dividends taxed each year, gains taxed on
  // selling. Runs over the saving years only. Leaves out state tax.
  function simulateTaxable(s) {
    const g = (s.gross - s.fees) / 100;
    const rows = []; let cum = 0, prev = 0;
    const n = s.until - s.age + 1;
    const atMax = s.contrib >= limitFor(s.startYear, s.age);
    for (let i = 0; i < n; i++) {
      const limit = limitFor(s.startYear + i, s.age + i);
      const deposit = Math.max(0, Math.min(atMax ? limit : Math.min(s.contrib, limit), LIMIT.lifetime - cum)); cum += deposit;
      const opening = prev + deposit;
      const closing = opening + opening * g - opening * TAXABLE.divYield * TAXABLE.divTax;
      rows.push({ age: s.age + i, closing }); prev = closing;
    }
    const final = prev - Math.max(0, prev - cum) * TAXABLE.cgt;
    return { rows, final, preCgt: prev };
  }

  return { ANNUAL_LIMITS, LIMIT, PHASE_OUT_2026, bandFor, limitFor, TAXABLE, FIELDS, DEFAULTS, clampState, simulate, simulateTaxable };
});
