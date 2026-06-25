# Personal Finance Web App — Build Brief

**Audience:** the model/agent building this from scratch (referred to here as "the builder").
**Goal:** a clean, fast, ad-free, paywall-free personal finance planner that does three things well: project a lifetime net-worth trajectory, build a budget via percentile sliders, and compare cost of living across cities. No bloat, no account walls.

---

## 1. Product summary

A single-page web app with three tabs in a horizontal top bar: **Trajectory** (the flagship), **Budget**, and **Compare**. The app is fully client-side with bundled datasets — no backend, no accounts. All user data persists in browser local storage. The defining qualities are a modern, uncluttered interface, subtle but colorful animation, and "smart defaults over data entry" — the user enters as little as possible and the app fills in realistic figures from bundled reference data.

### Design language
- Modern, clean, generous whitespace, strong typographic hierarchy.
- A colorful but restrained palette; color is used to carry meaning (category blocks, good/bad comparisons, percentile heat).
- Subtle, tasteful motion via Framer Motion: animated number transitions, chart line draw-in, slider marker easing, tab cross-fades, color transitions. Animation should feel alive, never distracting.
- Horizontal tab bar fixed at top; instant client-side tab switching with a soft cross-fade. No page reloads.

### Tech stack (required)
- **React** (functional components + hooks)
- **Tailwind CSS** for styling
- **Recharts** for all charts (line chart, stacked bar, small distribution curves)
- **Framer Motion** for animation
- Single self-contained SPA, deployable as static files (e.g., Vite build → static host). No server runtime.
- All reference data in a versioned `/data` folder of JSON files (see §11). Updating data later = swap a file.

---

## 2. Architecture overview

```
┌─────────────────────────────────────────────────────────┐
│ App shell: top tab bar (Trajectory | Budget | Compare)   │
├─────────────────────────────────────────────────────────┤
│ Shared Profile  (localStorage)  ← single source of truth │
│   + Constants   (localStorage)                            │
├─────────────────────────────────────────────────────────┤
│ Simulation Engine (pure functions, nominal $ internally) │
│   ↳ consumed by Trajectory; reused for Compare tax calc   │
├─────────────────────────────────────────────────────────┤
│ Bundled datasets  (/data/*.json, versioned)              │
└─────────────────────────────────────────────────────────┘
```

Three principles that should not be violated:

1. **One shared profile.** Age, location, income, balances, debts, assets, and the constants are stored once and read by all three tabs. The user never re-enters shared fields when switching tabs.
2. **One engine, nominal internally.** The projection engine computes everything in nominal dollars year by year. The real/nominal toggle is a pure display transform applied to engine output. There is exactly one calculation path. This is also what keeps capital-gains tax correct (gains are taxed nominally).
3. **Versioned data, never hardcoded.** All tax tables, cost-of-living indices, spending means/dispersions, and life-event costs live in `/data/*.json` with a `vintage` and `source` field. Each file is independently swappable. The app surfaces the data vintage to the user somewhere unobtrusive (e.g., a footer: "Tax & cost-of-living data: 2026").

---

## 3. Shared profile schema (localStorage)

Stored under a single key (e.g., `pf.profile`). All tabs read/write this object.

```jsonc
{
  "age": 32,
  "filingStatus": "single",        // "single" | "mfj" | "hoh"
  "homeCity": "Los Angeles, CA",    // key into cities.json
  "income": 120000,                 // annual gross, user's own salary
  "cash": 25000,                    // liquid savings
  "investments": 80000,             // taxable brokerage bucket
  "k401": {
    "balance": 95000,
    "employeeContribPct": 0.10,     // % of user salary
    "employerMatchRate": 1.0,       // matches 100% ...
    "employerMatchCapPct": 0.04     // ... up to 4% of salary
  },
  "debts": [
    { "id": "d1", "name": "Student loan", "balance": 18000, "apr": 0.055, "termYears": 8 }
  ],
  "home": {                          // null if renter
    "owned": true,
    "value": 700000,
    "mortgageDebtId": "m1"           // links to a debt entry
  },
  "assets": [                        // catch-all named assets
    { "id": "a1", "name": "Vintage car", "value": 30000, "appreciation": 0.03 }
  ],
  "baselineSpending": 60000          // annual; Budget tab can populate this
}
```

Constants are stored separately (e.g., `pf.constants`); see §6.

---

## 4. The simulation engine (the heart of the app)

A pure function: `simulate(profile, constants, events) → YearSnapshot[]`, one snapshot per year from current age to age 100. **Annual time steps.** Internally nominal. No closed-form compounding — an explicit year-by-year loop, because events, moves, lifestyle changes, and asset sales all mutate state mid-timeline.

### 4.1 State carried across years
- Active income (user + partner), active 401k params, active city (→ tax jurisdiction + COL scaling), active COL multiplier, active filing status, active values of every constant (a piecewise-constant schedule), and the live balance sheet: cash, investments, 401k, home (value + mortgage), named assets, debts.

### 4.2 Entities & lifecycle
Debts, the home, named assets, and jobs are entities with stable IDs and a lifecycle. **Any event that references an entity must validate against the simulated state at that event's point in time.** Practical consequences:
- "Pay off debt" / "Sell asset" / "Sell home" dropdowns only offer entities that still exist (positive balance / still owned) at that event's age — which requires replaying the timeline up to the event to populate the UI options.
- A debt that fully amortizes before its scheduled payoff event → payoff becomes a no-op with a soft warning.
- "Divorce" is only selectable if a marriage is active at that age.
- This is the most test-sensitive area; see acceptance tests in §15.

### 4.3 Order of operations within each simulated year (age `a`)
1. **Apply scheduled mutations** effective at age `a`: any Constant Change events update the active constant values from here forward; Move updates active city; COL Change updates the active spending multiplier; Marriage/Divorce update household + filing status.
2. **Resolve income.** Apply active job income (set by New Job / Promotion); grow by nominal salary growth since the last change. Add partner income if married.
3. **401k contributions.** Employee contribution = `min(employeeContribPct × userSalary, IRS employee limit)`. Employer match = `min(employeeContribPct, employerMatchCapPct) × userSalary × employerMatchRate`. Combined capped at the IRS annual-additions limit. Employee contribution reduces taxable income (traditional/pre-tax assumed).
4. **Taxes** (see §12): federal income tax on `gross − pretax401k − standardDeduction`, FICA, state, local — using the active jurisdiction and filing status. Effective rate = total tax ÷ gross.
5. **Spending.** `activeSpending = baselineSpending × cityCOLfactor × lifestyleMultiplier` + windowed event expenses (e.g., child costs) + property tax if a home is owned + debt service.
6. **Cash flow & saving rate.** `netSavings = afterTaxIncome − spending − employeeContrib − debtPayments`. Saving rate = `netSavings ÷ afterTaxIncome` (label clearly). Positive net flows to cash/investments; negative draws down cash then investments.
7. **One-time event cash flows at age `a`:** inheritance/windfall (in), large expense (out), house purchase (down payment + closing out; create mortgage debt; create home asset), asset purchase (out; create asset with basis), asset/home sale (proceeds in, net of capital-gains tax — see §13), debt payoff (lump out, zero the balance), marriage (partner cash/assets in, partner debt added), divorce (50/50 split — see §9).
8. **Grow balances** by their nominal rates: investments and 401k by market return; home value by home appreciation; each named asset by its own appreciation rate.
9. **Amortize debts:** for each debt, `interest = balance × apr`; `payment = 12 × monthlyPayment`; `balance = max(0, balance + interest − payment)`. Monthly payment from the standard amortization formula (§14).
10. **Record snapshot:** `netWorth = cash + investments + k401 + homeEquity + assets − totalDebt`, plus the component breakdown (401k, savings, assets, debt) for the hover tooltip.

### 4.4 Accumulation vs. decumulation
- **Before the retirement age:** as above; employment income flows in.
- **At/after retirement age:** employment income stops. The portfolio (investments + 401k) is drawn down by the target annual withdrawal (held constant in *real* terms → grown by inflation in nominal). Social Security benefit begins at the claiming age and supplements/reduces the required withdrawal. Portfolio still grows at the return rate; withdrawals + retirement taxes reduce it. If the portfolio reaches zero before age 100, the chart shows it (this is a feature — it visualizes running out).
- Retirement withdrawals are treated **pre-tax** for v1 (label the withdrawal figure as pre-tax; retirement-income taxation is a documented future refinement).

### 4.5 Real / nominal toggle
Engine output is nominal. For the **real** view (default), deflate each year's values by cumulative inflation: `realValue(t) = nominalValue(t) ÷ Π(1 + inflation_year)` from the start year to year `t`. Because inflation itself can change via a Constant Change event, use the cumulative product of each year's active inflation rate, not a fixed power. The toggle lives at the top of the Trajectory chart; default = **real (today's dollars)**.

---

## 5. Tab 1 — Trajectory (flagship)

### 5.1 Baseline input section (top)
A dense but tidy form writing into the shared profile: age, filing status, home city/state (with autocomplete from `cities.json`), income, cash/savings, taxable investments, 401k (balance, employee contribution %, employer match rate %, match cap %), debts (repeatable rows: name, balance, APR, term), home (toggle owned/renting; if owned: value + mortgage as a debt), and named assets (name, value, appreciation %). A collapsible **Constants Panel** (§6) holds the global assumptions.

**Tax automation:** when the user sets home city/state, the app derives the effective tax rate automatically (federal + FICA + state + local, per filing status) and displays it. The user does not enter tax rates.

### 5.2 The chart (bottom)
A Recharts line chart of projected **net worth** from current age to 100, animated to draw in. The line itself can use a subtle color gradient.

**Three interacting controls** on/around the chart:
- **Desired retirement age**
- **Target annual withdrawal** (pre-tax)
- **Safe withdrawal rate (SWR)**, default 4%

Relationship: `safeAnnualWithdrawal = SWR × portfolioAtRetirement`.
- If the user fixes **retirement age** → display the resulting safe annual withdrawal.
- If the user fixes **target withdrawal** → solve for the earliest age where `SWR × portfolio(age) ≥ target`, and draw that age as a **dotted vertical line** on the chart.
- SWR is itself adjustable and re-solves the above.

**Hover tooltip:** hovering any point on the line shows that year's breakdown — 401k, savings/investments, assets, and debt — plus age/year and total net worth.

**Real/Nominal toggle** sits above the chart (default real).

### 5.3 The life-event timeline (key feature)
A horizontal timeline of the user's future. A persistent **+ (add event)** control opens a picker: the user enters an age or year, selects one of the 16 event types (§10), and fills in minimal inputs (often just checkboxes; the app pulls cost averages from `life-event-costs.json`). Added events appear as nodes on the timeline, sorted chronologically, each editable and removable. Adding/removing an event re-runs the engine and re-animates the net-worth line, so the user can weigh life choices against each other by adding and removing events. (No enable/disable toggle — pure add/remove, as specified.)

---

## 6. Constants Panel

A collapsible panel (under the baseline inputs) holding global assumptions. Because the engine is nominal, **all rate inputs are nominal.** Label them clearly so the user doesn't enter a real rate by mistake.

| Constant | Default | Notes |
|---|---|---|
| Market return (nominal) | **7.0%** | applies to investments + 401k |
| Inflation | **2.5%** | used to deflate to the real view and to reconcile nominal inputs |
| Salary growth (nominal) | **3.5%** | ≈ 1% real raises |
| Home appreciation (nominal) | **3.5%** | ≈ 1% real |
| Capital gains rate | **15%** | flat; see §13 |
| Social Security claiming age | **67** | adjustable |

Defaults ship in `constants-defaults.json`. Any constant can also be changed *at a point in time* via the Constant Change life event (§10), which creates a piecewise schedule rather than a single global value.

---

## 7. Tab 2 — Budget

### 7.1 Inputs
Starts from the **same shared profile** (age, income, savings, debts) — no re-entry. The Budget tab adds the spending layer.

### 7.2 Percentile sliders (the unique feature)
One slider per spending category (Rent/Shelter, Groceries, Utilities, Auto/Transport, Dining, Travel, Entertainment, Healthcare, Insurance, Apparel, Hobbies/Shopping, Misc — final list mirrors `spending-distributions.json`). Each slider represents **what percentile of US households the user spends in for that category.**

- Each category is modeled as a **lognormal distribution** anchored to its BLS mean, with a per-category dispersion σ (§11.5). The slider position (a percentile `p`) maps to a dollar amount, and vice versa — **two-way bound**: dragging the slider updates the dollar field; typing a dollar snaps the slider to the matching percentile. (Formulas in §14.)
- Above each slider, render a small **distribution curve** (the lognormal PDF) with a **dot that slides along the curve** as the user adjusts the slider, so they see where they fall. Because spending is lognormal, the curve is **right-skewed** (long right tail) — this is correct and intentional.
- The marker **warms in color past ~85th percentile** (cool blue → amber), giving a gentle "you're a heavy spender here" cue without nagging.
- Percentiles are **among all US households** (per decision; the data limitation that clean per-income-bracket percentile curves aren't published is the reason). Label this clearly somewhere on the tab.

### 7.3 Output (right side)
A single-column **stacked bar chart** with color blocks for the top-level groups: **Saving, Tax, Spending.** Clicking a block expands it to show its subcategories with dollar amount and % of the whole (animated expand). Below the chart, summary stats: **net saving** and **saving rate.**

### 7.4 Integration
The Budget tab's computed total annual spending can populate `profile.baselineSpending` (a one-tap "use my budget in Trajectory," or automatic via the shared profile) so the two tabs agree.

---

## 8. Tab 3 — Compare

### 8.1 Inputs
- User's financial info comes from the shared profile.
- **City selection:** choose 2–4 cities from the **top 50 US cities** (search box with autocomplete from `cities.json`). The user's **home city is the grey baseline** column (leftmost).
- **Per-city income override:** the user can set a different income for each city (careers pay differently by metro). Optionally seed each with a COL-adjusted suggestion (`income × indexCity / indexHome`) that the user can overwrite.

### 8.2 Layout & coloring
Each city is a column. Rows are the spending categories (same set as Budget) plus income and a bottom **effective saving rate** row. Each city's per-category cost = the user's baseline for that category scaled by that city's cost-of-living index (category-level where available). Each city uses its **correct tax** (federal + FICA + state + local for that jurisdiction and the user's filing status).

**Conditional formatting = percentage difference from the home (baseline) city**, with the color direction depending on row type:
- **Cost rows:** lower than home = green, higher = red (cheaper is better).
- **Income & saving-rate rows:** higher than home = green, lower = red (more is better).

Gradient bands (by % difference from baseline):

| % difference | Color |
|---|---|
| ≤ −15% | deep green |
| −5% to −15% | light green |
| −5% to +5% | neutral |
| +5% to +15% | light red |
| ≥ +15% | deep red |

(Reverse the green/red assignment for income/saving rows.) The home column stays grey throughout. Show the resulting **effective saving rate** per city at the bottom.

---

## 9. Marriage / Divorce specifics

**Marriage** (at chosen age): user enters partner income, partner current savings, partner current debt, and a COL increase.
- Partner income combines into household income from that age forward.
- Partner savings add to investments (one-time).
- Partner debt enters as a named debt (balance + an APR the user sets).
- The COL increase bumps spending from that age.
- **Filing status → Married Filing Jointly** from that age (changes the tax math).
- Simplifications: 401k contributions stay tied to the **user's own salary** (no separate partner 401k); **no separate partner Social Security** in retirement.

**Divorce** (at chosen age; only selectable if a marriage is active):
- **Halve the entire balance sheet 50/50** — cash, investments, 401k, home equity, named assets, **and** debts.
- The **home is sold** and the equity split (mortgage and property tax stop).
- Partner income drops off; filing status reverts to **single**; the marriage-era COL bump is removed.

---

## 10. Life-event catalog (final — 16 types)

All events are placed by age/year, mutate state from that point forward unless one-time, and (where they reference an entity) validate against the timeline state at their age.

| # | Event | User inputs (minimal) | Model effect |
|---|---|---|---|
| 1 | New job | new income; 401k contrib % + match rate + cap | income changes from this age; 401k params update |
| 2 | Promotion / raise | new income or % bump | income steps up; everything else continues |
| 3 | House purchase | price, down %, mortgage rate, term | down payment + closing out of cash; create mortgage debt; create appreciating home asset; add property tax (from city) to spending |
| 4 | Child born | checkboxes: childcare, private K-12, college fund (529) | windowed recurring expense (birth → 18, or → 22 if college selected) from `life-event-costs.json`; auto-ends |
| 5 | Inheritance / windfall | amount | one-time lump into cash/investments |
| 6 | Large expense | amount | one-time lump out |
| 7 | New debt | name, balance, APR, term | adds an amortizing debt |
| 8 | Pay off debt | select existing debt (validated dropdown) | lump sum out of savings clears the balance; frees the payment |
| 9 | Move | new city | new tax jurisdiction **and** COL-rescaled expenses from this age (its own COL change) |
| 10 | Constant Change | pick a constant + new value | piecewise change to that constant from this age forward |
| 11 | Sell home | (the home) | home sold; equity (net of cap-gains w/ primary-residence exclusion) to cash; mortgage + property tax end |
| 12 | New asset | name, value, annual appreciation | one-time purchase (cash out); asset appreciates; cost basis recorded |
| 13 | Sell asset | select owned asset (validated dropdown) | proceeds in, net of capital-gains tax on the gain |
| 14 | COL Change | lifestyle slider (0.5×–2.0×, center = current) | proportional total-spending multiplier from this age; live saving-rate readout; persists until overridden; stacks multiplicatively with Move |
| 15 | Marriage | partner income, savings, debt; COL increase | see §9 |
| 16 | Divorce | (none beyond age) | see §9 |

---

## 11. Bundled datasets (`/data/*.json`)

Each file includes top-level `vintage` and `source` fields. Values below are the sourced anchors as of 2026 — populate the full tables from the cited sources.

### 11.1 `tax-federal-2026.json`
- Source: IRS Rev. Proc. 2025-32 (via Tax Foundation tables).
- Seven brackets: 10 / 12 / 22 / 24 / 32 / 35 / 37%. Populate the full threshold table per filing status from the source.
- Standard deduction: **$16,100** single, **$32,200** MFJ, **$24,150** HoH.
- Top (37%) bracket begins at **$640,600** single / **$768,700** MFJ.
- FICA: Social Security **6.2%** on wages up to the **$184,500** wage base; Medicare **1.45%**; Additional Medicare **0.9%** above $200k single / $250k MFJ.

```jsonc
{
  "vintage": 2026, "source": "IRS Rev. Proc. 2025-32",
  "brackets": {
    "single": [ {"upTo": 11925, "rate": 0.10}, /* ...populate full table..., */ {"upTo": null, "rate": 0.37} ],
    "mfj": [ /* ... */ ], "hoh": [ /* ... */ ]
  },
  "standardDeduction": { "single": 16100, "mfj": 32200, "hoh": 24150 },
  "fica": { "ssRate": 0.062, "ssWageBase": 184500, "medicareRate": 0.0145,
            "addlMedicareRate": 0.009, "addlMedicareThreshold": { "single": 200000, "mfj": 250000 } }
}
```

### 11.2 `tax-state-2026.json`
- Source: Tax Foundation state individual income tax tables.
- Per state: `type` = `"none" | "flat" | "progressive"`, plus flat rate or bracket array, and state standard deduction. Nine states have no wage income tax. Only states containing the top-50 cities are strictly required.

### 11.3 `tax-local-2026.json`
- Source: city finance departments / Tax Foundation.
- Per applicable city: local income tax rate. Only ~a dozen of the top 50 have one (e.g., NYC, Philadelphia, several OH/MD/MI cities). Most entries are 0.

### 11.4 `cost-of-living.json`
- Source: BEA Regional Price Parities (metro-level; index 100 = US average) + Zillow for rent/home values. C2ER is an optional later upgrade where its category detail is accessible.
- Per city (top 50): composite index, category indices (housing, utilities, groceries, transportation, healthcare, misc), median rent, median home price, property-tax rate. Salary/expense equivalency uses `value × (indexTarget ÷ indexHome)`.

### 11.5 `spending-distributions.json`
- Source: BLS Consumer Expenditure Survey 2024 (released Dec 2025) for the means; dispersions (σ) are calibrated estimates (below), flagged as such and overridable.
- Anchors: total ~$78,535/yr against ~$104,207 pre-tax income; housing 33.4%, transportation 17.0%, food 12.9%, personal insurance & pensions 12.5%, healthcare 7.9%, entertainment 4.6%, apparel 2.5%, education 2.0%.
- Per category: `displayName`, `meanAnnual` (BLS), `sigma` (log-scale SD), `parentGroup` ("Spending"), `colSensitive` (bool).

Calibrated σ (log-scale dispersion), tight for necessities → wide for discretionary:

| Category | σ |
|---|---|
| Rent / shelter | 0.50 |
| Groceries | 0.45 |
| Utilities | 0.40 |
| Insurance | 0.50 |
| Auto / transport | 0.60 |
| Healthcare | 0.70 |
| Apparel | 0.70 |
| Dining | 0.80 |
| Hobbies / shopping | 0.80 |
| Entertainment | 0.85 |
| Travel | 1.00 |

### 11.6 `life-event-costs.json`
- Sources: USDA (child totals), Care.com / DOL (childcare), PrivateSchoolReview (K-12), CollegeBoard / US News (college).
- Child total: ~$280K–$320K birth-to-18 (inflation-adjusted), housing/food/childcare-dominant.
- Childcare: ~$17,800/yr national average for under-5; include state multipliers (range ~$22K TX → ~$42K CT).
- Private K-12: ~$15,000/yr national average (elementary ~$14,000, high school ~$18,000).
- College (529 target, all-in): public in-state ~$24,000/yr (~$11,400 tuition); private ~$58,000/yr (~$45,000 tuition).
- House-purchase fallback price, closing-cost %, default property-tax rate (override from city).

### 11.7 `retirement-config.json`
- Source: IRS Notice 2025-67 + SSA.
- 401k employee limit **$24,500**; combined employee+employer cap **$72,000**; IRA **$7,500**.
- Social Security: FRA **67** (born ≥1960); wage base **$184,500**; max benefit ~**$4,150/mo** at FRA; average retired-worker benefit ~**$2,081/mo**; COLA 2.5% (2026).
- SS claiming adjustment: 62 = −30%, FRA = 100%, 70 = +24% (delayed credits ~8%/yr after FRA; ~5/9% per month reduction before FRA).
- PIA bend-point parameters (90% / 32% / 15% tiers) — populate the dollar breakpoints from SSA's published 2026 figures.

### 11.8 `cities.json`
- Top 50 US cities: display name, state, lat/long, and keys mapping to `cost-of-living.json` and the relevant `tax-state` / `tax-local` entries. Powers autocomplete in Trajectory, Move, and Compare.

### 11.9 `constants-defaults.json`
- The six defaults from §6.

---

## 12. Tax engine spec

`effectiveTax(grossIncome, filingStatus, city) → { federal, fica, state, local, total, effectiveRate }`

1. **Taxable income** = `gross − pretax401k − standardDeduction[filingStatus]` (floored at 0).
2. **Federal** = progressive sum across `brackets[filingStatus]`.
3. **FICA** = `min(wages, ssWageBase) × 0.062 + wages × 0.0145 + max(0, wages − addlThreshold) × 0.009`.
4. **State** = none / flat / progressive per `tax-state-2026.json`.
5. **Local** = `wages × localRate` from `tax-local-2026.json` (0 for most cities).
6. **effectiveRate** = `total ÷ gross`.

Reused by Trajectory (each simulated year) and Compare (per city). Filing status comes from the profile and is flipped by Marriage/Divorce in the timeline.

---

## 13. Capital-gains spec (simple, flat)

- Rate = the Constants Panel capital-gains rate (default 15%), flat. No long/short distinction in v1.
- **Named asset sale:** `gain = saleValue − costBasis`; `tax = max(0, gain) × rate`; net proceeds → cash/investments.
- **Home sale:** `gain = saleValue − purchasePrice`; apply the **primary-residence exclusion** ($250,000 single / $500,000 MFJ) → `taxableGain = max(0, gain − exclusion)`; `tax = taxableGain × rate`. Net proceeds = `saleValue − remainingMortgage − tax`. Home leaves the balance sheet; mortgage payment and property tax stop. (The exclusion is the one carve-out kept under "simple" — without it, home sales look badly overtaxed.)

---

## 14. Key formulas

**Lognormal percentile ↔ dollar** (category mean `m`, log-SD `σ`):
```
mu = ln(m) − σ²/2            // so that mean(X) = m
dollarAtPercentile(p) = exp( mu + σ · Φ⁻¹(p) )     // Φ⁻¹ = inverse standard normal CDF
percentileOfDollar(x)  = Φ( (ln(x) − mu) / σ )
pdf(x)                 = (1 / (x·σ·√(2π))) · exp( −(ln(x) − mu)² / (2σ²) )  // the curve drawn above the slider
```

**Cost-of-living scaling** (per COL-sensitive category): `expenseTarget = expenseBaseline × (indexTarget ÷ indexHome)`.

**Debt amortization** (monthly rate `r = apr/12`, `n = termYears × 12`):
```
monthlyPayment = balance × (r·(1+r)^n) / ((1+r)^n − 1)
// annual step: interest = balance × apr; balance = max(0, balance + interest − 12·monthlyPayment)
```

**Real-view deflation:** `real(t) = nominal(t) ÷ Π_{k=startYear}^{t} (1 + inflation_k)`.

**SWR solve:** `safeWithdrawal = SWR × portfolioAtRetirement`; to solve age from a target, find the earliest age where `SWR × portfolio(age) ≥ target`.

---

## 15. Acceptance test scenarios (engine validation)

Build these as automated checks — they exercise the timeline-dependent state resolution and the entity-lifecycle validation that are the riskiest parts.

1. **Compound baseline:** no events; net worth grows monotonically pre-retirement at the expected nominal rate; real view is correctly deflated; toggling real/nominal changes only display, never the shape's logic.
2. **House + mortgage + payoff:** buy a house at 35 (down payment leaves cash, mortgage debt appears, home asset appreciates, property tax added); pay off that mortgage at 50 (dropdown only offers it while it has a balance; lump leaves savings; payment frees up afterward).
3. **Child windowing:** child born at 33 with childcare + college fund → recurring expense appears birth→22 and disappears after; removing the event restores the prior line exactly.
4. **Move then COL Change:** move LA→Dallas at 40 (tax + COL drop), then COL Change to 1.3× at 45 → multipliers stack; saving rate reflects both.
5. **Constant Change schedule:** inflation 2.5% until 2036, then a Constant Change to 2.0% → real-view deflation uses the piecewise cumulative product, not a fixed power.
6. **Asset buy/sell with gains:** buy a $30k asset in 2028 (cash out), sell in 2038 at $50k → $20k gain taxed at 15%, net proceeds in.
7. **Home sale with exclusion:** sell a home with a $400k gain, single filer → $250k excluded, $150k taxed at 15%; mortgage cleared from proceeds; property tax stops.
8. **Marriage → Divorce:** marry at 30 (incomes combine, filing→MFJ, partner assets/debt in); divorce at 45 (balance sheet halved incl. debts, home sold & split, filing→single, partner income gone); divorce not selectable if no active marriage.
9. **Run-out-of-money:** aggressive withdrawal target → portfolio hits zero before 100 and the chart shows it.
10. **Retirement controls:** fixing retirement age yields a safe withdrawal; fixing a target withdrawal draws the dotted age line; changing SWR re-solves both.

---

## 16. Suggested build sequence

1. App shell + tab bar + shared profile (localStorage) + Constants Panel.
2. Data layer: load `/data/*.json`; tax engine (§12) with unit tests.
3. Simulation engine (§4) with the §15 acceptance tests — get this rock-solid before UI polish.
4. Trajectory: baseline form → net-worth chart → retirement controls → hover tooltip → real/nominal toggle.
5. Life-event timeline + the 16 events (§10), wiring each into the engine with entity validation.
6. Budget: percentile sliders + lognormal curves + two-way binding + stacked drill-down chart + summary; feed total to Trajectory.
7. Compare: city autocomplete + columns + per-city tax/COL + conditional-format gradient + per-city income override.
8. Animation pass (Framer Motion) and visual polish; data-vintage footer.

---

## 17. Out of scope for v1 (documented refinements)
- Retirement-income taxation (withdrawals are pre-tax in v1).
- Long/short-term capital-gains distinction (flat rate in v1).
- Annual tax drag on the taxable brokerage bucket (it compounds untaxed; named assets and the home are taxed on sale — accepted asymmetry).
- Per-income-bracket spending percentiles (all-US-household basis in v1, due to data availability).
- Partner 401k and spousal Social Security.
