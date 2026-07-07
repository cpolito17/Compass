# CLAUDE.md

Client-only React SPA ("Compass" in the UI, repo name Trajectory): a personal finance planner with three tabs (Trajectory / Budget / Compare) sharing one localStorage-persisted profile. No backend, no accounts — never add network calls or telemetry.

- **PROJECT.md** — architecture, simulation model, design decisions, critical paths. Read it before touching `src/engine/`.
- **GAPS.md** — known bugs, debt, and scoped fix tasks, ordered by severity. Check it before "discovering" an issue.
- **personal-finance-app-build-brief.md** — the original spec; code comments cite it as `§N`. Authoritative for intended behavior.

## Commands

```bash
npm run dev         # Vite dev server → http://localhost:5173
npm test            # Vitest, single run (79 tests, ~3s) — run before every commit
npm run test:watch  # Vitest watch mode
npm run build       # → dist/trajectory + dist/compass mirror + dist/_headers
npm run preview     # serve the production build locally
```

- No lint/format tooling exists (see GAPS.md #11). No CI — you are the CI; run `npm test` and `npm run build` yourself.
- Deploy is Cloudflare Workers static assets (`wrangler.jsonc`, assets dir `./dist`); there is no deploy script — the owner runs wrangler manually. Don't deploy.

## Layout

- `data/*.json` — versioned reference data (taxes, COL, IRS limits, spending distributions). Each has `vintage` + `source`. Updating a tax year = swap data + update the hard-coded expectations in tests.
- `src/engine/` — pure functions, no React, data passed in as an argument: `simulate.js` (the product), `tax.js`, `lognormal.js`.
- `src/lib/data.js` — bundles all JSON into the single `appData` object everyone imports.
- `src/state/useStore.js` — `usePersistedState` hooks; localStorage keys are `pf.*`.
- `src/App.jsx` — runs `simulate()` once in a useMemo; passes `sim` + setters to tabs as props. No context, no router, no state library.
- `src/tabs/`, `src/components/` — UI. Tailwind utility classes inline; shared primitives in `components/ui.jsx`.

## Conventions

- Plain JS/JSX, ES modules, no TypeScript. 2-space indent, single quotes, semicolons.
- Rates are fractions in code (`0.07`), percentages only at the `PercentInput` boundary. `employerMatchRate: 1.0` = 100% match.
- Engine money is **nominal dollars**; "Today's $" is a display-only division by `snapshot.inflFactor`. Never branch engine logic on real vs nominal.
- The engine never throws on bad events — it pushes soft `warnings` (`{age, eventId, message}`) and skips. Follow that pattern for new event types.
- Snapshots carry everything the UI needs (`balances`, `components`, `allocation`, `entities`); UI must read snapshots, not re-derive engine math.
- File-top comments cite brief sections (`§4.4`); keep them accurate when moving logic.
- Tests: engine tests run in node (default env set in `vite.config.js`); component tests need `// @vitest-environment jsdom` as the FIRST line plus the ResizeObserver/matchMedia shims (copy from `src/app.smoke.test.jsx`).

## Gotchas

- `savingMode: 'auto'` is the default — the profile's `k401.employeeContribPct` is ignored in auto mode; the waterfall in `allocateWaterfall` decides contributions. Some UI (BaselineForm tax card, BudgetTab) still computes with the manual % — known inconsistency, GAPS.md #2.
- In `fixWithdrawal` mode the sim retires at `controls.retirementAge`, NOT at `meta.solvedAge`. `solvedAge` is informational (dotted chart line). Intended; don't "fix" without a decision.
- The year-loop step numbers in `runPass` (1,2,3,4,7,7b,8,9,10) intentionally skip 5–6. Don't renumber.
- `EventTimeline` passes `sim={{ ...sim, events }}` to `EventEditor` — `simulate()` results don't normally have `.events`. Grep `sim.events` before changing the sim result shape.
- `NumberInput` commits parsed+clamped values on every keystroke (GAPS.md #6). External value changes only refresh the field when it's not focused — that `focused` guard is load-bearing.
- Tab transitions in `App.jsx` are enter-only on purpose: `AnimatePresence mode="wait"` caused a blank-page deadlock with chart ResizeObservers (see the comment there and commit 7895d8e). Do not reintroduce exit-gated tab animation.
- `START_YEAR` (2026) is duplicated as a literal in `EventTimeline.jsx` and the smoke-test footer regex (GAPS.md #16).
- `postbuild.mjs` and the root `_headers` file are dead — the live CSP/headers are the `CF_HEADERS` string inside `vite.config.js`. Edit headers there only.
- jsdom tests print Recharts width/height and framer-motion `cx/cy` warnings on stderr — noise, not failures.

## Rules

- `src/engine/simulate.js` and `src/engine/tax.js` are the product. Any behavior change there needs a test in the same commit; `npm test` must stay green (79 passing today).
- Never restructure nested objects in `DEFAULT_PROFILE` (e.g. `k401`) without a localStorage migration — stored profiles shallow-merge over defaults and a shape change blanks the app for returning users (GAPS.md #5). Adding new top-level keys is safe.
- Don't change `data/*.json` values without updating `vintage`/`source` and the tests that hard-code expected dollar amounts (`tax.test.js`, `simulate.test.js`).
- Don't touch the `/trajectory/` base path, the compass mirror, or the CSP in `vite.config.js` unless the task is explicitly about deployment.
- Never send user data anywhere; never weaken the CSP `script-src`; never use `dangerouslySetInnerHTML`.
- Match the existing comment style: comments state modeling conventions and constraints, not narration of the code.
