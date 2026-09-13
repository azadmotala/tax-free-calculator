// Each test below quotes the SARS rule it checks. Sources:
//   SARS, Tax Free Investments: https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/
//   SARS, Budget 2026 FAQ:      https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/
'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../model.js');

const plan = (o) => M.clampState(Object.assign({}, M.DEFAULTS, o));
const sum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);

describe('Annual limits by year of assessment', () => {
  test('"The annual limits for the 2016 and 2017 years of assessment amounted to R30 000"', () => {
    assert.equal(M.limitForYearOfAssessment(2016), 30000);
    assert.equal(M.limitForYearOfAssessment(2017), 30000);
  });
  test('"For the 2018 to 2020 years of assessment, these were increased to R33 000"', () => {
    for (const y of [2018, 2019, 2020]) assert.equal(M.limitForYearOfAssessment(y), 33000);
  });
  test('"For the 2021 to 2026 year of assessment, the annual limit amounted to R36 000"', () => {
    for (const y of [2021, 2022, 2023, 2024, 2025, 2026]) assert.equal(M.limitForYearOfAssessment(y), 36000);
  });
  test('"With effect from the 2027 year of assessment, the annual limit is R46 000"', () => {
    assert.equal(M.limitForYearOfAssessment(2027), 46000);
    assert.equal(M.limitForYearOfAssessment(2040), 46000);
  });
  test('Budget 2026: "From 1 March 2026, the annual TFSA contribution limit increases to R46 000 (up from R36 000)"', () => {
    assert.equal(M.limitFor(2025), 36000, 'a deposit in the tax year from 1 March 2025');
    assert.equal(M.limitFor(2026), 46000, 'a deposit in the tax year from 1 March 2026');
  });
  test('Tax-free investments have been available since 1 March 2015, so 2015 is the earliest start year', () => {
    assert.equal(M.FIELDS.startYear.min, 2015);
    assert.equal(M.limitFor(2015), 30000);
  });
  test('No year is ever allowed a deposit above its own limit, whatever the plan says', () => {
    for (const startYear of [2015, 2017, 2020, 2025, 2026]) {
      const r = M.simulate(plan({ startYear, contrib: 46000, age: 20, until: 60, end: 61 }));
      for (const row of r.rows) assert.ok(row.deposit <= row.limit + 1e-9, `${row.year}: ${row.deposit} > ${row.limit}`);
    }
  });
  test('A plan at the limit follows it as SARS raises it; a plan below the limit stays fixed', () => {
    const atMax = M.simulate(plan({ startYear: 2015, contrib: 30000, age: 20, until: 60, end: 61 })).rows;
    const byYear = Object.fromEntries(atMax.map(r => [r.year, r.deposit]));
    assert.deepEqual([byYear[2015], byYear[2017], byYear[2020], byYear[2026]], [30000, 33000, 36000, 46000]);
    const fixed = M.simulate(plan({ startYear: 2015, contrib: 20000, age: 20, until: 60, end: 61 })).rows;
    for (const r of fixed.slice(0, 15)) assert.equal(r.deposit, 20000);
  });
});

describe('Lifetime limit', () => {
  test('"There is also a lifetime limit of R500 000 per person. This means that the total investments can never exceed R500 000 per person"', () => {
    assert.equal(M.LIMIT.lifetime, 500000);
    for (const o of [{}, { startYear: 2015, contrib: 30000 }, { age: 1, until: 99, end: 100 }, { contrib: 12000 }]) {
      const r = M.simulate(plan(o));
      assert.ok(r.contributed <= 500000 + 1e-9);
      for (const row of r.rows) assert.ok(row.cum <= 500000 + 1e-9);
    }
  });
  test('Budget 2026: "The lifetime contribution ceiling remains R500 000"', () => {
    const r = M.simulate(plan({ startYear: 2026 }));
    assert.equal(r.contributed, 500000);
  });
  test('The final deposit is only what is left of the R500 000, then deposits stop', () => {
    const r = M.simulate(plan({}));
    const last = r.rows[r.limit];
    assert.equal(last.year, 2036);
    assert.equal(last.deposit, 40000, '10 x R46 000 = R460 000, so R40 000 remains');
    for (const row of r.rows.slice(r.limit + 1)) assert.equal(row.deposit, 0);
  });
});

describe('Unused annual limit', () => {
  test('"Any portion of unused annual limit is forfeited (that is, it is not carried forward to the subsequent year of assessment)"', () => {
    // Deposit R20 000 a year against a R46 000 limit: the R26 000 not used never reappears.
    const r = M.simulate(plan({ contrib: 20000 }));
    for (const row of r.rows.slice(0, r.untilIdx + 1)) assert.ok(row.deposit <= 20000);
    assert.equal(r.rows[1].deposit, 20000, 'year two is not 20 000 + the 26 000 unused in year one');
  });
});

describe('Excess contributions', () => {
  test('"There is a penalty ... of 40% on the excess amount above the annual and the lifetime limits" - the model records the rate', () => {
    assert.equal(M.LIMIT.penaltyRate, 0.4);
  });
  test('The yearly deposit input is capped at the start year\'s limit, so the penalty can never apply', () => {
    assert.equal(plan({ startYear: 2026, contrib: 100000 }).contrib, 46000);
    assert.equal(plan({ startYear: 2015, contrib: 46000 }).contrib, 30000);
    assert.equal(plan({ startYear: 2020, contrib: 40000 }).contrib, 36000);
  });
  test('No simulated year ever deposits above its annual limit or takes the total past R500 000', () => {
    for (const o of [{}, { startYear: 2015, contrib: 30000, age: 5, until: 70, end: 80 }, { contrib: 46000, age: 1, until: 99, end: 100 }]) {
      const r = M.simulate(plan(o));
      for (const row of r.rows) {
        assert.ok(row.deposit <= row.limit + 1e-9);
        assert.ok(row.cum <= M.LIMIT.lifetime + 1e-9);
      }
    }
  });
});

describe('Tax treatment', () => {
  test('"Amounts earned in these accounts are free from income tax, dividends tax, and capital gains tax" - growth is never reduced by tax', () => {
    const s = plan({});
    const g = (s.gross - s.fees) / 100;
    const r = M.simulate(s);
    for (const row of r.rows) {
      assert.ok(Math.abs(row.growth - (row.opening - row.withdrawal) * g) < 1e-6);
      assert.ok(Math.abs(row.closing - (row.opening - row.withdrawal + row.growth)) < 1e-6);
    }
  });
  test('Budget 2026: "Withdrawals are also tax-free" - the amount drawn equals the amount that leaves the account', () => {
    const r = M.simulate(plan({ rate: 4 }));
    for (const row of r.rows.slice(r.untilIdx + 1)) {
      assert.ok(Math.abs(row.withdrawal - row.opening * 0.04) < 1e-6);
    }
    assert.ok(Math.abs(r.contributed + sum(r.rows, 'growth') - r.drawn - r.endValue) < 1e-3, 'deposits + growth - drawn = end value');
  });
  test('The ordinary-account comparison does apply dividends tax and capital gains tax, so it always ends lower', () => {
    for (const o of [{}, { gross: 12 }, { startYear: 2015, contrib: 30000 }]) {
      const s = plan(o);
      assert.ok(M.simulateTaxable(s).final < M.simulate(s).final);
    }
  });
});

describe('Withdrawals and contribution room', () => {
  test('SARS: reinvesting withdrawn amounts counts as new contributions - so withdrawing never restores room here', () => {
    const noDraw = M.simulate(plan({ rate: 0 }));
    const draw = M.simulate(plan({ rate: 10 }));
    assert.equal(draw.contributed, noDraw.contributed);
    for (const row of draw.rows.slice(draw.untilIdx + 1)) assert.equal(row.deposit, 0, 'no deposits while drawing');
    const cums = draw.rows.map(r => r.cum);
    for (let i = 1; i < cums.length; i++) assert.ok(cums[i] >= cums[i - 1], 'contributed total never falls');
  });
  test('SARS example: capitalised returns inside the account do not count toward the limits', () => {
    // "Invested R36 000 with R5 000 interest capitalised = R41 000 total; the interest doesn't count toward limits."
    const r = M.simulate(plan({ startYear: 2025, contrib: 36000, age: 30, until: 31, end: 32 }));
    assert.equal(r.rows[0].deposit, 36000);
    assert.ok(r.rows[0].closing > 36000, 'growth was added to the balance');
    assert.equal(r.rows[0].cum, 36000, 'but only the deposit counts toward the limits');
  });
});

describe('Per person, including minors', () => {
  test('"Parents can invest on behalf of their minor child. The minor child will use his/her own annual or lifetime limits" - a plan can start at age 1 with the full limits', () => {
    const s = plan({ age: 1, until: 18, end: 19 });
    assert.equal(s.age, 1);
    const r = M.simulate(s);
    assert.equal(r.rows[0].limit, 46000);
    assert.equal(r.contributed, 500000);
  });
  test('"The annual limitation is an aggregation per every year of assessment" - the model is one person\'s total, never more than one limit per year', () => {
    const r = M.simulate(plan({}));
    const byYear = new Map();
    for (const row of r.rows) byYear.set(row.year, (byYear.get(row.year) || 0) + row.deposit);
    for (const [year, dep] of byYear) assert.ok(dep <= M.limitFor(year) + 1e-9);
  });
});

describe('Agreement with the reviewed spreadsheet', () => {
  test('Default plan (30, 2026, R46 000, 8.37% less 0.37%, until 65) reaches R5 618 953 at 65', () => {
    const r = M.simulate(plan({}));
    assert.ok(Math.abs(r.final - 5618953.5) < 1, String(r.final));
    assert.equal(r.rows[r.limit].age, 40);
    assert.equal(r.rows[r.outpace].age, 39);
    assert.equal(r.rows[r.half].age, 56);
  });
  test('Drawing 4% from 66 pays R18 730 a month to start and leaves R13 868 521 at 90', () => {
    const r = M.simulate(plan({}));
    assert.ok(Math.abs(r.firstDraw / 12 - 18729.84) < 1);
    assert.ok(Math.abs(r.endValue - 13868521.08) < 1);
  });
});
