// Simulation engine (§4). A pure function: simulate(profile, constants, events,
// controls, data) → { snapshots, warnings, meta }. One snapshot per year from the
// current age to 100. Everything internal is NOMINAL dollars; the real view is a
// display transform using each snapshot's inflFactor.
//
// Conventions (documented modeling choices):
// - Event dollar amounts (windfalls, prices, partner figures, new-job income) are
//   nominal dollars of the event year, as entered.
// - The retirement withdrawal target is in TODAY'S dollars and is held constant in
//   real terms (grown by cumulative inflation), per §4.4.
// - baselineSpending is in today's dollars and grows with inflation (real-constant).
// - IRS 401k limits are held fixed in nominal terms (swap the data file to update).
// - In retirement the withdrawal funds living costs and debt service; debts still
//   amortize but payments are not double-subtracted from the portfolio.
// - Social Security starts at max(retirement age, claiming age); benefit from the
//   user's own simulated earnings history via the PIA bend-point formula.

import { effectiveTax } from './tax.js';

export const START_YEAR = 2026;
export const END_AGE = 100;

/** Standard amortization: monthly payment for balance, APR, term in years (§14). */
export function monthlyPayment(balance, apr, termYears) {
  const n = Math.max(1, Math.round(termYears * 12));
  if (apr <= 0) return balance / n;
  const r = apr / 12;
  const f = Math.pow(1 + r, n);
  return (balance * (r * f)) / (f - 1);
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function claimingAdjustment(claimAge, ss) {
  const a = Math.round(Math.min(70, Math.max(62, claimAge)));
  return ss.claimingAdjustment[String(a)] ?? 1;
}

/** PIA monthly benefit (today's dollars) from an array of real annual earnings. */
function piaMonthly(realEarnings, ss) {
  const top = [...realEarnings].sort((a, b) => b - a).slice(0, 35);
  const sum = top.reduce((s, e) => s + Math.min(e, ss.wageBase), 0);
  const aime = sum / (35 * 12);
  const b1 = ss.piaBendPoints.first;
  const b2 = ss.piaBendPoints.second;
  const [r1, r2, r3] = ss.piaRates;
  const pia =
    r1 * Math.min(aime, b1) +
    r2 * Math.max(0, Math.min(aime, b2) - b1) +
    r3 * Math.max(0, aime - b2);
  return Math.min(pia, ss.maxMonthlyBenefitAtFRA);
}

function initState(profile, constants, data) {
  const debts = (profile.debts || []).map((d) => ({
    id: d.id,
    name: d.name,
    balance: d.balance,
    apr: d.apr,
    termYears: d.termYears,
    monthlyPayment: monthlyPayment(d.balance, d.apr, d.termYears),
  }));
  const homeCity = profile.homeCity;
  const colHome = data.col.cities[homeCity];
  let home = null;
  if (profile.home && profile.home.owned) {
    home = {
      value: profile.home.value,
      purchasePrice: profile.home.value, // basis = value at sim start (documented)
      mortgageDebtId: profile.home.mortgageDebtId || null,
      propertyTaxRate: colHome ? colHome.propertyTaxRate : data.lifeEvents.housePurchase.defaultPropertyTaxRate,
    };
  }
  return {
    cash: profile.cash || 0,
    investments: profile.investments || 0,
    k401: profile.k401 ? profile.k401.balance || 0 : 0,
    k401Params: {
      employeeContribPct: profile.k401 ? profile.k401.employeeContribPct || 0 : 0,
      employerMatchRate: profile.k401 ? profile.k401.employerMatchRate || 0 : 0,
      employerMatchCapPct: profile.k401 ? profile.k401.employerMatchCapPct || 0 : 0,
    },
    debts,
    home,
    assets: (profile.assets || []).map((a) => ({ ...a, basis: a.value })),
    userIncome: profile.income || 0,
    partnerIncome: 0,
    married: profile.filingStatus === 'mfj',
    filingStatus: profile.filingStatus || 'single',
    homeCity,
    city: homeCity,
    colFactor: 1,
    lifestyleMult: 1,
    marriageColMult: 1,
    baselineSpending: profile.baselineSpending || 0,
    constants: { ...constants },
    inflFactor: 1,
    realEarnings: [],
    depleted: false,
  };
}

function drawFunds(state, amount) {
  // Draw cash first, then investments; cash may go negative as a deficit marker.
  let remaining = amount;
  const fromCash = Math.min(state.cash, remaining);
  if (fromCash > 0) {
    state.cash -= fromCash;
    remaining -= fromCash;
  }
  const fromInv = Math.min(state.investments, remaining);
  if (fromInv > 0) {
    state.investments -= fromInv;
    remaining -= fromInv;
  }
  if (remaining > 0) state.cash -= remaining;
}

function colFactorFor(state, data) {
  const home = data.col.cities[state.homeCity];
  const cur = data.col.cities[state.city];
  if (!home || !cur) return 1;
  return cur.composite / home.composite;
}

function sellHomeInternal(state, warnings, age, exclusionTable) {
  const home = state.home;
  const mortgage = home.mortgageDebtId
    ? state.debts.find((d) => d.id === home.mortgageDebtId)
    : null;
  const mortgageBal = mortgage ? mortgage.balance : 0;
  const gain = home.value - home.purchasePrice;
  const exclusion = exclusionTable[state.filingStatus] ?? exclusionTable.single;
  const taxableGain = Math.max(0, gain - exclusion);
  const tax = taxableGain * state.constants.capitalGainsRate;
  const proceeds = home.value - mortgageBal - tax;
  state.cash += proceeds;
  if (mortgage) state.debts = state.debts.filter((d) => d.id !== mortgage.id);
  state.home = null;
  return { proceeds, tax, gain };
}

function childCostForYear(ev, age, state, data) {
  const childAge = age - ev.age;
  if (childAge < 0) return 0;
  const c = data.lifeEvents.child;
  let cost = 0;
  if (childAge < 18) cost += c.baseAnnual;
  if (ev.childcare && childAge < 5) {
    const st = data.cityIndex[state.city] ? data.cityIndex[state.city].state : null;
    cost += (st && c.childcare.stateAnnual[st]) || c.childcare.nationalAvgAnnual;
  }
  if (ev.privateK12 && childAge >= 5 && childAge < 18) {
    cost += childAge < 14 ? c.privateK12.elementaryAnnual : c.privateK12.highSchoolAnnual;
  }
  if (ev.collegeFund && childAge >= 18 && childAge < 22) {
    cost += ev.collegeType === 'private' ? c.college.privateAnnual : c.college.publicInStateAnnual;
  }
  return cost * state.inflFactor;
}

/**
 * Single nominal pass. retirementAge may be Infinity (accumulation only).
 * withdrawalReal = annual retirement withdrawal in today's dollars (pre-tax).
 */
function runPass(profile, constants, events, retirementAge, withdrawalReal, data) {
  const state = initState(profile, constants, data);
  const warnings = [];
  const snapshots = [];
  const startAge = profile.age;
  const sorted = [...events].sort((a, b) => a.age - b.age);
  let ssMonthlyReal = null; // locked in at retirement

  for (let age = startAge; age <= END_AGE; age++) {
    const yearIndex = age - startAge;
    const year = START_YEAR + yearIndex;
    const evts = sorted.filter((e) => e.age === age);
    const retired = age >= retirementAge;
    const marriedAtYearStart = state.married;

    // ── 1. Scheduled mutations ────────────────────────────────────────────
    for (const ev of evts) {
      switch (ev.type) {
        case 'constantChange':
          state.constants = { ...state.constants, [ev.constant]: ev.value };
          break;
        case 'move':
          if (!data.col.cities[ev.cityKey]) {
            warnings.push({ age, eventId: ev.id, message: `Unknown city "${ev.cityKey}" — move skipped.` });
          } else {
            state.city = ev.cityKey;
            state.colFactor = colFactorFor(state, data);
          }
          break;
        case 'colChange':
          state.lifestyleMult = ev.multiplier;
          break;
        case 'marriage':
          if (state.married) {
            warnings.push({ age, eventId: ev.id, message: 'Already married — marriage event skipped.' });
            break;
          }
          state.married = true;
          state.filingStatus = 'mfj';
          state.partnerIncome = ev.partnerIncome || 0;
          state.investments += ev.partnerSavings || 0;
          if (ev.partnerDebt > 0) {
            const term = ev.partnerDebtTermYears || 10;
            state.debts.push({
              id: `partner-debt-${ev.id}`,
              name: 'Partner debt',
              balance: ev.partnerDebt,
              apr: ev.partnerDebtApr || 0.06,
              termYears: term,
              monthlyPayment: monthlyPayment(ev.partnerDebt, ev.partnerDebtApr || 0.06, term),
            });
          }
          state.marriageColMult = 1 + (ev.colIncrease || 0);
          break;
        case 'divorce': {
          if (!state.married) {
            warnings.push({ age, eventId: ev.id, message: 'No active marriage — divorce event skipped.' });
            break;
          }
          // Home is sold (MFJ exclusion still applies) and everything splits 50/50.
          if (state.home) {
            sellHomeInternal(state, warnings, age, data.federal.capitalGains.primaryResidenceExclusion);
          }
          state.cash /= 2;
          state.investments /= 2;
          state.k401 /= 2;
          for (const a of state.assets) {
            a.value /= 2;
            a.basis /= 2;
          }
          for (const d of state.debts) {
            d.balance /= 2;
            d.monthlyPayment /= 2;
          }
          state.married = false;
          state.filingStatus = 'single';
          state.partnerIncome = 0;
          state.marriageColMult = 1;
          break;
        }
        default:
          break;
      }
    }

    // Cumulative inflation uses each year's ACTIVE rate (piecewise product).
    if (yearIndex > 0) state.inflFactor *= 1 + state.constants.inflation;

    // ── 2. Resolve income ─────────────────────────────────────────────────
    if (yearIndex > 0) {
      const g = 1 + state.constants.salaryGrowth;
      state.userIncome *= g;
      // Partner income entered at the marriage event is dollars of that year;
      // it only starts growing the following year.
      if (marriedAtYearStart && state.married) state.partnerIncome *= g;
    }
    for (const ev of evts) {
      if (ev.type === 'newJob') {
        if (retired) {
          warnings.push({ age, eventId: ev.id, message: 'New job after retirement age is ignored.' });
        } else {
          state.userIncome = ev.income;
          state.k401Params = {
            employeeContribPct: ev.employeeContribPct ?? state.k401Params.employeeContribPct,
            employerMatchRate: ev.employerMatchRate ?? state.k401Params.employerMatchRate,
            employerMatchCapPct: ev.employerMatchCapPct ?? state.k401Params.employerMatchCapPct,
          };
        }
      } else if (ev.type === 'promotion') {
        if (retired) {
          warnings.push({ age, eventId: ev.id, message: 'Promotion after retirement age is ignored.' });
        } else if (ev.income != null) {
          state.userIncome = ev.income;
        } else if (ev.pctBump != null) {
          state.userIncome *= 1 + ev.pctBump;
        }
      }
    }
    const gross = retired ? 0 : state.userIncome + (state.married ? state.partnerIncome : 0);
    if (!retired) {
      state.realEarnings.push(state.userIncome / state.inflFactor);
    }

    // ── 3. 401k contributions ────────────────────────────────────────────
    let employee = 0;
    let employer = 0;
    if (!retired) {
      const p = state.k401Params;
      employee = Math.min(p.employeeContribPct * state.userIncome, data.retirement.k401.employeeLimit);
      employer =
        Math.min(p.employeeContribPct, p.employerMatchCapPct) * state.userIncome * p.employerMatchRate;
      const combined = employee + employer;
      const cap = data.retirement.k401.annualAdditionsLimit;
      if (combined > cap) employer = Math.max(0, cap - employee);
      state.k401 += employee + employer;
    }

    // ── 4. Taxes ──────────────────────────────────────────────────────────
    const tax = effectiveTax(gross, state.filingStatus, state.city, data, employee);
    const afterTaxIncome = gross - tax.total;

    // ── 5. Spending ───────────────────────────────────────────────────────
    const baseSpend =
      state.baselineSpending * state.inflFactor * state.colFactor * state.lifestyleMult * state.marriageColMult;
    let childCost = 0;
    for (const ev of sorted) {
      if (ev.type === 'childBorn' && ev.age <= age) childCost += childCostForYear(ev, age, state, data);
    }
    const propertyTax = state.home ? state.home.value * state.home.propertyTaxRate : 0;
    const spending = baseSpend + childCost + propertyTax;
    let debtService = 0;
    for (const d of state.debts) {
      if (d.balance > 0) debtService += Math.min(12 * d.monthlyPayment, d.balance * (1 + d.apr));
    }

    // ── 6. Cash flow & saving rate (working years) ───────────────────────
    let netSavings = 0;
    let savingRate = 0;
    if (!retired) {
      netSavings = afterTaxIncome - spending - employee - debtService;
      savingRate = afterTaxIncome > 0 ? netSavings / afterTaxIncome : 0;
      if (netSavings >= 0) state.investments += netSavings;
      else drawFunds(state, -netSavings);
    }

    // ── 7. One-time event cash flows ─────────────────────────────────────
    for (const ev of evts) {
      switch (ev.type) {
        case 'windfall':
          state.cash += ev.amount;
          break;
        case 'largeExpense':
          drawFunds(state, ev.amount);
          break;
        case 'housePurchase': {
          if (state.home) {
            warnings.push({ age, eventId: ev.id, message: 'Already own a home — purchase skipped.' });
            break;
          }
          const cfg = data.lifeEvents.housePurchase;
          const price = ev.price ?? cfg.fallbackPrice;
          const downPct = ev.downPct ?? cfg.defaultDownPct;
          const rate = ev.rate ?? cfg.defaultMortgageRate;
          const term = ev.termYears ?? cfg.defaultTermYears;
          const down = price * downPct;
          const closing = price * cfg.closingCostPct;
          drawFunds(state, down + closing);
          const principal = price - down;
          const mId = `mortgage-${ev.id}`;
          state.debts.push({
            id: mId,
            name: 'Mortgage',
            balance: principal,
            apr: rate,
            termYears: term,
            monthlyPayment: monthlyPayment(principal, rate, term),
          });
          const colCity = data.col.cities[state.city];
          state.home = {
            value: price,
            purchasePrice: price,
            mortgageDebtId: mId,
            propertyTaxRate: colCity ? colCity.propertyTaxRate : cfg.defaultPropertyTaxRate,
          };
          break;
        }
        case 'newDebt': {
          const term = ev.termYears || 10;
          state.debts.push({
            id: `debt-${ev.id}`,
            name: ev.name || 'New debt',
            balance: ev.balance,
            apr: ev.apr,
            termYears: term,
            monthlyPayment: monthlyPayment(ev.balance, ev.apr, term),
          });
          break;
        }
        case 'payoffDebt': {
          const debt = state.debts.find((d) => d.id === ev.debtId);
          if (!debt || debt.balance <= 0) {
            warnings.push({
              age,
              eventId: ev.id,
              message: `Debt ${debt ? `"${debt.name}"` : ev.debtId} already paid off — payoff is a no-op.`,
            });
            break;
          }
          drawFunds(state, debt.balance);
          debt.balance = 0;
          break;
        }
        case 'newAsset':
          drawFunds(state, ev.value);
          state.assets.push({
            id: `asset-${ev.id}`,
            name: ev.name || 'New asset',
            value: ev.value,
            basis: ev.value,
            appreciation: ev.appreciation || 0,
          });
          break;
        case 'sellAsset': {
          const idx = state.assets.findIndex((a) => a.id === ev.assetId);
          if (idx < 0) {
            warnings.push({ age, eventId: ev.id, message: 'Asset no longer owned — sale skipped.' });
            break;
          }
          const asset = state.assets[idx];
          const gain = asset.value - asset.basis;
          const cgTax = Math.max(0, gain) * state.constants.capitalGainsRate;
          state.cash += asset.value - cgTax;
          state.assets.splice(idx, 1);
          break;
        }
        case 'sellHome':
          if (!state.home) {
            warnings.push({ age, eventId: ev.id, message: 'No home owned — sale skipped.' });
            break;
          }
          sellHomeInternal(state, warnings, age, data.federal.capitalGains.primaryResidenceExclusion);
          break;
        default:
          break;
      }
    }

    // ── 7b. Retirement decumulation (§4.4) ───────────────────────────────
    let ssBenefit = 0;
    let withdrawal = 0;
    if (retired) {
      if (ssMonthlyReal == null) {
        ssMonthlyReal =
          piaMonthly(state.realEarnings, data.retirement.socialSecurity) *
          claimingAdjustment(state.constants.ssClaimAge, data.retirement.socialSecurity);
      }
      const ssStartAge = Math.max(retirementAge, Math.round(state.constants.ssClaimAge));
      if (age >= ssStartAge) ssBenefit = ssMonthlyReal * 12 * state.inflFactor;
      withdrawal = (withdrawalReal || 0) * state.inflFactor;
      let needed = Math.max(0, withdrawal - ssBenefit);
      const fromInv = Math.min(state.investments, needed);
      state.investments -= fromInv;
      needed -= fromInv;
      const fromK = Math.min(state.k401, needed);
      state.k401 -= fromK;
      needed -= fromK;
      if (needed > 0) {
        const fromCash = Math.min(Math.max(0, state.cash), needed);
        state.cash -= fromCash;
        needed -= fromCash;
      }
      if (ssBenefit > withdrawal) state.cash += ssBenefit - withdrawal;
      if (state.investments + state.k401 <= 0.5) state.depleted = true;
    }

    // ── 8. Grow balances ──────────────────────────────────────────────────
    const r = state.constants.marketReturn;
    state.investments *= 1 + r;
    state.k401 *= 1 + r;
    if (state.home) state.home.value *= 1 + state.constants.homeAppreciation;
    for (const a of state.assets) a.value *= 1 + (a.appreciation || 0);

    // ── 9. Amortize debts ─────────────────────────────────────────────────
    for (const d of state.debts) {
      if (d.balance <= 0) continue;
      const interest = d.balance * d.apr;
      d.balance = Math.max(0, d.balance + interest - 12 * d.monthlyPayment);
    }

    // ── 10. Snapshot ──────────────────────────────────────────────────────
    const mortgage = state.home && state.home.mortgageDebtId
      ? state.debts.find((d) => d.id === state.home.mortgageDebtId)
      : null;
    const mortgageBalance = mortgage ? mortgage.balance : 0;
    const homeValue = state.home ? state.home.value : 0;
    const homeEquity = state.home ? homeValue - mortgageBalance : 0;
    const namedAssetsValue = state.assets.reduce((s, a) => s + a.value, 0);
    const otherDebt = state.debts.reduce(
      (s, d) => s + (mortgage && d.id === mortgage.id ? 0 : d.balance),
      0
    );
    const savings = state.cash + state.investments;
    const netWorth = savings + state.k401 + homeEquity + namedAssetsValue - otherDebt;
    snapshots.push({
      age,
      year,
      yearIndex,
      inflFactor: state.inflFactor,
      retired,
      income: { user: retired ? 0 : state.userIncome, partner: retired || !state.married ? 0 : state.partnerIncome, gross },
      tax,
      contrib401k: { employee, employer },
      spending: { base: baseSpend, child: childCost, propertyTax, total: spending },
      debtService,
      netSavings,
      savingRate,
      ssBenefit,
      withdrawal,
      depleted: state.depleted,
      portfolio: state.investments + state.k401,
      balances: {
        cash: state.cash,
        investments: state.investments,
        k401: state.k401,
        homeValue,
        homeEquity,
        mortgageBalance,
        assetsValue: namedAssetsValue,
        otherDebt,
        totalDebt: otherDebt + mortgageBalance,
      },
      components: { k401: state.k401, savings, assets: homeEquity + namedAssetsValue, debt: otherDebt },
      netWorth,
      city: state.city,
      filingStatus: state.filingStatus,
      married: state.married,
      colFactor: state.colFactor,
      lifestyleMult: state.lifestyleMult,
      entities: {
        debts: state.debts.filter((d) => d.balance > 0).map((d) => ({ id: d.id, name: d.name, balance: d.balance })),
        home: state.home ? { value: state.home.value, mortgageBalance } : null,
        assets: state.assets.map((a) => ({ id: a.id, name: a.name, value: a.value })),
        married: state.married,
      },
    });
  }
  return { snapshots, warnings };
}

/** Portfolio entering a given age (end-of-prior-year balance) from a pass. */
function portfolioEntering(pass, profile, age) {
  if (age <= profile.age) {
    return (profile.investments || 0) + (profile.k401 ? profile.k401.balance || 0 : 0);
  }
  const snap = pass.snapshots[age - 1 - profile.age];
  return snap ? snap.portfolio : 0;
}

function deflatorEntering(pass, profile, age) {
  if (age <= profile.age) return 1;
  const snap = pass.snapshots[age - 1 - profile.age];
  return snap ? snap.inflFactor : 1;
}

/**
 * Main entry. controls:
 *   { retirementAge, swr, mode: "fixAge" | "fixWithdrawal", targetWithdrawal }
 * targetWithdrawal is annual, pre-tax, in today's dollars.
 */
export function simulate(profile, constants, events, controls, data) {
  const ctl = {
    retirementAge: 67,
    swr: 0.04,
    mode: 'fixAge',
    targetWithdrawal: 0,
    ...controls,
  };
  // Pass 1: accumulation only (no retirement) → portfolio curve for the SWR math.
  const accumulation = runPass(profile, constants, events, Infinity, 0, data);

  let withdrawalReal;
  let solvedAge = null;
  let safeWithdrawalReal = null;
  if (ctl.mode === 'fixWithdrawal') {
    withdrawalReal = ctl.targetWithdrawal;
    for (let a = profile.age; a <= END_AGE; a++) {
      const p = portfolioEntering(accumulation, profile, a);
      const defl = deflatorEntering(accumulation, profile, a);
      if (ctl.swr * p >= ctl.targetWithdrawal * defl) {
        solvedAge = a;
        break;
      }
    }
  } else {
    const p = portfolioEntering(accumulation, profile, ctl.retirementAge);
    const defl = deflatorEntering(accumulation, profile, ctl.retirementAge);
    safeWithdrawalReal = (ctl.swr * p) / defl;
    withdrawalReal = safeWithdrawalReal;
  }

  const final = runPass(profile, constants, events, ctl.retirementAge, withdrawalReal, data);
  return {
    snapshots: final.snapshots,
    warnings: final.warnings,
    meta: {
      retirementAge: ctl.retirementAge,
      swr: ctl.swr,
      mode: ctl.mode,
      withdrawalReal,
      safeWithdrawalReal,
      solvedAge,
      feasible: ctl.mode !== 'fixWithdrawal' || solvedAge != null,
    },
  };
}

/** Real-view transform (§4.5): deflate a nominal snapshot value to today's dollars. */
export function toReal(value, snapshot) {
  return value / snapshot.inflFactor;
}
