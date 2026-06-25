// Tax engine (§12). Pure functions; all tables injected via the `data` argument
// so the same code runs in the app and in node-based tests.

/** Progressive tax over a bracket array [{upTo, rate}, ...] (upTo null = no ceiling). */
export function progressiveTax(taxable, brackets) {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const ceil = b.upTo == null ? Infinity : b.upTo;
    const slice = Math.min(taxable, ceil) - prev;
    if (slice <= 0) break;
    tax += slice * b.rate;
    prev = ceil;
  }
  return tax;
}

export function federalIncomeTax(gross, pretax401k, filingStatus, federal) {
  const taxable = Math.max(0, gross - pretax401k - federal.standardDeduction[filingStatus]);
  return progressiveTax(taxable, federal.brackets[filingStatus]);
}

export function ficaTax(wages, filingStatus, federal) {
  if (wages <= 0) return 0;
  const f = federal.fica;
  const ss = Math.min(wages, f.ssWageBase) * f.ssRate;
  const medicare = wages * f.medicareRate;
  const addl = Math.max(0, wages - f.addlMedicareThreshold[filingStatus]) * f.addlMedicareRate;
  return ss + medicare + addl;
}

export function stateIncomeTax(gross, pretax401k, filingStatus, stateDef) {
  if (!stateDef || stateDef.type === 'none') return 0;
  const sd = stateDef.standardDeduction ? stateDef.standardDeduction[filingStatus] : 0;
  const taxable = Math.max(0, gross - pretax401k - sd);
  if (taxable <= 0) return 0;
  if (stateDef.type === 'flat') return taxable * stateDef.rate;
  return progressiveTax(taxable, stateDef.brackets[filingStatus]);
}

export function localIncomeTax(wages, cityKey, local) {
  const entry = local.cities[cityKey];
  if (!entry || wages <= 0) return 0;
  return wages * entry.rate;
}

/**
 * effectiveTax(grossIncome, filingStatus, cityKey, data, pretax401k)
 *   → { federal, fica, state, local, total, effectiveRate }
 * `data` needs: { federal, state, local, cityIndex } where cityIndex maps
 * cityKey → { state: "CA", ... }.
 */
export function effectiveTax(gross, filingStatus, cityKey, data, pretax401k = 0) {
  if (gross <= 0) {
    return { federal: 0, fica: 0, state: 0, local: 0, total: 0, effectiveRate: 0 };
  }
  const city = data.cityIndex[cityKey];
  const stateDef = city ? data.state.states[city.state] : null;
  const federal = federalIncomeTax(gross, pretax401k, filingStatus, data.federal);
  const fica = ficaTax(gross, filingStatus, data.federal);
  const state = stateIncomeTax(gross, pretax401k, filingStatus, stateDef);
  const local = localIncomeTax(gross, cityKey, data.local);
  const total = federal + fica + state + local;
  return { federal, fica, state, local, total, effectiveRate: total / gross };
}
