# Tax-free savings calculator

**Live site:** https://azadmotala.github.io/tax-free-calculator/

**US Roth IRA version:** https://azadmotala.github.io/tax-free-calculator/us/

A calculator for South African tax-free savings accounts, with a US version for Roth IRAs. The flag in the header switches between them. Your plan is a sentence: drag the numbers in it, or click to type, and the page redraws the balance year by year, marks the milestones along the way, and shows what each choice costs.

## What it shows

- **Plan:** the balance at the age you stop adding, how much of it is growth, and three priced insights: waiting a year, paying 1% more in fees, and what tax-free saves you against an ordinary investment account. A second sentence sets the drawdown: the share of the balance you take each year and the age the plan runs to, with the monthly income it pays written into the sentence.
- **Year by year:** the full table of deposits, growth and closing balance.
- **What if:** alternative scenarios drawn on the same chart with their end values.

## How it calculates

- Deposits go in at the start of each year and grow once a year at the return minus fees.
- Withdrawals start the year after you stop adding. Each one is a fixed share of that year's opening balance, taken before growth, as in the original spreadsheet.
- SARS annual limits follow the year of each deposit: R30 000 from March 2015, R33 000 from March 2017, R36 000 from March 2020 and R46 000 from March 2026, with a R500 000 lifetime limit. A plan at the limit follows it as it rises.
- The ordinary-account comparison assumes a 3% dividend yield taxed at 20% and 18% capital gains tax when you cash out.

The US version follows the same method with IRS rules:

- IRA limits follow the year of each deposit, from $2,000 when Roth IRAs began in 1998 to $7,500 from 2026, each checked against that year's IRS Publication 590. From 2002 there's a catch-up for 50 and over: $500, then $1,000 from 2006 and $1,100 from 2026. There's no lifetime limit. Years after 2026 keep the 2026 limits.
- It assumes income below the Roth phase-out and earnings at least equal to the deposits.
- Withdrawals are treated as tax-free. The page flags any taken before 59½ or within five years of the first deposit, which can owe tax on growth plus a 10% penalty.
- The brokerage-account comparison assumes a 1.5% dividend yield and 15% federal tax on dividends and gains, and leaves out state tax.

## Tests

The SARS rules are written up as tests in `test/sars-rules.test.js`, each one quoting the rule it checks from the [SARS Tax Free Investments page](https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/) or the [Budget 2026 FAQ](https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/). The IRS rules are in `test/irs-rules.test.js`, quoting [IRA contribution limits](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits), the [IRA FAQs](https://www.irs.gov/retirement-plans/retirement-plans-faqs-regarding-iras), the [2026 limits release](https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500) and [Publication 590-B](https://www.irs.gov/publications/p590b). Both run against the same model files the pages use, with no dependencies:

```bash
node --test
```

GitHub Actions runs them on every push and pull request, and only deploys to GitHub Pages when they pass.

## How the files fit together

The interface is shared, so another country's page can reuse it. Each country brings its own rules and wording.

- `shared/calculator.js` and `shared/calculator.css` are the interface: the sentence inputs, chart, scrubber card, tiles, table, what-if scenarios, theme toggle and share link.
- `index.html` is the South African page: its wording, labels and footer.
- `model.js` holds the SARS rules. The page and the tests both use it.
- `config.js` gives the shared interface the rand formatting and the wording that depends on SARS rules, like the limits in the hint and the lifetime-limit note.
- `us/` holds the US page in the same three parts: `index.html`, `model.js` with the IRS rules, and `config.js` with dollar formatting and the IRS wording.

## Updating

Edit, commit, push. The workflow runs the rule tests, checks that every file the page uses is included, and deploys in a minute or two.
