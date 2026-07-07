# PROJECT.md — Trajectory / "Compass"

*Knowledge-transfer overview. Written 2026-07 after a full read of the codebase. For known problems see [GAPS.md](GAPS.md); for day-to-day operational rules see [CLAUDE.md](CLAUDE.md).*

## What this is

A free, client-only personal finance planner, live at **charliepolito.com/compass** (and `/trajectory`). The repo is named Trajectory; the UI brand is **Compass**. It is a single-page React app with three tabs that share one profile:

1. **Trajectory** (flagship) — projects net worth year-by-year from the user's current age to 100, modeling taxes, 401k/Roth/HSA, debt amortization, home ownership, Social Security, and retirement drawdown. Users place up to 16 kinds of "life events" (new job, house, child, move, marriage, divorce…) on a timeline and watch the chart re-draw.
2. **Budget** — percentile sliders over lognormal US household spending distributions (BLS data), one per category. Total feeds Trajectory's baseline spending via one button.
3. **Compare** — side-by-side cost-of-living / tax / saving-rate comparison of 2–5 US cities (home + up to 4).

There is **no backend, no accounts, no analytics**. All user data lives in browser `localStorage` under `pf.*` keys. This privacy stance is a product feature, not an accident — don't add network calls.

The audience is individuals (originally the author) who want an honest long-horizon "what does this life decision cost me" tool without ads or paywalls.

## The spec

`personal-finance-app-build-brief.md` in the repo root is the original build brief. **Code comments cite it constantly** (`§4.4`, `§6b`, `§15`…). When a comment says "§X", it means that section of the brief. The brief is the authoritative statement of intended behavior; the README is the user-facing summary. Read the brief section before changing any engine behavior.

## Tech stack and why

| Piece | Version | Why |
|---|---|---|
| React 18 (functional + hooks) | ^18.3 | Required by the brief; no state library — plain hooks + localStorage suffice for a single shared profile. |
| Vite 5 | ^5.4 | Build/dev tooling; also hosts the Vitest config and a custom build plugin. |
| Tailwind CSS 4 | ^4.0 (via `@tailwindcss/vite`) | All styling is inline utility classes; there is no CSS-in-JS and almost no custom CSS (see `src/index.css`, 34 lines). |
| Recharts 2 | ^2.15 | All charts (net-worth line, budget stacked bar). |
| Framer Motion 11 | ^11.18 | Animated tab pill, chart fade-ins, modal transitions, `AnimatedNumber` easing. Design language: values ease, never snap. |
| Vitest 2 + Testing Library | ^2.1 | Engine tests run in plain node (engines are pure); one smoke test uses jsdom via a per-file pragma. |
| Cloudflare Workers static assets | `wrangler.jsonc` | Deploy target. No worker code — assets only, `not_found_handling: "none"` because there's no client router. |

No TypeScript, no ESLint, no Prettier, no CI (see GAPS.md). Everything is plain `.js`/`.jsx` ES modules.

## Architecture

```
data/*.json  (versioned reference data: taxes, COL, spending dists, IRS limits)
     │  static imports
     ▼
src/lib/data.js ──────── bundles everything into one `appData` object + cityIndex
     │
     ▼
src/engine/              PURE FUNCTIONS — no React, no globals, data injected
  ├─ tax.js              effectiveTax(gross, filingStatus, cityKey, data, pretax401k)
  ├─ simulate.js         simulate(profile, constants, events, controls, data)
  │                        → { snapshots[], warnings[], meta }
  └─ lognormal.js        percentile ↔ dollar math for Budget sliders
     │
     ▼
src/state/useStore.js    usePersistedState(key, defaults) → localStorage 'pf.*'
     │                   (useProfile, useConstants, useEvents, useControls,
     │                    useBudget, useCompare)
     ▼
src/App.jsx              ONE simulate() call in a useMemo; results + setters
     │                   passed as props to all tabs (no context, no router —
     │                   tab switching is a useState)
     ▼
src/tabs/
  ├─ TrajectoryTab.jsx → trajectory/{BaselineForm, ConstantsPanel,
  │                       EventTimeline, NetWorthChart}.jsx
  ├─ BudgetTab.jsx       (uses lognormal.js + tax.js directly)
  └─ CompareTab.jsx      (uses tax.js per city + COL scaling; NOT simulate.js)
src/components/          ui.jsx primitives, CityAutocomplete, AnimatedNumber,
                         WelcomeModal
```

Data flows one way: JSON → appData → engines → snapshots → charts. User input flows through the persisted-state setters and triggers a full re-simulation (the whole 70-year sim runs in well under a frame; there is no memoization inside the engine and none is needed).

## How the simulation works (the heart of the app)

`src/engine/simulate.js` is ~760 lines and is where nearly all product complexity lives. Key model, documented at the top of the file and in brief §4:

- **Everything internal is NOMINAL dollars.** The "Today's $" chart view is a pure display transform: divide by each snapshot's `inflFactor` (cumulative product of the *active* inflation rate, which can change mid-timeline via a Constant Change event). Never build logic that branches on real vs nominal — only the view layer deflates.
- **Two passes per simulate() call.** Pass 1 runs accumulation-only (retirement age = Infinity) to get the portfolio curve. The SWR math then either (a) `fixAge` mode: safe withdrawal = SWR × portfolio entering retirement age, deflated to today's dollars, or (b) `fixWithdrawal` mode: scan for the earliest age where SWR × portfolio ≥ target (→ `meta.solvedAge`). Pass 2 is the real run with the chosen withdrawal.
  - **Non-obvious:** in `fixWithdrawal` mode the final pass still retires at `controls.retirementAge`, NOT at `solvedAge`. `solvedAge` is informational (the dotted green line on the chart). This is intended.
- **Order of operations inside each year** (numbered comments in `runPass`): 1 scheduled mutations (move/constantChange/marriage/divorce) → inflation compounding → 2 income (salary growth, newJob/promotion) → 3 spending + minimum debt service → 4 contributions/taxes/saving waterfall → 7 one-time event cash flows → 7b retirement decumulation + Social Security → 8 grow balances → 9 amortize debts → 10 snapshot. The numbering skips 5–6 (they were folded into 3–4); don't renumber, the tests and brief reference the step semantics.
- **Two saving strategies** (`profile.savingMode`): `'manual'` = fixed 401k %, leftover to brokerage. `'auto'` (the default) = "financial order of operations" waterfall: employer match → high-APR debt (>6%, never the mortgage, avalanche order) → HSA → Roth IRA → max 401k → brokerage. Pre-tax buckets feed back into the tax bill, so `allocateWaterfall` resolves a small fixed-point loop (≤5 iterations, $1 tolerance).
- **Social Security** is computed from the user's own simulated earnings history via the real PIA bend-point formula (`piaMonthly`), locked in at retirement, adjusted by claiming age (62–70 table), started at max(retirement age, claiming age). Partner earnings do NOT accrue SS (v1 limitation).
- **Deficits**: `drawFunds` draws cash then taxable investments; cash may go negative as a deficit marker. Retirement accounts are never tapped pre-retirement.
- **Retirement years**: gross income = 0, tax = 0 (withdrawals are pre-tax, v1), the withdrawal — not the computed spending — is what's actually drawn from the portfolio (order: taxable → 401k → Roth → HSA → cash). Spending is still computed and shown in snapshots, but it does not drive the drawdown. If the portfolio hits ~0 the `depleted` flag sticks and the chart shows a flat tail — deliberately.
- **Events with entity references** (pay off debt, sell asset, sell home, divorce) validate against simulated state: the UI (`EventTimeline.entitiesEnteringAge`) reads `snapshots[age-1].entities` to populate dropdowns, and the engine emits soft `warnings` (never throws) when an event no longer applies.

## The tax engine

`src/engine/tax.js` is small and pure: progressive federal brackets + standard deduction, FICA (SS wage base + additional Medicare), state (none/flat/progressive per `tax-state-2026.json`), and flat local wage taxes for ~8 cities. Pre-tax 401k reduces federal + state taxable income but not FICA. All tables come from `data/*.json`, each tagged `vintage: 2026` — updating tax year = swapping data files, no code change. The footer surfaces `DATA_VINTAGE`.

## Key design decisions (inferred, with reasoning)

1. **Pure engines with injected data.** `simulate`/`effectiveTax` take `data` as an argument rather than importing it, so the same code runs in node tests without jsdom. This is why the engine test files can be `environment: 'node'` (fast).
2. **One simulation, computed once in App.jsx.** All tabs consume the same `sim` object. Compare deliberately does NOT run the simulator — it's a static single-year computation reusing only the tax engine + COL indices.
3. **Snapshots are self-describing.** Each year's snapshot carries everything the UI needs (`balances`, `components`, `allocation`, `entities`, `tax`, `spending`), so UI components never re-derive engine math. The `components` breakdown (k401/savings/roth/hsa/assets/debt) is constructed so the parts *always sum exactly to net worth* — negative cash or underwater home equity is reclassified as Debt rather than shown as negative Savings/Assets. Tests enforce this invariant on every snapshot of every scenario.
4. **Events are plain JSON objects in an array**, sorted by age at run time. No classes, no registry — a `switch` in `runPass` and a `switch` in `EventFields`. Adding an event type touches: `EVENT_TYPES`, `defaultsForType`, `typeDisabledReason` (if entity-dependent), `EventFields`, and one or two `case`s in `runPass`.
5. **localStorage as the only store**, wrapped by `usePersistedState` with shallow default-merging and swallow-all error handling (corrupt storage → defaults; full storage → in-memory only).
6. **Strict CSP shipped from the build.** `vite.config.js` contains a custom plugin that writes `dist/_headers` (Cloudflare header file) and mirrors `dist/trajectory` → `dist/compass` so both URL paths serve the app from one deploy.
7. **Enter-only tab animation** in App.jsx — a long comment explains that `AnimatePresence mode="wait"` was removed because a ResizeObserver firing during a chart's exit animation could deadlock and blank the page (commit 7895d8e). Do not reintroduce exit-gated tab transitions.

## Critical paths — where to be careful

- **`src/engine/simulate.js`** — load-bearing for everything. 79 tests (three files) pin its behavior, including 10 mandatory "§15 acceptance scenarios" and a scenario matrix that asserts invariants on *every snapshot*. Any engine change must keep `npm test` green; add a scenario when you add behavior.
- **`src/engine/tax.js` + `data/tax-*.json`** — numbers here are externally sourced (IRS Rev. Proc. 2025-32, Tax Foundation). Tests hard-code expected dollar values from the 2026 tables; changing a data file will (correctly) break tests, which must be updated in the same change.
- **`src/state/useStore.js`** — the localStorage schema has no versioning. Changing the *shape* of `DEFAULT_PROFILE` (especially nested objects like `k401`) can break returning visitors whose stored profile shallow-merges over new defaults. Add new top-level keys freely (shallow merge covers them); restructure nested objects only with a migration.
- **`vite.config.js`** — the `/trajectory/` base path, the CSP header text, and the compass mirror all live here. The deployed site depends on all three.
- **Safe to change casually:** anything in `src/components/`, tab layout/styling, copy, Framer Motion tuning, `WelcomeModal`. The UI has only a smoke test; visual changes won't fight the suite.

## Things that will trip you up

- **Percent conventions:** the engine stores rates as fractions (0.07); `PercentInput` displays ×100 ("7%"). `employerMatchRate: 1.0` means a 100% (dollar-for-dollar) match, capped at `employerMatchCapPct` of salary — not "1%".
- **`NumberInput` commits on every keystroke** and clamps to min/max, so the sim re-runs on partial input (typing "25" into Age briefly commits 2→clamped to 18). Known wart; see GAPS.md before "fixing" input behavior.
- **`EventTimeline` passes `sim={{ ...sim, events }}`** into `EventEditor` — the simulate() result does not normally carry `events`; the editor's live saving-rate readout needs the event list glued on. Grep for `sim.events` before refactoring the sim result shape.
- **`START_YEAR = 2026` is hard-coded** in `simulate.js`, and independently as a literal `2026` in `EventTimeline.jsx` and the smoke test's footer regex.
- **Roth/HSA balances (`profile.rothBalance`, `profile.hsaBalance`) are engine inputs with no UI field** — they're always 0 unless auto-allocate funds them during the run.
- **Budget tab stores annual dollars always**; the Monthly toggle is a pure display/entry transform (÷12 shown, ×12 stored).
- **`postbuild.mjs` and the root `_headers` file are vestigial** — not wired to any npm script; the Vite plugin is the live source of the deployed headers. The two header texts have drifted (root `_headers` lacks the `/compass/*` block).
- **Tests:** default Vitest environment is `node` (set in vite.config.js); the smoke test opts into jsdom with a `// @vitest-environment jsdom` first-line pragma and hand-shims `ResizeObserver`/`matchMedia`. New component tests need the same pragma.
