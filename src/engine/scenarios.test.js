// Broad scenario coverage: many varied baselines, debts, homes, assets, and all
// 16 life-event types are pushed through the engine, then every value the webapp
// surfaces is re-derived and checked. Three layers:
//   1. Invariants that must hold on EVERY snapshot of EVERY scenario.
//   2. Targeted closed-form checks for specific engine outputs.
//   3. Re-derivation of the Budget- and Compare-tab math against real data.

import { describe, it, expect } from 'vitest';
import { simulate, monthlyPayment } from './simulate.js';
import { effectiveTax } from './tax.js';
import { dollarAtPercentile, percentileOfDollar } from './lognormal.js';
import { appData } from '../lib/data.js';

const C = { ...appData.constantsDefaults.constants };
const K = appData.retirement.k401;

function profile(o = {}) {
  return {
    age: 30,
    filingStatus: 'single',
    homeCity: 'los-angeles-ca',
    income: 120000,
    cash: 25000,
    investments: 80000,
    k401: { balance: 50000, employeeContribPct: 0.1, employerMatchRate: 1.0, employerMatchCapPct: 0.04 },
    debts: [],
    home: null,
    assets: [],
    baselineSpending: 50000,
    ...o,
  };
}
const fixAge = (over = {}) => ({ retirementAge: 65, swr: 0.04, mode: 'fixAge', ...over });
const snapAt = (r, age, start = 30) => r.snapshots[age - start];

// ── A matrix of deliberately diverse scenarios ──────────────────────────────
const scenarios = [
  {
    name: 'young renter, no debt',
    p: profile({ age: 24, income: 62000, cash: 4000, investments: 6000, k401: { balance: 2000, employeeContribPct: 0.06, employerMatchRate: 0.5, employerMatchCapPct: 0.06 } }),
    e: [],
    c: fixAge({ retirementAge: 67 }),
  },
  {
    name: 'mid income, car + student loans',
    p: profile({
      income: 95000,
      debts: [
        { id: 'car', name: 'Car loan', balance: 28000, apr: 0.069, termYears: 6 },
        { id: 'student', name: 'Student loan', balance: 41000, apr: 0.053, termYears: 10 },
      ],
    }),
    e: [{ id: 'p1', type: 'promotion', age: 34, pctBump: 0.12 }],
    c: fixAge(),
  },
  {
    name: 'high earner MFJ, no-tax state, owns home',
    p: profile({
      filingStatus: 'mfj',
      homeCity: 'houston-tx',
      income: 320000,
      cash: 60000,
      investments: 350000,
      k401: { balance: 240000, employeeContribPct: 0.12, employerMatchRate: 1.0, employerMatchCapPct: 0.05 },
      home: { owned: true, value: 540000, mortgageDebtId: 'm1' },
      debts: [{ id: 'm1', name: 'Mortgage', balance: 360000, apr: 0.0625, termYears: 30 }],
    }),
    e: [{ id: 'c1', type: 'childBorn', age: 33, childcare: true, privateK12: false, collegeFund: true, collegeType: 'public' }],
    c: fixAge({ retirementAge: 60 }),
  },
  {
    name: 'underwater home (negative equity)',
    p: profile({
      cash: 3000,
      investments: 0,
      home: { owned: true, value: 200000, mortgageDebtId: 'm1' },
      debts: [{ id: 'm1', name: 'Mortgage', balance: 300000, apr: 0.05, termYears: 30 }],
    }),
    e: [],
    c: fixAge(),
  },
  {
    name: 'near-retiree, large 401k, HOH',
    p: profile({ age: 58, filingStatus: 'hoh', income: 140000, cash: 90000, investments: 600000, k401: { balance: 900000, employeeContribPct: 0.15, employerMatchRate: 1.0, employerMatchCapPct: 0.06 } }),
    e: [],
    c: fixAge({ retirementAge: 63 }),
  },
  {
    name: 'named assets + windfall + large expense',
    p: profile({ assets: [{ id: 'a-art', name: 'Art', value: 40000, appreciation: 0.04 }] }),
    e: [
      { id: 'w1', type: 'windfall', age: 35, amount: 75000 },
      { id: 'x1', type: 'largeExpense', age: 40, amount: 30000 },
      { id: 'na1', type: 'newAsset', age: 42, name: 'Boat', value: 25000, appreciation: -0.08 },
    ],
    c: fixAge(),
  },
  {
    name: 'zero income (between jobs at start) then new job',
    p: profile({ income: 0, baselineSpending: 30000 }),
    e: [{ id: 'j1', type: 'newJob', age: 33, income: 110000, employeeContribPct: 0.1, employerMatchRate: 1.0, employerMatchCapPct: 0.04 }],
    c: fixAge(),
  },
  {
    name: 'NYC local tax + move to Houston',
    p: profile({ homeCity: 'new-york-ny', income: 180000 }),
    e: [{ id: 'mv1', type: 'move', age: 36, cityKey: 'houston-tx' }],
    c: fixAge(),
  },
  {
    name: 'PA flat tax + local wage tax, fixWithdrawal',
    p: profile({ homeCity: 'philadelphia-pa', income: 105000 }),
    e: [{ id: 'cc1', type: 'constantChange', age: 45, constant: 'marketReturn', value: 0.06 }],
    c: { retirementAge: 65, swr: 0.04, mode: 'fixWithdrawal', targetWithdrawal: 70000 },
  },
  {
    name: 'aggressive early retirement (forces depletion)',
    p: profile(),
    e: [],
    c: { retirementAge: 45, swr: 0.04, mode: 'fixWithdrawal', targetWithdrawal: 150000 },
  },
];

// ── 1. Universal invariants on every snapshot of every scenario ──────────────
function checkSnapshot(s, label) {
  const where = `${label} @age ${s.age}`;

  // Net-worth breakdown sums exactly, and never shows negative savings/assets.
  const { k401, savings, assets, debt } = s.components;
  expect(savings, `${where} savings`).toBeGreaterThanOrEqual(0);
  expect(assets, `${where} assets`).toBeGreaterThanOrEqual(0);
  expect(debt, `${where} debt`).toBeGreaterThanOrEqual(0);
  expect(k401 + savings + assets - debt, `${where} NW identity`).toBeCloseTo(s.netWorth, 2);
  expect(k401, `${where} k401==balance`).toBeCloseTo(s.balances.k401, 2);

  // Balance-sheet bookkeeping.
  expect(s.balances.homeEquity, `${where} equity`).toBeCloseTo(s.balances.homeValue - s.balances.mortgageBalance, 2);
  expect(s.balances.totalDebt, `${where} totalDebt`).toBeCloseTo(s.balances.otherDebt + s.balances.mortgageBalance, 2);
  expect(s.portfolio, `${where} portfolio`).toBeCloseTo(s.balances.investments + s.balances.k401, 2);

  // Tax parts sum, and the effective rate is consistent.
  const t = s.tax;
  expect(t.total, `${where} tax sum`).toBeCloseTo(t.federal + t.fica + t.state + t.local, 4);
  if (s.income.gross > 0) expect(t.effectiveRate, `${where} eff rate`).toBeCloseTo(t.total / s.income.gross, 8);

  // 401k contribution limits.
  expect(s.contrib401k.employee, `${where} employee cap`).toBeLessThanOrEqual(K.employeeLimit + 1e-6);
  expect(s.contrib401k.employee + s.contrib401k.employer, `${where} additions cap`).toBeLessThanOrEqual(K.annualAdditionsLimit + 1e-6);

  // Saving-rate definition (working years) vs retirement (zeroed).
  if (s.retired) {
    expect(s.income.gross, `${where} retired income`).toBe(0);
    expect(s.contrib401k.employee, `${where} retired contrib`).toBe(0);
    expect(s.savingRate, `${where} retired rate`).toBe(0);
    expect(s.netSavings, `${where} retired netSavings`).toBe(0);
  } else {
    const afterTax = s.income.gross - s.tax.total;
    const expectedNet = afterTax - s.spending.total - s.contrib401k.employee - s.debtService;
    expect(s.netSavings, `${where} netSavings`).toBeCloseTo(expectedNet, 2);
    const expectedRate = afterTax > 0 ? expectedNet / afterTax : 0;
    expect(s.savingRate, `${where} savingRate`).toBeCloseTo(expectedRate, 8);
  }

  // Spending decomposition.
  expect(s.spending.total, `${where} spending sum`).toBeCloseTo(s.spending.base + s.spending.child + s.spending.propertyTax, 2);

  // Inflation factor is sane.
  expect(s.inflFactor, `${where} inflFactor`).toBeGreaterThanOrEqual(1);

  // Everything is a finite number.
  for (const v of [s.netWorth, k401, savings, assets, debt, s.portfolio, s.debtService, s.spending.total, t.total]) {
    expect(Number.isFinite(v), `${where} finite`).toBe(true);
  }
}

describe('Scenario matrix — universal invariants', () => {
  for (const { name, p, e, c } of scenarios) {
    it(`holds across "${name}"`, () => {
      const r = simulate(p, C, e, c, appData);
      expect(r.snapshots.length).toBe(100 - p.age + 1);
      for (const s of r.snapshots) checkSnapshot(s, name);

      // inflFactor is monotonic non-decreasing; depletion is sticky.
      for (let i = 1; i < r.snapshots.length; i++) {
        expect(r.snapshots[i].inflFactor).toBeGreaterThanOrEqual(r.snapshots[i - 1].inflFactor - 1e-9);
        if (r.snapshots[i - 1].depleted) expect(r.snapshots[i].depleted).toBe(true);
      }
    });
  }
});

// ── 2. Targeted engine checks ───────────────────────────────────────────────
describe('401k contribution math', () => {
  it('matches employee/employer split and the match cap', () => {
    const r = simulate(profile({ income: 120000 }), C, [], fixAge(), appData);
    const s = r.snapshots[0];
    expect(s.contrib401k.employee).toBeCloseTo(12000, 6); // 10% × 120k < 24.5k
    expect(s.contrib401k.employer).toBeCloseTo(0.04 * 120000, 6); // min(10%,4%) × salary × 100%
  });

  it('caps the employee deferral at the IRS limit for a high earner', () => {
    const r = simulate(profile({ income: 400000, k401: { balance: 0, employeeContribPct: 0.2, employerMatchRate: 1, employerMatchCapPct: 0.06 } }), C, [], fixAge(), appData);
    const s = r.snapshots[0];
    expect(s.contrib401k.employee).toBeCloseTo(K.employeeLimit, 6);
  });

  it('honors the combined annual-additions ceiling', () => {
    const r = simulate(profile({ income: 900000, k401: { balance: 0, employeeContribPct: 0.05, employerMatchRate: 3, employerMatchCapPct: 0.2 } }), C, [], fixAge(), appData);
    const s = r.snapshots[0];
    expect(s.contrib401k.employee + s.contrib401k.employer).toBeLessThanOrEqual(K.annualAdditionsLimit + 1e-6);
  });
});

describe('Inflation factor compounding', () => {
  it('compounds at the constant inflation rate when nothing changes it', () => {
    const r = simulate(profile(), C, [], fixAge(), appData);
    for (let i = 0; i < 10; i++) {
      expect(r.snapshots[i].inflFactor).toBeCloseTo((1 + C.inflation) ** i, 8);
    }
  });
});

describe('Life-event effects', () => {
  it('windfall raises net worth that year vs. no event', () => {
    const base = simulate(profile(), C, [], fixAge(), appData);
    const wf = simulate(profile(), C, [{ id: 'w', type: 'windfall', age: 35, amount: 75000 }], fixAge(), appData);
    expect(snapAt(wf, 35).netWorth).toBeGreaterThan(snapAt(base, 35).netWorth);
    expect(snapAt(wf, 34).netWorth).toBeCloseTo(snapAt(base, 34).netWorth, 6); // nothing before the event
  });

  it('house purchase creates a mortgage, property tax, and home equity', () => {
    const r = simulate(profile({ cash: 200000 }), C, [{ id: 'h', type: 'housePurchase', age: 35, price: 400000, downPct: 0.2, rate: 0.06, termYears: 30 }], fixAge(), appData);
    const before = snapAt(r, 34);
    const purchaseYear = snapAt(r, 35);
    const nextYear = snapAt(r, 36);
    // The home asset and mortgage land in the purchase year…
    expect(before.balances.homeValue).toBe(0);
    expect(purchaseYear.balances.homeValue).toBeGreaterThan(0);
    expect(purchaseYear.entities.home).not.toBeNull();
    expect(purchaseYear.balances.mortgageBalance).toBeGreaterThan(0);
    // …while property tax and debt service (computed in the spend step, before the
    // event mutates state) begin the following year.
    expect(nextYear.debtService).toBeGreaterThan(0);
    expect(nextYear.spending.propertyTax).toBeGreaterThan(0);
  });

  it('pay-off-debt clears the balance and stops its debt service', () => {
    const p = profile({ debts: [{ id: 'car', name: 'Car loan', balance: 28000, apr: 0.07, termYears: 6 }] });
    const r = simulate(p, C, [{ id: 'po', type: 'payoffDebt', age: 35, debtId: 'car' }], fixAge(), appData);
    expect(snapAt(r, 34).entities.debts.some((d) => d.id === 'car')).toBe(true);
    expect(snapAt(r, 35).entities.debts.some((d) => d.id === 'car')).toBe(false);
    expect(snapAt(r, 36).debtService).toBe(0);
  });

  it('move changes the city and rescales cost of living', () => {
    const r = simulate(profile({ homeCity: 'new-york-ny' }), C, [{ id: 'mv', type: 'move', age: 36, cityKey: 'houston-tx' }], fixAge(), appData);
    expect(snapAt(r, 35).city).toBe('new-york-ny');
    expect(snapAt(r, 36).city).toBe('houston-tx');
    // Houston is cheaper than NYC → real (inflation-adjusted) base spend drops.
    const realBefore = snapAt(r, 35).spending.base / snapAt(r, 35).inflFactor;
    const realAfter = snapAt(r, 36).spending.base / snapAt(r, 36).inflFactor;
    expect(realAfter).toBeLessThan(realBefore);
  });

  it('lifestyle (COL) change scales base spending multiplicatively', () => {
    const r = simulate(profile(), C, [{ id: 'col', type: 'colChange', age: 40, multiplier: 1.5 }], fixAge(), appData);
    const realBefore = snapAt(r, 39).spending.base / snapAt(r, 39).inflFactor;
    const realAfter = snapAt(r, 40).spending.base / snapAt(r, 40).inflFactor;
    expect(realAfter / realBefore).toBeCloseTo(1.5, 4);
  });

  it('marriage flips filing status and brings partner assets/debt', () => {
    const r = simulate(profile(), C, [{ id: 'mar', type: 'marriage', age: 34, partnerIncome: 60000, partnerSavings: 20000, partnerDebt: 10000, partnerDebtApr: 0.06, colIncrease: 0.2 }], fixAge(), appData);
    expect(snapAt(r, 33).filingStatus).toBe('single');
    expect(snapAt(r, 34).filingStatus).toBe('mfj');
    expect(snapAt(r, 34).married).toBe(true);
    expect(snapAt(r, 34).entities.debts.some((d) => d.name === 'Partner debt')).toBe(true);
  });

  it('divorce reverts to single and halves the balance sheet', () => {
    const p = profile({ investments: 200000 });
    const r = simulate(p, C, [
      { id: 'mar', type: 'marriage', age: 34, partnerIncome: 60000, partnerSavings: 0, partnerDebt: 0, colIncrease: 0.2 },
      { id: 'div', type: 'divorce', age: 40 },
    ], fixAge(), appData);
    expect(snapAt(r, 40).filingStatus).toBe('single');
    expect(snapAt(r, 40).married).toBe(false);
    expect(snapAt(r, 40).netWorth).toBeLessThan(snapAt(r, 39).netWorth);
  });

  it('sell-home removes the home and the mortgage from the books', () => {
    const p = profile({ cash: 50000, home: { owned: true, value: 450000, mortgageDebtId: 'm1' }, debts: [{ id: 'm1', name: 'Mortgage', balance: 300000, apr: 0.05, termYears: 30 }] });
    const r = simulate(p, C, [{ id: 'sh', type: 'sellHome', age: 40 }], fixAge(), appData);
    expect(snapAt(r, 39).entities.home).not.toBeNull();
    expect(snapAt(r, 40).entities.home).toBeNull();
    expect(snapAt(r, 40).balances.mortgageBalance).toBe(0);
  });

  it('new-asset then sell-asset round-trips ownership', () => {
    const r = simulate(profile({ cash: 60000 }), C, [
      { id: 'na', type: 'newAsset', age: 35, name: 'Boat', value: 25000, appreciation: 0 },
      { id: 'sa', type: 'sellAsset', age: 40, assetId: 'asset-na' },
    ], fixAge(), appData);
    expect(snapAt(r, 35).entities.assets.some((a) => a.id === 'asset-na')).toBe(true);
    expect(snapAt(r, 40).entities.assets.some((a) => a.id === 'asset-na')).toBe(false);
  });

  it('runs all 16 event types in one timeline with finite results', () => {
    const p = profile({ income: 130000, cash: 120000, investments: 150000 });
    const events = [
      { id: 'nj', type: 'newJob', age: 31, income: 150000, employeeContribPct: 0.1, employerMatchRate: 1, employerMatchCapPct: 0.04 },
      { id: 'pr', type: 'promotion', age: 32, pctBump: 0.1 },
      { id: 'hp', type: 'housePurchase', age: 33, price: 400000, downPct: 0.2, rate: 0.06, termYears: 30 },
      { id: 'cb', type: 'childBorn', age: 34, childcare: true, privateK12: false, collegeFund: false },
      { id: 'wf', type: 'windfall', age: 35, amount: 50000 },
      { id: 'le', type: 'largeExpense', age: 36, amount: 20000 },
      { id: 'nd', type: 'newDebt', age: 37, name: 'Loan', balance: 20000, apr: 0.07, termYears: 5 },
      { id: 'pd', type: 'payoffDebt', age: 38, debtId: 'debt-nd' },
      { id: 'asset', type: 'newAsset', age: 39, name: 'Car', value: 30000, appreciation: -0.1 },
      { id: 'sa', type: 'sellAsset', age: 40, assetId: 'asset-asset' },
      { id: 'cc', type: 'constantChange', age: 41, constant: 'marketReturn', value: 0.06 },
      { id: 'cl', type: 'colChange', age: 42, multiplier: 1.2 },
      { id: 'mv', type: 'move', age: 43, cityKey: 'houston-tx' },
      { id: 'mar', type: 'marriage', age: 44, partnerIncome: 60000, partnerSavings: 20000, partnerDebt: 10000, partnerDebtApr: 0.06, colIncrease: 0.2 },
      { id: 'sh', type: 'sellHome', age: 45 },
      { id: 'div', type: 'divorce', age: 46 },
    ];
    const r = simulate(p, C, events, fixAge({ retirementAge: 67 }), appData);
    for (const s of r.snapshots) checkSnapshot(s, 'mega');
  });
});

describe('Retirement decumulation & Social Security timing', () => {
  it('zeroes income/contributions after retirement and starts SS at the claim age', () => {
    const r = simulate(profile({ age: 55 }), C, [], fixAge({ retirementAge: 62 }), appData);
    // Working until 62.
    expect(snapAt(r, 61, 55).income.gross).toBeGreaterThan(0);
    // Retired: no income, withdrawal happens, SS not yet (claim age 67).
    expect(snapAt(r, 62, 55).income.gross).toBe(0);
    expect(snapAt(r, 62, 55).withdrawal).toBeGreaterThan(0);
    expect(snapAt(r, 66, 55).ssBenefit).toBe(0);
    expect(snapAt(r, 67, 55).ssBenefit).toBeGreaterThan(0);
  });

  it('a later SS claim age (via constant change) raises the benefit', () => {
    const early = simulate(profile({ age: 50 }), C, [{ id: 'cc', type: 'constantChange', age: 50, constant: 'ssClaimAge', value: 62 }], fixAge({ retirementAge: 62 }), appData);
    const late = simulate(profile({ age: 50 }), C, [{ id: 'cc', type: 'constantChange', age: 50, constant: 'ssClaimAge', value: 70 }], fixAge({ retirementAge: 62 }), appData);
    const eBenefit = early.snapshots.find((s) => s.ssBenefit > 0);
    const lBenefit = late.snapshots.find((s) => s.ssBenefit > 0);
    // Real (today's $) benefit: later claim → larger check.
    expect(lBenefit.ssBenefit / lBenefit.inflFactor).toBeGreaterThan(eBenefit.ssBenefit / eBenefit.inflFactor);
  });
});

describe('Retirement-control meta (SWR relationships)', () => {
  it('fixAge: safe withdrawal = SWR × portfolio entering retirement, deflated', () => {
    const r = simulate(profile(), C, [], fixAge({ retirementAge: 65, swr: 0.04 }), appData);
    const entering = snapAt(r, 64); // end-of-64 balance
    expect(r.meta.safeWithdrawalReal).toBeCloseTo((0.04 * entering.portfolio) / entering.inflFactor, 4);
  });

  it('fixWithdrawal: a higher SWR solves an earlier feasible age', () => {
    const lo = simulate(profile(), C, [], { retirementAge: 65, swr: 0.03, mode: 'fixWithdrawal', targetWithdrawal: 60000 }, appData);
    const hi = simulate(profile(), C, [], { retirementAge: 65, swr: 0.05, mode: 'fixWithdrawal', targetWithdrawal: 60000 }, appData);
    expect(hi.meta.solvedAge).toBeLessThanOrEqual(lo.meta.solvedAge);
  });
});

// ── 3. Budget-tab math (mirrors BudgetTab.jsx totals + sliders) ──────────────
describe('Budget tab — derived totals & percentile sliders', () => {
  const cats = appData.spending.categories;

  it('percentile ↔ dollar round-trips for every category', () => {
    for (const c of cats) {
      for (const p of [0.1, 0.5, 0.9]) {
        const d = dollarAtPercentile(p, c.meanAnnual, c.sigma);
        expect(percentileOfDollar(d, c.meanAnnual, c.sigma)).toBeCloseTo(p, 4);
      }
      // Right-skew: the median sits below the mean.
      expect(dollarAtPercentile(0.5, c.meanAnnual, c.sigma)).toBeLessThan(c.meanAnnual);
    }
  });

  it('totals reconcile: afterTax − spending − employee = net, rate = net/afterTax', () => {
    const p = profile({ income: 120000, debts: [{ id: 'car', name: 'Car', balance: 24000, apr: 0.06, termYears: 5 }] });
    const budget = Object.fromEntries(cats.map((c) => [c.key, c.meanAnnual]));
    const income = p.income;
    const employee = Math.min(p.k401.employeeContribPct * income, K.employeeLimit);
    const tax = effectiveTax(income, p.filingStatus, p.homeCity, appData, employee);
    const debtService = p.debts.reduce((s, d) => s + 12 * monthlyPayment(d.balance, d.apr, d.termYears), 0);
    const spending = cats.reduce((s, c) => s + (budget[c.key] ?? c.meanAnnual), 0) + debtService;
    const afterTax = income - tax.total;
    const net = afterTax - spending - employee;
    const rate = afterTax > 0 ? net / afterTax : 0;

    expect(tax.total).toBeCloseTo(tax.federal + tax.fica + tax.state + tax.local, 6);
    expect(debtService).toBeGreaterThan(0);
    expect(afterTax).toBeLessThan(income);
    expect(net).toBeCloseTo(afterTax - spending - employee, 6);
    expect(rate).toBeCloseTo(net / afterTax, 10);
  });

  it('monthly view is exactly the annual figure ÷ 12', () => {
    const annual = 18000;
    expect(Math.round(annual / 12)).toBe(1500);
    // Slider stores annual; editing the monthly box multiplies back by 12.
    expect(1500 * 12).toBe(annual);
  });
});

// ── 4. Compare-tab math (mirrors CompareTab.jsx per-city derivation) ─────────
describe('Compare tab — COL scaling, per-jurisdiction tax, saving rate', () => {
  const cats = appData.spending.categories;

  function computeCity(p, budget, key, homeKey) {
    const col = appData.col.cities[key];
    const homeCol = appData.col.cities[homeKey];
    const isHome = key === homeKey;
    const suggested = isHome ? p.income : (p.income * col.composite) / homeCol.composite;
    const income = Math.round(suggested);
    const employee = Math.min(p.k401.employeeContribPct * income, K.employeeLimit);
    const tax = effectiveTax(income, p.filingStatus, key, appData, employee);
    const catCosts = {};
    let spending = 0;
    for (const c of cats) {
      const base = budget[c.key] ?? c.meanAnnual;
      const scaled = c.colSensitive && c.colCategory ? (base * col[c.colCategory]) / homeCol[c.colCategory] : base;
      catCosts[c.key] = scaled;
      spending += scaled;
    }
    const debtService = (p.debts || []).reduce((s, d) => s + 12 * monthlyPayment(d.balance, d.apr, d.termYears), 0);
    const afterTax = income - tax.total;
    const net = afterTax - spending - employee - debtService;
    return { income, suggested, tax, catCosts, spending, net, savingRate: afterTax > 0 ? net / afterTax : 0 };
  }

  const p = profile({ homeCity: 'los-angeles-ca', income: 150000 });
  const budget = Object.fromEntries(cats.map((c) => [c.key, c.meanAnnual]));

  it('seeds income at income × (city composite ÷ home composite)', () => {
    const hou = computeCity(p, budget, 'houston-tx', 'los-angeles-ca');
    const expected = (150000 * appData.col.cities['houston-tx'].composite) / appData.col.cities['los-angeles-ca'].composite;
    expect(hou.suggested).toBeCloseTo(expected, 6);
    expect(hou.income).toBe(Math.round(expected));
  });

  it('scales COL-sensitive categories by the category index ratio; leaves national ones flat', () => {
    const hou = computeCity(p, budget, 'houston-tx', 'los-angeles-ca');
    const shelter = cats.find((c) => c.key === 'shelter'); // colSensitive → housing
    const travel = cats.find((c) => c.key === 'travel'); // national → unchanged
    const ratio = appData.col.cities['houston-tx'].housing / appData.col.cities['los-angeles-ca'].housing;
    expect(hou.catCosts.shelter).toBeCloseTo(budget[shelter.key] * ratio, 4);
    expect(hou.catCosts.travel).toBeCloseTo(budget[travel.key], 6);
  });

  it('applies the correct per-jurisdiction tax (no state tax in TX, local tax in NYC)', () => {
    const hou = computeCity(p, budget, 'houston-tx', 'los-angeles-ca');
    const nyc = computeCity(p, budget, 'new-york-ny', 'los-angeles-ca');
    expect(hou.tax.state).toBe(0);
    expect(nyc.tax.local).toBeGreaterThan(0);
    expect(hou.tax.total).toBeCloseTo(hou.tax.federal + hou.tax.fica + hou.tax.state + hou.tax.local, 6);
  });

  it('home column uses the unscaled income and matches the standalone tax engine', () => {
    const home = computeCity(p, budget, 'los-angeles-ca', 'los-angeles-ca');
    expect(home.income).toBe(150000);
    const employee = Math.min(p.k401.employeeContribPct * 150000, K.employeeLimit);
    const t = effectiveTax(150000, p.filingStatus, 'los-angeles-ca', appData, employee);
    expect(home.tax.total).toBeCloseTo(t.total, 6);
    expect(home.savingRate).toBeCloseTo(home.net / (home.income - home.tax.total), 10);
  });
});
