# Trajectory

A clean, fast, ad-free, paywall-free personal finance planner. No accounts. No paywalls. No bloat. Just three tools that work together to help you think clearly about money.

Live at **[charliepolito.com/compass](https://charliepolito.com/compass)**

-----

## What it does

Trajectory is a single-page app with three tabs that share one profile — enter your information once and all three tools stay in sync.

### Trajectory

The flagship tab. Projects your net worth from your current age to 100, year by year, accounting for taxes, debt payoff, investment growth, 401k contributions, Social Security, and retirement drawdown. Add life events — a job change, a house purchase, a child, a move, a marriage — and watch the chart update in real time. The goal is to make the long-term cost or benefit of major life decisions immediately visible.

**Key features:**

- Net worth chart from current age to 100, animated, with a real/nominal dollar toggle (default: today’s dollars)
- Hover tooltip showing the year-by-year breakdown — 401k, savings, assets, debt
- Retirement controls: set a target retirement age and see the safe annual withdrawal, or set a target withdrawal and find the earliest age you can afford it
- A safe withdrawal rate (SWR) slider (default 4%) that re-solves the retirement math live
- Automatic tax calculation — set your city and filing status, and the app computes your effective federal + FICA + state + local rate; you never enter a tax rate manually
- 16 life event types placed on a timeline by age, each wiring directly into the simulation engine

### Budget

Builds a spending picture using percentile sliders — one per spending category. Each slider represents where you fall in the US household distribution for that category. Drag the slider to set a dollar amount, or type a dollar amount to snap the slider to the matching percentile. A small lognormal distribution curve sits above each slider with a dot that moves as you adjust it, so you can see exactly where your spending lands relative to everyone else. Past the 85th percentile, the marker warms from blue to amber.

The Budget total feeds directly into Trajectory’s baseline spending, so both tabs always agree.

### Compare

Pick 2–4 US cities and compare your financial life across them side by side. Each column shows how income, spending by category, taxes, and effective saving rate would change if you lived there. Your home city is the grey baseline; every other city is color-coded by how far it differs — green for better, red for worse, with gradient bands at ±5% and ±15%. Each city uses its own correct tax jurisdiction. You can also set a different income per city to account for pay differences by metro.

-----

## Life events

The simulation supports 16 event types, each placed by age on a timeline:

|Event                 |What it models                                                                          |
|----------------------|----------------------------------------------------------------------------------------|
|New job               |Income change + updated 401k parameters                                                 |
|Promotion / raise     |Income step-up                                                                          |
|House purchase        |Down payment, closing costs, mortgage, property tax, home appreciation                  |
|Child born            |Windowed childcare, optional private K-12, optional college fund — auto-ends at 18 or 22|
|Inheritance / windfall|One-time lump sum in                                                                    |
|Large expense         |One-time lump sum out                                                                   |
|New debt              |Adds an amortizing loan                                                                 |
|Pay off debt          |Clears a balance (only offers debts still active at that age)                           |
|Move                  |New tax jurisdiction + COL-rescaled spending                                            |
|Constant Change       |Piecewise change to any global assumption from a given age forward                      |
|Sell home             |Proceeds net of capital-gains tax (with primary-residence exclusion); mortgage stops    |
|New asset             |Purchase + appreciation schedule                                                        |
|Sell asset            |Proceeds net of capital-gains tax                                                       |
|COL Change            |Lifestyle multiplier (0.5×–2.0×) applied to total spending                              |
|Marriage              |Partner income, savings, and debt; filing status → MFJ                                  |
|Divorce               |50/50 balance sheet split; home sold; filing status → single                            |

Entity-dependent events (pay off debt, sell asset, divorce) only offer options that are valid at the chosen age — the engine replays the timeline to populate the dropdown.

-----

## How the simulation works

The engine is a pure function: `simulate(profile, constants, events) → YearSnapshot[]`. It runs an explicit year-by-year loop from current age to 100 in nominal dollars, with a real-dollar view applied as a display transform afterward.

Each year, in order:

1. Apply scheduled mutations (moves, constant changes, marriage, divorce)
1. Resolve income (salary growth + partner income if married)
1. 401k contributions (employee + employer match, IRS-capped)
1. Taxes (federal progressive + FICA + state + local)
1. Spending (baseline × COL factor × lifestyle multiplier + event windows + property tax + debt service)
1. Cash flow — net savings flow to investments; deficits draw down cash then investments
1. One-time event cash flows (windfalls, purchases, sales, inheritances)
1. Grow balances (investments, 401k, home, named assets)
1. Amortize debts
1. Record snapshot (net worth + component breakdown)

At retirement, employment income stops and the portfolio funds a target annual withdrawal. If the portfolio reaches zero before 100, the chart shows it — that’s a feature.

-----

## Global assumptions (Constants Panel)

All rates are nominal. The Constants Panel is collapsible and lives under the baseline inputs in the Trajectory tab.

|Assumption                  |Default   |
|----------------------------|----------|
|Market return               |7.0%      |
|Inflation                   |2.5%      |
|Salary growth               |3.5%      |
|Home appreciation           |3.5%      |
|Capital gains rate          |15% (flat)|
|Social Security claiming age|67        |

Any constant can also be changed at a point in time via a Constant Change life event, creating a piecewise schedule rather than a single global value.

-----

## Data sources

All reference data lives in `/data/*.json`, each file tagged with a `vintage` and `source`. The app surfaces the data vintage in the footer. Updating data means swapping a file.

|File                         |Source                                           |
|-----------------------------|-------------------------------------------------|
|`tax-federal-2026.json`      |IRS Rev. Proc. 2025-32                           |
|`tax-state-2026.json`        |Tax Foundation                                   |
|`tax-local-2026.json`        |City finance departments / Tax Foundation        |
|`cost-of-living.json`        |BEA Regional Price Parities + Zillow             |
|`spending-distributions.json`|BLS Consumer Expenditure Survey 2024             |
|`life-event-costs.json`      |USDA, Care.com, PrivateSchoolReview, CollegeBoard|
|`retirement-config.json`     |IRS Notice 2025-67 + SSA                         |
|`cities.json`                |Top 50 US cities                                 |
|`constants-defaults.json`    |App defaults (§6 of the build brief)             |

-----

## Tech stack

- **React** — functional components + hooks
- **Tailwind CSS** — styling
- **Recharts** — all charts
- **Framer Motion** — animated transitions, chart draw-in, slider easing
- **Vite** — build tooling
- Deployed as static files — no server runtime, no backend, no accounts

All user data persists in browser `localStorage` under `pf.*` keys and never leaves the device.

-----

## Running locally

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`.

```bash
npm run build
```

Builds to `dist/` with the `/trajectory/` base path and Cloudflare `_headers` for security headers. To preview the production build locally:

```bash
npm run preview
```

-----

## Deployment

Deployed via Cloudflare Workers (static assets). The build emits the app under `dist/trajectory/` and `dist/compass/` so both routes serve the same app. The `_headers` file is written automatically by a Vite build plugin — no separate step needed.

Routes on `charliepolito.com`:

- `charliepolito.com/trajectory*`
- `charliepolito.com/compass*`

-----

## Known limitations (v1)

- Retirement withdrawals are treated as pre-tax (retirement-income taxation is a planned v2 addition)
- Capital gains use a single flat rate — no long/short-term distinction
- Taxable brokerage compounds without annual tax drag (assets and home are taxed on sale)
- Budget percentiles are relative to all US households, not income-bracketed peers, due to data availability
- No partner 401k or spousal Social Security in the marriage model
