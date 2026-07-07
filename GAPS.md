# GAPS.md — Honest audit of weaknesses

*Ordered by severity, most important first. Each entry says what, where, why it matters, and a fix scoped to a single small task. Written 2026-07; all 79 tests passed and the build succeeded at audit time, so everything below is latent rather than currently on fire.*

---

## 1. Divorce does not split Roth or HSA balances — correctness bug

**What:** The divorce event halves `cash`, `investments`, `k401`, every asset, and every debt, but never touches `state.roth` or `state.hsa`.
**Where:** `src/engine/simulate.js`, `case 'divorce'` (~lines 304–329).
**Why it matters:** In auto-allocate mode (the default) Roth and HSA accumulate real money. A user who models marriage → divorce keeps 100% of those two buckets while everything else halves, silently overstating post-divorce net worth. The scenario tests never combine `savingMode: 'auto'` with a divorce, which is why this survives the suite.
**Fix (small):** Add `state.roth /= 2; state.hsa /= 2;` next to the `k401` line, and add one test: auto-mode profile, marriage at 40, divorce at 50, assert `balances.roth` and `balances.hsa` drop by ~half across the divorce year.

## 2. Baseline/Budget tax math ignores auto savingMode — displayed numbers disagree with the simulation

**What:** `BaselineForm` (effective-tax card, take-home readout) and `BudgetTab` (`totals`: employee 401k, tax, saving rate, the stacked bar) compute the pre-tax 401k deferral as `k401.employeeContribPct × income`. In `savingMode: 'auto'` (the default!), the engine ignores that percentage and typically maxes the 401k, so the displayed effective tax rate and Budget saving split don't match what the Trajectory chart actually simulates for year one.
**Where:** `src/tabs/trajectory/BaselineForm.jsx` (~lines 19–23), `src/tabs/BudgetTab.jsx` (`totals` useMemo, ~lines 120–135).
**Why it matters:** The app's pitch is "all three tabs agree." In the default mode they visibly don't: Budget can show a different saving rate than Trajectory's year-one snapshot.
**Fix (small):** In both places, when `profile.savingMode === 'auto'`, derive the year-one figures from the sim instead: `sim.snapshots[0].tax` / `.allocation` are already computed in `App.jsx` and can be passed down (BaselineForm already receives nothing from sim — pass `sim` through `TrajectoryTab`). Alternatively, label the figures "(manual-mode estimate)" — but wiring the snapshot is barely more work and actually correct.

## 3. Retirement withdrawal is disconnected from modeled living costs — silent under/overspending

**What:** In retirement years the engine computes `spending` (baseline × COL × inflation + child + property tax) and `debtService`, shows them in snapshots, but draws only `withdrawal` (SWR-derived or user target) from the portfolio. If the withdrawal is smaller than actual modeled living costs, the sim silently assumes the user lives on less; there is no warning.
**Where:** `src/engine/simulate.js` §7b (~lines 551–578); the only user-facing hint is a footnote in `NetWorthChart.jsx`.
**Why it matters:** A user with a $90k lifestyle who fixes retirement at an age where the safe withdrawal is $50k sees a rosy chart with no indication of the $40k/yr gap. This is the most misleading output the app can produce.
**Fix (small):** In `runPass`, when `retired`, push a one-time warning (or set a `meta` flag) if `withdrawal + ssBenefit < spending + 12×Σ monthlyPayment` in the first retirement year; surface it next to the existing depletion warning in `NetWorthChart.jsx`.

## 4. No CI — tests exist but nothing runs them

**What:** There is no `.github/workflows/`, no pre-commit hook, no automation. The strong 79-test suite only runs when someone remembers `npm test`.
**Where:** Repository root (absence).
**Why it matters:** The engine is the product; a bad merge to `main` deploys silently broken math.
**Fix (small):** Add `.github/workflows/ci.yml` running `npm ci && npm test && npm run build` on push/PR to main. ~20 lines, no secrets needed.

## 5. Unversioned localStorage schema + no error boundary → blank-page risk for returning users

**What:** `usePersistedState` shallow-merges stored JSON over defaults. Top-level additions are safe, but nested shapes are not: a stored profile with an old/absent `k401` object crashes `BaselineForm` (`profile.k401.employeeContribPct`) and React unmounts to a blank page — there is no error boundary anywhere.
**Where:** `src/state/useStore.js` (`load`, ~lines 35–47); `src/main.jsx` (no boundary).
**Why it matters:** The app's entire persistence story is this one merge. One nested-shape refactor bricks every returning visitor with no recovery path (they'd have to know to clear localStorage).
**Fix (small):** Two independent tasks: (a) add a top-level `ErrorBoundary` in `main.jsx` whose fallback offers a "Reset saved data" button (`localStorage` clear of `pf.*` keys + reload); (b) in `useProfile`, deep-merge the known nested objects (`k401`, `home`) over defaults, or add a `pf.schemaVersion` key checked at load.

## 6. `NumberInput` commits clamped values on every keystroke

**What:** `onChange` parses and commits on each keystroke, applying min/max clamps. Typing "25" into Age (min 18) commits 2 → clamped to 18 → then 25; typing a salary commits "1", "15", "150"… each triggering a full re-simulation, and clearing a field to retype commits nothing (stale value silently restored on blur).
**Where:** `src/components/ui.jsx` (`NumberInput`, ~lines 39–77). Every numeric field in the app uses it.
**Why it matters:** Garbage intermediate states flow into the persisted profile and the sim; the min-clamp makes some fields actively fight the user mid-typing.
**Fix (small):** Commit unclamped parses during typing only when within [min,max]; apply clamping solely in the `onBlur` commit. Keep the two-way `text`/`value` sync exactly as is (it exists so external updates refresh the field when not focused).

## 7. Manual-mode employer match is computed off salary, not off the capped employee deferral

**What:** `employer = min(employeeContribPct, employerMatchCapPct) × income × matchRate`. When the IRS cap binds (high earner: 20% of $400k → employee capped at $24.5k), the match is still computed from the uncapped percentage of salary, so the employer can "match" more than the employee actually deferred. Only the annual-additions cap reins it in.
**Where:** `src/engine/simulate.js`, manual branch (~lines 427–433). (The auto branch does this correctly: `min(employee, capPct × income) × matchRate`.)
**Why it matters:** Overstates 401k growth for high earners in manual mode; disagrees with the auto branch's own logic.
**Fix (small):** Compute `employer = Math.min(employee, p.employerMatchCapPct * state.userIncome) * p.employerMatchRate` in the manual branch (mirroring `allocateWaterfall`), keep the additions-cap clamp, and update the `income: 300000` expectation in `simulate.test.js` ('Supporting math') accordingly — think through the correct expected value first.

## 8. Roth IRA MAGI phase-out is not modeled in auto mode

**What:** The waterfall contributes up to `iraLimit` ($7.5k) to a Roth IRA regardless of income. Real direct Roth contributions phase out (~$150k+ single / ~$236k+ MFJ in 2026).
**Where:** `src/engine/simulate.js` `allocateWaterfall` step 4 (~line 209); limits in `data/retirement-config.json`.
**Why it matters:** High earners — exactly the users most likely to hit the waterfall's later steps — get an impossible contribution modeled every year for decades. (Arguably "backdoor Roth" makes this defensible, but nothing says so.)
**Fix (small):** Either add `rothPhaseOut` thresholds to `retirement-config.json` and zero/reduce `iraLimit` above them in `allocateWaterfall`, or add a one-line note in the saving-plan UI copy that Roth is modeled as always available (backdoor assumption). Decide, then do one.

## 9. Roth/HSA starting balances have no UI

**What:** The engine reads `profile.rothBalance` and `profile.hsaBalance` (`initState`, `portfolioEntering`), but `DEFAULT_PROFILE` doesn't define them and `BaselineForm` has no inputs, so users with existing Roth/HSA money cannot enter it.
**Where:** `src/engine/simulate.js` lines 84–85, 689–690; `src/state/useStore.js` `DEFAULT_PROFILE`; `src/tabs/trajectory/BaselineForm.jsx`.
**Why it matters:** Understates real users' starting portfolios; the engine support is already there, only the form is missing.
**Fix (small):** Add `rothBalance: 0, hsaBalance: 0` to `DEFAULT_PROFILE` and two `NumberInput` fields in the BaselineForm grid ("Roth IRA balance", "HSA balance"). Shallow merge makes this safe for existing stored profiles.

## 10. Dead code and vestigial build files

**What:**
- `postbuild.mjs` — copies root `_headers` to `dist/`, but no npm script ever runs it; the Vite plugin (`cloudflareHeaders` in `vite.config.js`) is what actually writes `dist/_headers`.
- Root `_headers` — duplicates the CSP text in `vite.config.js` but has drifted: it lacks the `/compass/*` block. Two sources of truth, one stale.
- `clone()` in `src/engine/simulate.js` (~line 36) — defined, never called.
- `sellHomeInternal(state, warnings, age, …)` — `warnings` and `age` params are unused.
**Why it matters:** The header drift is a real trap: someone "fixing" CSP in the root `_headers` would change nothing in production.
**Fix (small):** Delete `postbuild.mjs` and root `_headers`; delete `clone`; drop the unused params. Confirm `npm run build` still emits the correct `dist/_headers` (it will — the plugin is self-contained).

## 11. No lint or format tooling

**What:** No ESLint, no Prettier, no config of any kind. Latent issues that a standard React lint would flag: `CompareTab`'s `useMemo` deps use `columns.join(',')`; `CityAutocomplete`'s `exclude = []` default defeats its memo; unused vars (gap 10).
**Where:** Repo root (absence).
**Why it matters:** For a repo expected to be maintained by less capable models, mechanical guardrails are disproportionately valuable — exhaustive-deps alone would have caught several near-misses.
**Fix (small):** Add flat-config ESLint with `eslint-plugin-react-hooks` + `eslint-plugin-react`, a `"lint": "eslint src"` script, and fix or explicitly disable each warning it produces. Keep it to one PR-sized change.

## 12. Test-coverage holes around the exact places that break

Present coverage is genuinely good (engine invariants across a scenario matrix, closed-form tax checks, Budget/Compare math re-derivation, app smoke test). What's missing, in priority order:
- **Auto-mode + divorce / auto-mode + marriage** (would have caught gap 1). `src/engine/scenarios.test.js` matrix has auto scenarios and divorce scenarios but never both.
- **`fixWithdrawal` final-pass semantics** — nothing asserts that the final run retires at `controls.retirementAge` rather than `solvedAge`; this intended-but-surprising behavior (see PROJECT.md) will get "fixed" into a bug someday without a pinning test.
- **`usePersistedState`** — zero tests for load/merge/corrupt-JSON/quota-exceeded paths (jsdom localStorage makes this easy).
- **`NumberInput`/`PercentInput`** — zero tests; any fix for gap 6 needs them first.
- **Deficit years in manual mode** (negative `netSavings` → `drawFunds`) — exercised only incidentally.
**Fix (small):** Each bullet is a self-contained task; do them as five separate additions to the existing test files (or a new `useStore.test.js` / `ui.test.jsx` with the jsdom pragma).

## 13. Single 500 kB+ JS chunk

**What:** The production build emits one chunk over Rollup's 500 kB warning (React + Recharts + Framer Motion + all data JSON bundled together).
**Where:** `vite.config.js` (no `manualChunks`); warning visible in every `npm run build`.
**Why it matters:** First-paint cost for a static app whose pitch is "clean and fast". Not urgent — it's one cacheable file on a personal site — but it's the app's only real performance debt.
**Fix (small):** Add `build.rollupOptions.output.manualChunks` splitting `recharts`, `framer-motion`, and `react`/`react-dom` into vendor chunks. Do not lazy-load tabs (tab switching is instant today and the exit-animation deadlock history in `App.jsx` makes suspense boundaries there risky).

## 14. Event editor validates entities against a sim that already includes the edited event

**What:** `entitiesEnteringAge` reads snapshots from the current sim run — which includes the event being edited. Editing an event's age can therefore offer dropdown options already consumed by the event itself (e.g. moving a payoff event later shows the debt as having been paid by… this same event), and the saving-rate readout hack (`sim={{ ...sim, events }}`, `sim.events?.filter?.((e) => e.id !== draft.id)`) exists to paper over the same structural issue for `colChange`.
**Where:** `src/tabs/trajectory/EventTimeline.jsx` (`entitiesEnteringAge` ~line 36, `EventEditor` ~lines 286–296).
**Why it matters:** Wrong dropdown states in edge cases; the `sim.events` glue is an easy refactor landmine (the simulate() result doesn't normally carry `events`).
**Fix (small):** In `EventEditor`, compute entities from a dedicated `simulate(profile, constants, events.filter(e => e.id !== draft.id), controls, appData)` in the existing `useMemo` (the engine is cheap), and pass `events` as a real prop instead of gluing it onto `sim`.

## 15. Compare-tab income overrides are sticky and unclearable

**What:** Overriding a city's income stores it in `pf.compare.incomeOverrides` forever: removing the city doesn't clean it up, re-adding restores the stale override, changing home income doesn't re-seed suggestions, and there's no "reset to suggested" affordance.
**Where:** `src/tabs/CompareTab.jsx` (`setOverride`, `removeCity` ~lines 65–72).
**Why it matters:** Confusing stale numbers in a tab meant for quick what-ifs; minor storage cruft.
**Fix (small):** Delete the key from `incomeOverrides` in `removeCity`, and add a small "↺" button next to overridden income cells that deletes the override (cell falls back to the suggestion).

## 16. Hard-coded year `2026` in three unrelated places

**What:** `START_YEAR = 2026` in `simulate.js`; a literal `2026 + (draft.age - profile.age)` in `EventTimeline.jsx` (~line 326); the smoke test asserts footer text `/Tax & cost-of-living data: 2026/` while the footer actually renders `DATA_VINTAGE` from the federal tax file.
**Why it matters:** The annual data refresh (the app's stated maintenance model) requires touching code, not just data, and the places don't reference each other.
**Fix (small):** Export/import `START_YEAR` into `EventTimeline.jsx`; consider deriving `START_YEAR` from `DATA_VINTAGE` in `data.js` so a data-file swap moves the whole app forward in one place. Update the smoke-test regex to build from the imported value.

## 17. Security posture — low risk, two notes (severity: low / informational)

The attack surface is minimal by design: static site, no server, no third-party requests, strict CSP (`default-src 'self'`, `frame-ancestors 'none'`, etc.), React's default XSS escaping, no secrets anywhere in the repo, financial data never leaves the browser. Remaining notes:
- **`style-src 'unsafe-inline'`** is required by Framer Motion/Recharts inline styles. Acceptable; just don't loosen `script-src` to match if a future library asks.
- **User text fields** (debt/asset names) are rendered through React only — keep it that way; never `dangerouslySetInnerHTML` snapshot/entity strings.
- The CSP source-of-truth confusion (gap 10) is the only actionable item.

## 18. Documented modeling simplifications (not bugs — keep the list honest)

Already acknowledged in README "Known limitations": pre-tax retirement withdrawals, flat capital-gains rate, no brokerage tax drag, all-household (not income-bracketed) budget percentiles, no partner 401k / spousal Social Security. Also worth knowing (found in code, not in README): partner income never enters the SS earnings history; local taxes are flat approximations of NYC's progressive schedule; IRS limits are held nominally fixed forever; home basis for a starting home = its value at sim start (understates taxable gain on later sale). If any of these graduates to "fix it", start by adding it to README's limitations list so the docs and code move together.
