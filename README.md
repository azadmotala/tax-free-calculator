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

## Updating

The whole page is `index.html`. Edit it, commit, push, and GitHub Pages rebuilds in about a minute.
