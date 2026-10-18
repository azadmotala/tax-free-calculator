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
    for (const startYear of [2015, 2019, 2023, 2024, 2026]) for (const age of [20, 45, 50, 62]) {
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
