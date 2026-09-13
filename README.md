# Tax-free savings calculator

**Live site:** https://azadmotala.github.io/tax-free-calculator/

A calculator for South African tax-free savings accounts. Your plan is a sentence: drag the numbers in it, or click to type, and the page redraws the balance year by year, marks the milestones along the way, and shows what each choice costs.

## What it shows

- **Plan:** the balance at the age you stop adding, how much of it is growth, and three priced insights: waiting a year, paying 1% more in fees, and what tax-free saves you against an ordinary investment account. A second sentence sets the drawdown: the share of the balance you take each year and the age the plan runs to, with the monthly income it pays written into the sentence.
- **Year by year:** the full table of deposits, growth and closing balance.
- **What if:** alternative scenarios drawn on the same chart with their end values.

## How it calculates

- Deposits go in at the start of each year and grow once a year at the return minus fees.
- Withdrawals start the year after you stop adding. Each one is a fixed share of that year's opening balance, taken before growth, as in the original spreadsheet.
- SARS annual limits follow the year of each deposit: R30 000 from March 2015, R33 000 from March 2017, R36 000 from March 2020 and R46 000 from March 2026, with a R500 000 lifetime limit. A plan at the limit follows it as it rises.
- The ordinary-account comparison assumes a 3% dividend yield taxed at 20% and 18% capital gains tax when you cash out.

## Tests

The SARS rules are written up as tests in `test/sars-rules.test.js`, each one quoting the rule it checks from the [SARS Tax Free Investments page](https://www.sars.gov.za/types-of-tax/personal-income-tax/tax-free-investments/) or the [Budget 2026 FAQ](https://www.sars.gov.za/about/sars-tax-and-customs-system/budget/budget-2026-frequently-asked-questions/). They run against `model.js`, the same file the page uses, with no dependencies:

```bash
node --test
```

GitHub Actions runs them on every push and pull request, and only deploys to GitHub Pages when they pass.

## Updating

The page is `index.html` and the model is `model.js`. Edit, commit, push. The workflow tests and deploys in a minute or two.
