# Compass

Compass is a free, private personal finance planner for exploring how income, spending, taxes, location, and major life events may affect long-term net worth and retirement.

**Try Compass:** [charliepolito.com/compass](https://charliepolito.com/compass/)

**Portfolio:** [charliepolito.com](https://charliepolito.com/)

**Source:** [github.com/cpolito17/Compass](https://github.com/cpolito17/Compass)

No account is required. Compass has no ads or tracking, and planning data stays in the visitor's browser.

## Features

- Project net worth through age 100 with real- and nominal-dollar views.
- Model retirement timing, safe withdrawals, taxes, debt, investments, and Social Security.
- Add 16 types of life events, including moves, raises, home purchases, children, marriage, and windfalls.
- Build a budget using US household spending distributions.
- Compare income, taxes, spending, and savings across two to four US cities.
- Keep a shared profile across all three planning tools.

Compass provides educational estimates, not financial, tax, or investment advice.

## Privacy and security

Compass is a static client-side application. It has no application server, login, analytics, advertising, or third-party API calls. User inputs are stored only in browser `localStorage` under keys beginning with `pf.`.

The production build includes a restrictive Content Security Policy and headers that prevent framing, MIME sniffing, unnecessary browser permissions, and cross-origin window access. Do not add secrets to this repository or expose credentials through Vite environment variables, which are bundled into client-side code.

To clear saved planning data, remove the site's data in your browser settings.

## Run locally

Requirements: Node.js 18 or newer and npm.

```bash
npm ci
npm run dev
```

Vite prints the local development URL. To run the automated checks and create a production build:

```bash
npm test
npm run build
npm run preview
```

## How it works

The React interface shares one locally persisted profile across three tabs:

- **Trajectory** runs a year-by-year simulation and visualizes net worth, assets, debts, and retirement outcomes.
- **Budget** maps spending choices to category-level US household percentiles and can update baseline spending.
- **Compare** estimates how taxes and cost of living differ across selected US cities.

Reference datasets live in `data/` and identify their source or vintage. The simulation engine in `src/engine/` is covered by Vitest tests.

## Technology

- React and Vite
- Tailwind CSS
- Recharts
- Framer Motion
- Vitest and Testing Library
- Cloudflare Workers static assets

## Deployment

`npm run build` emits the canonical application beneath `dist/compass/` and mirrors its shell beneath `dist/trajectory/` for old bookmarks. Cloudflare security headers are generated at `dist/_headers`.

Production URL: [https://charliepolito.com/compass/](https://charliepolito.com/compass/)

## Data sources

The bundled data cites sources including the IRS, Tax Foundation, US Bureau of Economic Analysis, US Bureau of Labor Statistics, and Social Security Administration. See the JSON files in `data/` for dataset-specific source and vintage details.

## Known limitations

- Results are deterministic projections, not forecasts.
- Retirement withdrawals are currently modeled as pre-tax.
- Capital gains use a flat rate without short- and long-term distinctions.
- Taxable brokerage growth does not include annual tax drag.
- Spending percentiles represent all US households rather than income-matched peers.
- Partner 401(k) and spousal Social Security benefits are not modeled.

## License

No open-source license has been granted. All rights are reserved by the repository owner.
