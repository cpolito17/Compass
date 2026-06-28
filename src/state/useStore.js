// Shared profile + constants + events + controls, persisted to localStorage (§3).
// One source of truth read by all three tabs.

import { useEffect, useState } from 'react';
import { appData } from '../lib/data.js';

export const DEFAULT_PROFILE = {
  age: 30,
  filingStatus: 'single',
  homeCity: 'los-angeles-ca',
  income: 90000,
  cash: 15000,
  investments: 30000,
  k401: { balance: 40000, employeeContribPct: 0.08, employerMatchRate: 1.0, employerMatchCapPct: 0.04 },
  debts: [],
  home: null,
  assets: [],
  baselineSpending: 55000,
  // Saving strategy (§6b). 'manual' keeps the fixed 401k % below; 'auto' ignores
  // it and routes each year's surplus through the financial order of operations.
  savingMode: 'auto',
  hsaEligible: false,
  hsaFamily: false,
};

export const DEFAULT_CONTROLS = {
  retirementAge: 65,
  swr: 0.04,
  mode: 'fixAge', // "fixAge" | "fixWithdrawal"
  targetWithdrawal: 60000, // today's dollars, pre-tax
};

export const DEFAULT_COMPARE = { cities: ['austin-tx', 'chicago-il'], incomeOverrides: {} };

function load(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(defaults)) return { ...defaults, ...parsed };
      return parsed;
    }
  } catch {
    /* corrupted storage → fall back to defaults */
  }
  return defaults;
}

export function usePersistedState(key, defaults) {
  const [value, setValue] = useState(() => load(key, defaults));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full/blocked — app still works in-memory */
    }
  }, [key, value]);
  return [value, setValue];
}

export function useProfile() {
  return usePersistedState('pf.profile', DEFAULT_PROFILE);
}

export function useConstants() {
  return usePersistedState('pf.constants', { ...appData.constantsDefaults.constants });
}

export function useEvents() {
  return usePersistedState('pf.events', []);
}

export function useControls() {
  return usePersistedState('pf.controls', DEFAULT_CONTROLS);
}

/** Budget tab: dollars per category key; defaults to each category's BLS mean. */
export function useBudget() {
  const defaults = {};
  for (const c of appData.spending.categories) defaults[c.key] = c.meanAnnual;
  return usePersistedState('pf.budget', defaults);
}

export function useCompare() {
  return usePersistedState('pf.compare', DEFAULT_COMPARE);
}
