// Each test below quotes the IRS rule it checks. Sources:
//   Retirement topics - IRA contribution limits: https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits
//   Retirement plans FAQs regarding IRAs:       https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras
//   IR-2025-111, 2026 limits:                   https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500
//   Roth IRAs:                                  https://www.irs.gov/retirement-plans/roth-iras
//   Publication 590-B:                          https://www.irs.gov/publications/p590b
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../us/model.js');

const plan = (o) => M.clampState(Object.assign({}, M.DEFAULTS, o));

describe('Limits before 2015, from each year\'s Publication 590', () => {
  test('590 (1998): "Beginning in 1998, regardless of your age, you may be able to establish and contribute to a new individual retirement plan called a Roth IRA"', () => {
    assert.equal(M.FIELDS.startYear.min, 1998);
    assert.equal(plan({ startYear: 1990 }).startYear, 1998, 'an earlier start year is moved to 1998');
  });
  test('590 (1998 to 2001): "for Roth IRAs, the contribution limit is the lesser of $2,000 or your taxable compensation" - and no catch-up yet', () => {
    for (const y of [1998, 1999, 2000, 2001]) { assert.equal(M.limitFor(y, 30), 2000); assert.equal(M.limitFor(y, 55), 2000); }
  });
  test('590 (2002 to 2004): "$3,000 ($3,500 if 50 or older)"', () => {
    for (const y of [2002, 2003, 2004]) { assert.equal(M.limitFor(y, 30), 3000); assert.equal(M.limitFor(y, 50), 3500); }
  });
  test('590 (2005): "$4,000 ($4,500 if you are age 50 or older)"', () => {
    assert.equal(M.limitFor(2005, 30), 4000); assert.equal(M.limitFor(2005, 50), 4500);
  });
  test('590 (2006 and 2007): "$4,000 ($5,000 if you are age 50 or older)"', () => {
    for (const y of [2006, 2007]) { assert.equal(M.limitFor(y, 30), 4000); assert.equal(M.limitFor(y, 50), 5000); }
  });
  test('590 (2008 to 2012): "$5,000 ($6,000 if you are age 50 or older)"', () => {
    for (const y of [2008, 2009, 2010, 2011, 2012]) { assert.equal(M.limitFor(y, 30), 5000); assert.equal(M.limitFor(y, 50), 6000); }
  });
  test('590 (2013) and 590-A (2014): "$5,500 ($6,500 if you are age 50 or older)"', () => {
    for (const y of [2013, 2014]) { assert.equal(M.limitFor(y, 30), 5500); assert.equal(M.limitFor(y, 50), 6500); }
  });
  test('A plan maxed out from 1998 at 45 follows every increase, and gets the catch-up once it exists and they are 50', () => {
    const rows = M.simulate(plan({ startYear: 1998, age: 45, contrib: 2000, until: 75, end: 76 })).rows;
    const at = y => rows.find(r => r.year === y).deposit;
    assert.deepEqual([1998, 2001, 2002, 2003, 2005, 2006, 2008, 2013, 2019, 2023, 2024, 2026].map(at),
      [2000, 2000, 3000, 3500, 4500, 5000, 6000, 6500, 7000, 7500, 8000, 8600], 'turns 50 in 2003');
  });
});

describe('Annual IRA limits by year', () => {
  test('FAQ: "The annual contribution limit for 2015, 2016, 2017 and 2018 is $5,500, or $6,500 if you\'re age 50 or older"', () => {
    for (const y of [2015, 2016, 2017, 2018]) { assert.equal(M.limitFor(y, 30), 5500); assert.equal(M.limitFor(y, 50), 6500); }
  });
  test('FAQ: "(2019, 2020, 2021, and 2022 is $6,000, or $7,000 if you\'re age 50 or older)"', () => {
    for (const y of [2019, 2020, 2021, 2022]) { assert.equal(M.limitFor(y, 30), 6000); assert.equal(M.limitFor(y, 50), 7000); }
  });
  test('"For 2023 ... $6,500 ($7,500 if you\'re age 50 or older)"', () => {
    assert.equal(M.limitFor(2023, 30), 6500); assert.equal(M.limitFor(2023, 50), 7500);
  });
  test('"For 2025 and 2024 ... $7,000 ($8,000 if you\'re age 50 or older)"', () => {
    for (const y of [2024, 2025]) { assert.equal(M.limitFor(y, 30), 7000); assert.equal(M.limitFor(y, 50), 8000); }
  });
  test('"For 2026 ... $7,500 ($8,600 if you\'re age 50 or older)"', () => {
    assert.equal(M.limitFor(2026, 30), 7500); assert.equal(M.limitFor(2026, 50), 8600);
  });
  test('IR-2025-111: the IRA catch-up "is increased to $1,100, up from $1,000 for 2025"', () => {
    assert.equal(M.bandFor(2025).catchUp, 1000);
    assert.equal(M.bandFor(2026).catchUp, 1100);
  });
  test('Years after 2026 keep the 2026 limits, since the page does not guess future increases', () => {
    assert.equal(M.limitFor(2040, 30), 7500); assert.equal(M.limitFor(2040, 55), 8600);
  });
  test('No year is ever allowed a deposit above its own limit for that age, whatever the plan says', () => {
    for (const startYear of [1998, 2002, 2005, 2015, 2019, 2023, 2024, 2026]) for (const age of [20, 45, 50, 62]) {
      const r = M.simulate(plan({ startYear, age, contrib: 99999, until: age + 30, end: age + 31 }));
      for (const row of r.rows) assert.ok(row.deposit <= M.limitFor(row.year, row.age) + 1e-9, row.year + ' at ' + row.age);
    }
  });
  test('A plan at the limit follows it as the IRS raises it, and adds the catch-up from 50', () => {
    const rows = M.simulate(plan({ startYear: 2015, age: 40, contrib: 5500, until: 70, end: 71 })).rows;
    const at = y => rows.find(r => r.year === y).deposit;
    assert.deepEqual([at(2015), at(2019), at(2023), at(2024), at(2025), at(2026)], [5500, 6000, 6500, 7000, 8000, 8600],
      'turns 50 in 2025, so the catch-up applies from then');
    const fixed = M.simulate(plan({ startYear: 2015, age: 40, contrib: 3000, until: 70, end: 71 })).rows;
    for (const r of fixed.slice(0, 31)) assert.equal(r.deposit, 3000);
  });
});

describe('Who can contribute, and how much in total', () => {
  test('"the total contributions you make each year to all of your traditional IRAs and Roth IRAs" share one limit', () => {
    const r = M.simulate(plan({}));
    const byYear = new Map();
    for (const row of r.rows) byYear.set(row.year, (byYear.get(row.year) || 0) + row.deposit);
    for (const [year, dep] of byYear) assert.ok(dep <= M.limitFor(year, r.rows.find(x => x.year === year).age) + 1e-9);
  });
  test('Roth IRAs: "You can make contributions to your Roth IRA after you reach age 70 1/2"', () => {
    const r = M.simulate(plan({ age: 72, contrib: 8600, until: 75, end: 80 }));
    assert.equal(r.rows[0].deposit, 8600);
    assert.equal(r.contributed, 4 * 8600);
  });
  test('There is no lifetime limit: a plan keeps contributing until the age it stops', () => {
    assert.equal(M.LIMIT.lifetime, Infinity);
    const r = M.simulate(plan({}));
    assert.equal(r.limit, -1, 'no lifetime limit milestone');
    assert.equal(r.contributed, 20 * 7500 + 16 * 8600, 'ages 30 to 49 at $7,500, 50 to 65 at $8,600');
  });
  test('Roth IRAs: "You cannot deduct contributions to a Roth IRA" - each deposit goes in at its face value', () => {
    const r = M.simulate(plan({}));
    assert.equal(r.rows[0].opening, 7500);
  });
  test('IR-2025-111: the 2026 Roth income phase-out ranges are recorded as published', () => {
    assert.deepEqual(M.PHASE_OUT_2026.single, [153000, 168000]);
    assert.deepEqual(M.PHASE_OUT_2026.marriedJoint, [242000, 252000]);
    assert.deepEqual(M.PHASE_OUT_2026.marriedSeparate, [0, 10000]);
  });
});

describe('Withdrawals', () => {
  test('590-B: "You don\'t include in your gross income qualified distributions" - growth and withdrawals are never taxed', () => {
    const s = plan({});
    const g = (s.gross - s.fees) / 100;
    const r = M.simulate(s);
    for (const row of r.rows) {
      assert.ok(Math.abs(row.growth - (row.opening - row.withdrawal) * g) < 1e-6);
      if (row.withdrawal) assert.ok(Math.abs(row.withdrawal - row.opening * s.rate / 100) < 1e-6);
    }
    const sum = r.rows.reduce((a, x) => a + x.growth, 0);
    assert.ok(Math.abs(r.contributed + sum - r.drawn - r.endValue) < 1e-3, 'deposits + growth - drawn = end value');
  });
  test('590-B: qualified means "made on or after the date you reach age 59 1/2" - drawing from 66 is all qualified', () => {
    assert.equal(M.simulate(plan({})).early, null);
  });
  test('Drawing before 59 1/2 is flagged as early, and a year at 59 counts as early', () => {
    const r = M.simulate(plan({ until: 55 }));
    assert.deepEqual([r.early.firstAge, r.early.lastAge, r.early.years, r.early.tooYoung, r.early.tooSoon], [56, 59, 4, true, false]);
  });
  test('590-B: qualified means "after the 5-year period beginning with the first tax year for which a contribution was made"', () => {
    // First deposit 2026 at 62, last at 63, withdrawals from 64 in 2028. Qualified from 2031.
    const r = M.simulate(plan({ age: 62, until: 63, end: 80 }));
    assert.deepEqual([r.early.firstAge, r.early.lastAge, r.early.years, r.early.tooYoung, r.early.tooSoon], [64, 66, 3, false, true]);
  });
  test('590-B: "The minimum distribution rules that apply to traditional IRAs don\'t apply to Roth IRAs while the owner is alive"', () => {
    const r = M.simulate(plan({ rate: 0 }));
    assert.equal(r.drawn, 0);
    for (const row of r.rows) assert.equal(row.withdrawal, 0);
  });
  test('590-B: a withdrawal that is not qualified may owe "the 10% additional tax" - the rate is recorded for the warning', () => {
    assert.equal(M.LIMIT.earlyPenalty, 0.1);
  });
});

describe('Comparison and default plan', () => {
  test('The regular-account comparison taxes dividends and gains, so it always ends lower', () => {
    for (const o of [{}, { gross: 10 }, { startYear: 2015, contrib: 5500 }]) {
      const s = plan(o);
      assert.ok(M.simulateTaxable(s).final < M.simulate(s).final);
    }
  });
  test('Default plan (30, 2026, $7,500, 7.00% less 0.10%, until 65) reaches $1,199,801 at 65', () => {
    const r = M.simulate(plan({}));
    assert.ok(Math.abs(r.final - 1199801) < 1, String(r.final));
    assert.equal(r.rows[r.outpace].age, 40);
    assert.equal(r.rows[r.half].age, 57);
  });
});
