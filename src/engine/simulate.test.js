// §15 acceptance tests — the 10 mandatory engine-validation scenarios, plus
// supporting checks for the 401k cap and the lognormal budget math.

import { describe, it, expect } from 'vitest';
import { simulate, monthlyPayment, toReal } from './simulate.js';
import { dollarAtPercentile, percentileOfDollar, lognormalPdf } from './lognormal.js';
import { appData } from '../lib/data.js';

const constants = { ...appData.constantsDefaults.constants };
const controls = { retirementAge: 65, swr: 0.04, mode: 'fixAge' };

function profile(overrides = {}) {
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
    ...overrides,
  };
}

function snapAt(result, age, startAge = 30) {
  return result.snapshots[age - startAge];
}

describe('1. Compound baseline', () => {
  it('grows net worth monotonically pre-retirement', () => {
    const r = simulate(profile(), constants, [], controls, appData);
    expect(r.warnings).toHaveLength(0);
    for (let i = 1; i < 65 - 30; i++) {
      expect(r.snapshots[i].netWorth).toBeGreaterThan(r.snapshots[i - 1].netWorth);
    }
  });

  it('compounds an idle portfolio at exactly the nominal market return', () => {
    const p = profile({ income: 0, cash: 0, investments: 100000, baselineSpending: 0, k401: { balance: 0, employeeContribPct: 0, employerMatchRate: 0, employerMatchCapPct: 0 } });
    const r = simulate(p, constants, [], { ...controls, retirementAge: 101 }, appData);
    expect(snapAt(r, 30).balances.investments).toBeCloseTo(107000, 6);
    expect(snapAt(r, 31).balances.investments).toBeCloseTo(114490, 6);
    expect(snapAt(r, 40).balances.investments).toBeCloseTo(100000 * 1.07 ** 11, 4);
  });

  it('real view is a pure display deflation by cumulative inflation', () => {
    const r = simulate(profile(), constants, [], controls, appData);
    const s5 = snapAt(r, 35);
    expect(s5.inflFactor).toBeCloseTo(1.025 ** 5, 10);
    expect(toReal(s5.netWorth, s5)).toBeCloseTo(s5.netWorth / 1.025 ** 5, 6);
    // Toggling real/nominal never re-runs logic: the nominal series is unchanged.
    const r2 = simulate(profile(), constants, [], controls, appData);
    expect(r2.snapshots.map((s) => s.netWorth)).toEqual(r.snapshots.map((s) => s.netWorth));
  });
});

describe('2. House purchase + mortgage + payoff', () => {
  const buy = { id: 'e1', type: 'housePurchase', age: 35, price: 500000, downPct: 0.2, rate: 0.06, termYears: 30 };
  const payoff = { id: 'e2', type: 'payoffDebt', age: 50, debtId: 'mortgage-e1' };

  it('creates the mortgage, home asset, and property tax at purchase', () => {
    const r = simulate(profile(), constants, [buy], controls, appData);
    const before = snapAt(r, 34);
    const at = snapAt(r, 35);
    expect(before.entities.home).toBeNull();
    expect(before.spending.propertyTax).toBe(0);
    expect(at.entities.home).not.toBeNull();
    // Purchase is a step-7 one-time flow; property tax enters spending (step 5)
    // from the first full year of ownership.
    expect(snapAt(r, 36).spending.propertyTax).toBeGreaterThan(0);
    // Mortgage exists with a balance below the 400k principal (one year amortized)
    const m = at.entities.debts.find((d) => d.id === 'mortgage-e1');
    expect(m).toBeDefined();
    expect(m.balance).toBeGreaterThan(380000);
    expect(m.balance).toBeLessThan(400000);
    // Home appreciates at the nominal home-appreciation rate
    expect(snapAt(r, 36).balances.homeValue).toBeCloseTo(500000 * 1.035 ** 2, 4);
  });

  it('pays off the mortgage at 50: dropdown-valid until then, payment freed after', () => {
    const r = simulate(profile(), constants, [buy, payoff], controls, appData);
    expect(r.warnings).toHaveLength(0);
    // Entity exists (valid dropdown option) through 49, gone at 50.
    expect(snapAt(r, 49).entities.debts.some((d) => d.id === 'mortgage-e1')).toBe(true);
    expect(snapAt(r, 50).entities.debts.some((d) => d.id === 'mortgage-e1')).toBe(false);
    expect(snapAt(r, 50).balances.mortgageBalance).toBe(0);
    // Debt service freed afterward.
    expect(snapAt(r, 51).debtService).toBe(0);
    expect(snapAt(r, 49).debtService).toBeGreaterThan(0);
  });

  it('a debt that fully amortizes before its payoff event becomes a warning no-op', () => {
    const p = profile({ debts: [{ id: 'd1', name: 'Car loan', balance: 10000, apr: 0.05, termYears: 3 }] });
    const r = simulate(p, constants, [{ id: 'e3', type: 'payoffDebt', age: 40, debtId: 'd1' }], controls, appData);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toMatch(/no-op/);
  });
});

describe('3. Child windowing', () => {
  const child = { id: 'c1', type: 'childBorn', age: 33, childcare: true, privateK12: false, collegeFund: true, collegeType: 'public' };

  it('applies the recurring expense from birth to 22 and then stops', () => {
    const r = simulate(profile(), constants, [child], controls, appData);
    expect(snapAt(r, 32).spending.child).toBe(0);
    expect(snapAt(r, 33).spending.child).toBeGreaterThan(0);
    // Childcare years (child age 0-4) cost more in real terms than age 5+.
    const real = (age) => snapAt(r, age).spending.child / snapAt(r, age).inflFactor;
    expect(real(37)).toBeGreaterThan(real(38));
    // College years: real cost = public all-in $24,000.
    expect(real(33 + 19)).toBeCloseTo(24000, 4);
    // Window closes at child age 22 → parent age 55.
    expect(snapAt(r, 54).spending.child).toBeGreaterThan(0);
    expect(snapAt(r, 55).spending.child).toBe(0);
  });

  it('removing the event restores the prior line exactly', () => {
    const base = simulate(profile(), constants, [], controls, appData);
    const removed = simulate(profile(), constants, [], controls, appData);
    expect(removed.snapshots).toEqual(base.snapshots);
    const withChild = simulate(profile(), constants, [child], controls, appData);
    expect(withChild.snapshots.map((s) => s.netWorth)).not.toEqual(base.snapshots.map((s) => s.netWorth));
  });
});

describe('4. Move then COL Change', () => {
  const move = { id: 'm1', type: 'move', age: 40, cityKey: 'dallas-tx' };
  const col = { id: 'm2', type: 'colChange', age: 45, multiplier: 1.3 };

  it('changes tax jurisdiction and COL at the move, then stacks the lifestyle multiplier', () => {
    const r = simulate(profile(), constants, [move, col], controls, appData);
    expect(snapAt(r, 39).tax.state).toBeGreaterThan(0); // California
    expect(snapAt(r, 40).tax.state).toBe(0); // Texas
    const expectedCol = appData.col.cities['dallas-tx'].composite / appData.col.cities['los-angeles-ca'].composite;
    expect(snapAt(r, 40).colFactor).toBeCloseTo(expectedCol, 10);
    expect(snapAt(r, 45).lifestyleMult).toBe(1.3);
    // Spending = baseline × inflation × colFactor × lifestyle (multipliers stack).
    const s45 = snapAt(r, 45);
    expect(s45.spending.base).toBeCloseTo(50000 * s45.inflFactor * expectedCol * 1.3, 6);
    // Saving rate reflects both: drops when lifestyle jumps at 45, higher at 40 than 39.
    expect(snapAt(r, 45).savingRate).toBeLessThan(snapAt(r, 44).savingRate);
    expect(snapAt(r, 40).savingRate).toBeGreaterThan(snapAt(r, 39).savingRate);
  });
});

describe('5. Constant Change schedule (piecewise inflation)', () => {
  it('uses the piecewise cumulative product for deflation', () => {
    // 2.5% until 2036 (age 40), then 2.0% from 2036 onward.
    const ev = { id: 'k1', type: 'constantChange', age: 40, constant: 'inflation', value: 0.02 };
    const r = simulate(profile(), constants, [ev], controls, appData);
    expect(snapAt(r, 39).inflFactor).toBeCloseTo(1.025 ** 9, 10);
    expect(snapAt(r, 40).inflFactor).toBeCloseTo(1.025 ** 9 * 1.02, 10);
    expect(snapAt(r, 45).inflFactor).toBeCloseTo(1.025 ** 9 * 1.02 ** 6, 10);
    // NOT a fixed power of either rate alone.
    expect(snapAt(r, 45).inflFactor).not.toBeCloseTo(1.025 ** 15, 4);
    expect(snapAt(r, 45).inflFactor).not.toBeCloseTo(1.02 ** 15, 4);
  });
});

describe('6. Asset buy/sell with capital gains', () => {
  it('taxes the $20k gain at 15% and nets $47k into cash', () => {
    const g = (50000 / 30000) ** (1 / 10) - 1; // grows 30k → 50k over 10 years
    const buy = { id: 'a1', type: 'newAsset', age: 32, name: 'Vintage car', value: 30000, appreciation: g };
    const sell = { id: 'a2', type: 'sellAsset', age: 42, assetId: 'asset-a1' };
    const p = profile({ cash: 100000 });
    const withBuy = simulate(p, constants, [buy], controls, appData);
    const withSale = simulate(p, constants, [buy, sell], controls, appData);
    // Asset worth exactly 50k at the moment of sale (10 growth steps after purchase).
    const assetBefore = snapAt(withBuy, 41).entities.assets.find((a) => a.id === 'asset-a1');
    expect(assetBefore.value / (1 + g)).toBeCloseTo(50000 / (1 + g), 4);
    // Cash delta at 42 = proceeds 50000 − 15% × 20000 = 47000.
    const cashDelta = snapAt(withSale, 42).balances.cash - snapAt(withBuy, 42).balances.cash;
    expect(cashDelta).toBeCloseTo(47000, 4);
    expect(snapAt(withSale, 42).entities.assets).toHaveLength(0);
    // Validated dropdown: asset no longer offered after sale; selling again warns.
    const resell = simulate(p, constants, [buy, sell, { id: 'a3', type: 'sellAsset', age: 45, assetId: 'asset-a1' }], controls, appData);
    expect(resell.warnings).toHaveLength(1);
  });
});

describe('7. Home sale with primary-residence exclusion', () => {
  it('excludes $250k (single), clears the mortgage, stops property tax', () => {
    const p = profile({
      home: { owned: true, value: 700000, mortgageDebtId: 'm1' },
      debts: [{ id: 'm1', name: 'Mortgage', balance: 250000, apr: 0.05, termYears: 20 }],
    });
    const sell = { id: 's1', type: 'sellHome', age: 55 };
    const r = simulate(p, constants, [sell], controls, appData);
    const before = snapAt(r, 54);
    const at = snapAt(r, 55);
    const saleValue = before.balances.homeValue; // value entering age 55
    const mortgageBal = before.balances.mortgageBalance;
    const gain = saleValue - 700000;
    expect(gain).toBeGreaterThan(250000); // exclusion is binding but not total
    const expectedTax = (gain - 250000) * 0.15;
    const expectedProceeds = saleValue - mortgageBal - expectedTax;
    expect(at.balances.cash - before.balances.cash).toBeCloseTo(expectedProceeds, 4);
    expect(at.entities.home).toBeNull();
    expect(at.balances.mortgageBalance).toBe(0);
    expect(snapAt(r, 56).spending.propertyTax).toBe(0);
    expect(before.spending.propertyTax).toBeGreaterThan(0);
  });
});

describe('8. Marriage → Divorce', () => {
  const marry = { id: 'w1', type: 'marriage', age: 35, partnerIncome: 80000, partnerSavings: 50000, partnerDebt: 20000, partnerDebtApr: 0.06, colIncrease: 0.15 };
  const split = { id: 'w2', type: 'divorce', age: 45 };
  const homeProfile = () =>
    profile({
      home: { owned: true, value: 600000, mortgageDebtId: 'm1' },
      debts: [{ id: 'm1', name: 'Mortgage', balance: 300000, apr: 0.055, termYears: 30 }],
    });

  it('combines incomes, flips filing status, brings partner assets and debt in', () => {
    const r = simulate(homeProfile(), constants, [marry], controls, appData);
    const before = snapAt(r, 34);
    const at = snapAt(r, 35);
    expect(before.filingStatus).toBe('single');
    expect(at.filingStatus).toBe('mfj');
    expect(at.income.gross).toBeCloseTo(120000 * 1.035 ** 5 + 80000, 4);
    expect(at.entities.debts.some((d) => d.name === 'Partner debt')).toBe(true);
    // Partner savings landed in investments.
    const base = simulate(homeProfile(), constants, [], controls, appData);
    expect(at.balances.investments - snapAt(base, 35).balances.investments).toBeGreaterThan(45000);
  });

  it('divorce halves the balance sheet, sells the home, reverts filing status', () => {
    const r = simulate(homeProfile(), constants, [marry, split], controls, appData);
    const before = snapAt(r, 44);
    const at = snapAt(r, 45);
    expect(at.filingStatus).toBe('single');
    expect(at.married).toBe(false);
    expect(at.income.partner).toBe(0);
    expect(at.entities.home).toBeNull(); // home sold
    expect(at.balances.k401).toBeLessThan(before.balances.k401 * 0.6); // halved (then grown)
    // Marriage-era COL bump removed: real base spending back to baseline.
    expect(at.spending.base / at.inflFactor).toBeCloseTo(50000, 4);
    expect(before.spending.base / before.inflFactor).toBeCloseTo(50000 * 1.15, 4);
    // Debts halved too.
    const partnerDebtBefore = before.entities.debts.find((d) => d.name === 'Partner debt');
    const partnerDebtAfter = at.entities.debts.find((d) => d.name === 'Partner debt');
    if (partnerDebtBefore && partnerDebtAfter) {
      expect(partnerDebtAfter.balance).toBeLessThan(partnerDebtBefore.balance * 0.55);
    }
  });

  it('divorce with no active marriage is a warning no-op', () => {
    const base = simulate(profile(), constants, [], controls, appData);
    const r = simulate(profile(), constants, [{ id: 'w3', type: 'divorce', age: 40 }], controls, appData);
    expect(r.warnings).toHaveLength(1);
    expect(r.snapshots.map((s) => s.netWorth)).toEqual(base.snapshots.map((s) => s.netWorth));
  });
});

describe('9. Run-out-of-money', () => {
  it('portfolio hits zero before 100 under an aggressive withdrawal', () => {
    const r = simulate(
      profile(),
      constants,
      [],
      { retirementAge: 45, swr: 0.04, mode: 'fixWithdrawal', targetWithdrawal: 150000 },
      appData
    );
    const depletedSnap = r.snapshots.find((s) => s.retired && s.depleted);
    expect(depletedSnap).toBeDefined();
    expect(depletedSnap.age).toBeLessThan(100);
    const last = r.snapshots[r.snapshots.length - 1];
    expect(last.portfolio).toBeLessThanOrEqual(1);
  });
});

describe('10. Retirement controls (SWR relationships)', () => {
  it('fixing retirement age yields safeWithdrawal = SWR × portfolio at retirement', () => {
    const r = simulate(profile(), constants, [], { retirementAge: 65, swr: 0.04, mode: 'fixAge' }, appData);
    const entering = snapAt(r, 64); // end-of-64 balance = portfolio entering 65
    const expected = (0.04 * entering.portfolio) / entering.inflFactor;
    expect(r.meta.safeWithdrawalReal).toBeCloseTo(expected, 6);
    expect(r.meta.withdrawalReal).toBeCloseTo(expected, 6);
  });

  it('fixing a target withdrawal solves the earliest feasible age (dotted line)', () => {
    const r = simulate(profile(), constants, [], { retirementAge: 65, swr: 0.04, mode: 'fixWithdrawal', targetWithdrawal: 60000 }, appData);
    expect(r.meta.solvedAge).not.toBeNull();
    const a = r.meta.solvedAge;
    expect(a).toBeGreaterThan(30);
    // Condition holds at the solved age and fails the year before.
    const entering = snapAt(r, a - 1);
    expect(0.04 * entering.portfolio).toBeGreaterThanOrEqual(60000 * entering.inflFactor);
    if (a - 2 >= 0) {
      const prior = snapAt(r, a - 2);
      expect(0.04 * prior.portfolio).toBeLessThan(60000 * prior.inflFactor);
    }
  });

  it('changing the SWR re-solves the age', () => {
    const lo = simulate(profile(), constants, [], { retirementAge: 65, swr: 0.03, mode: 'fixWithdrawal', targetWithdrawal: 60000 }, appData);
    const hi = simulate(profile(), constants, [], { retirementAge: 65, swr: 0.05, mode: 'fixWithdrawal', targetWithdrawal: 60000 }, appData);
    expect(hi.meta.solvedAge).toBeLessThan(lo.meta.solvedAge);
  });
});

describe('Net-worth breakdown components', () => {
  it('always sums to net worth across the whole projection', () => {
    const p = profile({
      home: { owned: true, value: 450000, mortgageDebtId: 'm1' },
      debts: [{ id: 'm1', name: 'Mortgage', balance: 300000, apr: 0.05, termYears: 30 }],
    });
    const r = simulate(p, constants, [], controls, appData);
    for (const s of r.snapshots) {
      const { k401, savings, assets, debt } = s.components;
      expect(savings).toBeGreaterThanOrEqual(0);
      expect(assets).toBeGreaterThanOrEqual(0);
      expect(k401 + savings + assets - debt).toBeCloseTo(s.netWorth, 4);
    }
  });

  it('surfaces an underwater home as Debt, not negative Assets', () => {
    // Mortgage exceeds the home value → negative equity.
    const p = profile({
      cash: 5000,
      investments: 0,
      home: { owned: true, value: 200000, mortgageDebtId: 'm1' },
      debts: [{ id: 'm1', name: 'Mortgage', balance: 300000, apr: 0.05, termYears: 30 }],
    });
    const r = simulate(p, constants, [], controls, appData);
    const s0 = r.snapshots[0];
    expect(s0.components.assets).toBe(0); // no positive equity to show
    expect(s0.components.debt).toBeGreaterThan(0); // the shortfall lands here
    expect(s0.components.k401 + s0.components.savings + s0.components.assets - s0.components.debt)
      .toBeCloseTo(s0.netWorth, 4);
  });
});

describe('Supporting math', () => {
  it('caps 401k employee contribution at the IRS limit and matches correctly', () => {
    const p = profile({ income: 300000 });
    const r = simulate(p, constants, [], controls, appData);
    const s = r.snapshots[0];
    expect(s.contrib401k.employee).toBeCloseTo(24500, 6); // min(30000, 24500)
    expect(s.contrib401k.employer).toBeCloseTo(0.04 * 300000, 6); // min(10%,4%) × salary × 100%
  });

  it('amortization formula matches the standard closed form', () => {
    // 400k, 6%, 30y → ~$2,398.20/mo
    expect(monthlyPayment(400000, 0.06, 30)).toBeCloseTo(2398.2, 1);
    expect(monthlyPayment(12000, 0, 10)).toBeCloseTo(100, 6);
  });

  it('lognormal percentile ↔ dollar round-trips and the median sits below the mean', () => {
    const mean = 15900;
    const sigma = 0.5;
    const d = dollarAtPercentile(0.7, mean, sigma);
    expect(percentileOfDollar(d, mean, sigma)).toBeCloseTo(0.7, 4);
    // Right-skew: median = exp(mu) < mean.
    expect(dollarAtPercentile(0.5, mean, sigma)).toBeLessThan(mean);
    expect(lognormalPdf(mean, mean, sigma)).toBeGreaterThan(0);
    expect(lognormalPdf(0, mean, sigma)).toBe(0);
  });
});
