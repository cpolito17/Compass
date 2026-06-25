// Tab 3 — Compare (§8): 2–4 cities against the grey home-city baseline.
// Per-category costs scale by category-level COL indices; each city gets its
// correct federal+FICA+state+local tax; conditional formatting is the %-diff
// gradient from §8.2 (direction reversed for income / saving-rate rows).

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, SectionTitle, NumberInput, Button } from '../components/ui.jsx';
import CityAutocomplete from '../components/CityAutocomplete.jsx';
import { effectiveTax } from '../engine/tax.js';
import { monthlyPayment } from '../engine/simulate.js';
import { appData } from '../lib/data.js';
import { fmtUSD, fmtPct } from '../lib/format.js';

/** §8.2 gradient bands. `moreIsBetter` flips green/red for income/saving rows. */
function bandClass(diff, moreIsBetter, isHome) {
  if (isHome) return 'bg-slate-100 text-slate-600';
  if (diff == null || Number.isNaN(diff)) return '';
  const d = moreIsBetter ? -diff : diff;
  if (d <= -0.15) return 'bg-emerald-200/80 text-emerald-950';
  if (d <= -0.05) return 'bg-emerald-100/80 text-emerald-900';
  if (d < 0.05) return 'bg-slate-50 text-slate-700';
  if (d < 0.15) return 'bg-rose-100/80 text-rose-900';
  return 'bg-rose-200/80 text-rose-950';
}

export default function CompareTab({ profile, budget, compare, setCompare }) {
  const homeKey = profile.homeCity;
  const homeCol = appData.col.cities[homeKey];
  const cats = appData.spending.categories;

  const cityKeys = compare.cities.filter((k) => k !== homeKey && appData.col.cities[k]).slice(0, 4);
  const columns = [homeKey, ...cityKeys];

  const debtService = (profile.debts || []).reduce((s, d) => s + 12 * monthlyPayment(d.balance, d.apr, d.termYears), 0);

  const rows = useMemo(() => {
    const perCity = columns.map((key) => {
      const col = appData.col.cities[key];
      const isHome = key === homeKey;
      const suggested = isHome ? profile.income : (profile.income * col.composite) / homeCol.composite;
      const income = isHome ? profile.income : compare.incomeOverrides[key] ?? Math.round(suggested);
      const employee = Math.min(profile.k401.employeeContribPct * income, appData.retirement.k401.employeeLimit);
      const tax = effectiveTax(income, profile.filingStatus, key, appData, employee);
      const catCosts = {};
      let spending = 0;
      for (const c of cats) {
        const base = budget[c.key] ?? c.meanAnnual;
        const scaled = c.colSensitive && c.colCategory
          ? (base * col[c.colCategory]) / homeCol[c.colCategory]
          : base;
        catCosts[c.key] = scaled;
        spending += scaled;
      }
      const afterTax = income - tax.total;
      const net = afterTax - spending - employee - debtService;
      const savingRate = afterTax > 0 ? net / afterTax : 0;
      return { key, isHome, col, income, suggested, tax, catCosts, spending, afterTax, net, savingRate };
    });
    return perCity;
  }, [columns.join(','), profile, budget, compare.incomeOverrides]);

  const home = rows[0];

  const setOverride = (key, v) =>
    setCompare((c) => ({ ...c, incomeOverrides: { ...c.incomeOverrides, [key]: v } }));

  const addCity = (key) => {
    if (key === homeKey || cityKeys.includes(key) || cityKeys.length >= 4) return;
    setCompare((c) => ({ ...c, cities: [...cityKeys, key] }));
  };
  const removeCity = (key) => setCompare((c) => ({ ...c, cities: cityKeys.filter((k) => k !== key) }));

  const diff = (v, base) => (base === 0 ? null : (v - base) / Math.abs(base));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <SectionTitle hint="costs scale by metro price parities; taxes are per-jurisdiction">
          Cost-of-living face-off
        </SectionTitle>
        <div className="w-64">
          <CityAutocomplete
            value={null}
            onSelect={addCity}
            placeholder={cityKeys.length >= 4 ? 'Remove a city to add another' : '+ Add a city (up to 4)…'}
            exclude={[homeKey, ...cityKeys]}
          />
        </div>
      </div>

      {cityKeys.length === 0 && (
        <p className="mb-4 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          Add 2–4 cities to compare against {appData.cityIndex[homeKey]?.name} — taxes, category-level costs, and what's left
          to save.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate" style={{ borderSpacing: '2px 2px' }}>
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-xs font-medium text-slate-400">vs. {fmtUSD(profile.income)} at home</th>
              {rows.map((r) => (
                <th key={r.key} className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${r.isHome ? 'bg-slate-100 text-slate-600' : 'bg-indigo-50 text-indigo-800'}`}>
                  <div className="flex items-center justify-center gap-1.5">
                    {appData.cityIndex[r.key]?.name}
                    {r.isHome ? (
                      <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-medium text-slate-500">home</span>
                    ) : (
                      <button type="button" onClick={() => removeCity(r.key)} className="text-indigo-300 hover:text-rose-500" title="Remove">
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {/* Income row (editable per city, seeded with COL-adjusted suggestion) */}
            <tr>
              <td className="px-2 py-1 text-xs font-medium text-slate-500">
                Income <span className="text-slate-300">(editable · more is better)</span>
              </td>
              {rows.map((r) => (
                <td key={r.key} className={`rounded px-2 py-1 text-center tabular-nums ${bandClass(diff(r.income, home.income), true, r.isHome)}`}>
                  {r.isHome ? (
                    <span className="font-medium">{fmtUSD(r.income)}</span>
                  ) : (
                    <NumberInput value={Math.round(r.income)} onChange={(v) => setOverride(r.key, v)} prefix="$" min={0} className="!bg-white/60 text-center" />
                  )}
                </td>
              ))}
            </tr>

            {/* Category cost rows */}
            {cats.map((c) => (
              <tr key={c.key}>
                <td className="px-2 py-1 text-xs text-slate-500">{c.displayName}{!c.colSensitive && <span className="text-slate-300"> (national)</span>}</td>
                {rows.map((r) => (
                  <td key={r.key} className={`rounded px-2 py-1 text-center tabular-nums ${bandClass(diff(r.catCosts[c.key], home.catCosts[c.key]), false, r.isHome)}`}>
                    {fmtUSD(r.catCosts[c.key])}
                  </td>
                ))}
              </tr>
            ))}

            {/* Tax row */}
            <tr>
              <td className="px-2 py-1 text-xs font-medium text-slate-500">Taxes (fed + FICA + state + local)</td>
              {rows.map((r) => (
                <td key={r.key} className={`rounded px-2 py-1 text-center tabular-nums ${bandClass(diff(r.tax.total, home.tax.total), false, r.isHome)}`}>
                  {fmtUSD(r.tax.total)}
                  <span className="ml-1 text-[10px] opacity-60">{fmtPct(r.tax.effectiveRate)}</span>
                </td>
              ))}
            </tr>

            {/* Total spending */}
            <tr>
              <td className="px-2 py-1 text-xs font-medium text-slate-500">Total spending</td>
              {rows.map((r) => (
                <td key={r.key} className={`rounded px-2 py-1 text-center font-medium tabular-nums ${bandClass(diff(r.spending, home.spending), false, r.isHome)}`}>
                  {fmtUSD(r.spending)}
                </td>
              ))}
            </tr>

            {/* Effective saving rate (bottom row) */}
            <tr>
              <td className="px-2 py-1 text-xs font-semibold text-slate-600">
                Effective saving rate <span className="text-slate-300">(more is better)</span>
              </td>
              {rows.map((r) => (
                <motion.td
                  key={r.key}
                  layout
                  className={`rounded-b-lg px-2 py-2 text-center text-base font-semibold tabular-nums ${bandClass(diff(r.savingRate, home.savingRate), true, r.isHome)}`}
                >
                  {fmtPct(r.savingRate)}
                  <div className="text-[10px] font-normal opacity-60">{fmtUSD(r.net)}/yr net</div>
                </motion.td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          Income suggestions seed at {`income × (city index ÷ home index)`} — overwrite them with a real offer. Category
          spending comes from your Budget tab settings.
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-200" /> better than home
          <span className="h-2.5 w-2.5 rounded-full bg-slate-100" /> ±5%
          <span className="h-2.5 w-2.5 rounded-full bg-rose-200" /> worse than home
        </span>
      </div>
    </Card>
  );
}
