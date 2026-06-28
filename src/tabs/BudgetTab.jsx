// Tab 2 — Budget (§7): percentile sliders over lognormal spending distributions
// (two-way bound to dollars), a small PDF curve with a sliding dot per category,
// and a stacked Saving/Tax/Spending bar with click-to-expand subcategories.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Card, SectionTitle, NumberInput, Button, Toggle } from '../components/ui.jsx';
import { usePersistedState } from '../state/useStore.js';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import { dollarAtPercentile, percentileOfDollar, lognormalPdf } from '../engine/lognormal.js';
import { effectiveTax } from '../engine/tax.js';
import { monthlyPayment } from '../engine/simulate.js';
import { appData } from '../lib/data.js';
import { fmtUSD, fmtPct, ordinal, fmtUSDCompact } from '../lib/format.js';

const GROUP_COLORS = { Saving: '#10b981', Tax: '#f43f5e', Spending: '#6366f1' };

/** Marker color: cool indigo, warming toward amber past the ~85th percentile. */
function markerColor(p) {
  if (p < 0.85) return '#6366f1';
  const t = Math.min(1, (p - 0.85) / 0.14);
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(99, 245)}, ${lerp(102, 158)}, ${lerp(241, 11)})`;
}

function DistributionCurve({ mean, sigma, dollars }) {
  const W = 240;
  const H = 54;
  const { path, dot, p } = useMemo(() => {
    const xMax = dollarAtPercentile(0.995, mean, sigma);
    const n = 64;
    const pts = [];
    let maxY = 0;
    for (let i = 1; i <= n; i++) {
      const x = (i / n) * xMax;
      const y = lognormalPdf(x, mean, sigma);
      maxY = Math.max(maxY, y);
      pts.push([x, y]);
    }
    const sx = (x) => (x / xMax) * W;
    const sy = (y) => H - 4 - (y / maxY) * (H - 10);
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
    const cx = Math.min(dollars, xMax);
    return {
      path: d,
      dot: { x: sx(cx), y: sy(lognormalPdf(cx, mean, sigma)) },
      p: percentileOfDollar(dollars, mean, sigma),
    };
  }, [mean, sigma, dollars]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none">
      <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#curveFill)" opacity="0.25" />
      <path d={path} fill="none" stroke="#a5b4fc" strokeWidth="1.5" />
      <defs>
        <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.circle
        animate={{ cx: dot.x, cy: dot.y, fill: markerColor(p) }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        r="4.5"
        stroke="#fff"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function CategorySlider({ cat, dollars, setDollars, period }) {
  const div = period === 'monthly' ? 12 : 1;
  const p = percentileOfDollar(dollars, cat.meanAnnual, cat.sigma);
  const pct = Math.round(p * 100);
  return (
    <div className="rounded-xl border border-slate-100 p-3 transition hover:border-slate-200">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-slate-700">{cat.displayName}</span>
        <span className="text-xs font-semibold" style={{ color: markerColor(p) }}>
          {ordinal(Math.min(99, Math.max(1, pct)))} percentile
        </span>
      </div>
      <DistributionCurve mean={cat.meanAnnual} sigma={cat.sigma} dollars={dollars} />
      <div className="mt-1 flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={99}
          step={0.5}
          value={Math.min(99, Math.max(1, p * 100))}
          onChange={(e) => setDollars(Math.round(dollarAtPercentile(parseFloat(e.target.value) / 100, cat.meanAnnual, cat.sigma)))}
          className="flex-1"
        />
        <div className="w-28">
          <NumberInput value={Math.round(dollars / div)} onChange={(v) => setDollars(Math.max(1, v * div))} prefix="$" min={0} />
        </div>
      </div>
      <div className="mt-0.5 text-right text-[10px] text-slate-400">
        per {period === 'monthly' ? 'month' : 'year'} · US mean {fmtUSD(cat.meanAnnual / div)}
      </div>
    </div>
  );
}

export default function BudgetTab({ profile, setProfile, budget, setBudget }) {
  const [expanded, setExpanded] = useState('Spending');
  // Transient "sent" confirmation on the "Use this budget in Trajectory" button.
  const [sent, setSent] = useState(false);
  const sentTimer = useRef(null);
  useEffect(() => () => clearTimeout(sentTimer.current), []);
  // Display period for every dollar figure on this tab. Amounts are stored
  // annually; this is a pure display/entry transform (monthly entry stores ×12).
  const [period, setPeriod] = usePersistedState('pf.budgetPeriod', 'monthly');
  const div = period === 'monthly' ? 12 : 1;
  const per = period === 'monthly' ? '/mo' : '/yr';
  const cats = appData.spending.categories;

  const totals = useMemo(() => {
    const income = profile.income;
    const employee = Math.min(profile.k401.employeeContribPct * income, appData.retirement.k401.employeeLimit);
    const tax = effectiveTax(income, profile.filingStatus, profile.homeCity, appData, employee);
    const spendCats = cats.map((c) => ({ name: c.displayName, value: budget[c.key] ?? c.meanAnnual }));
    const debtService = (profile.debts || []).reduce(
      (s, d) => s + 12 * monthlyPayment(d.balance, d.apr, d.termYears),
      0
    );
    if (debtService > 0) spendCats.push({ name: 'Debt payments', value: debtService });
    const spending = spendCats.reduce((s, c) => s + c.value, 0);
    const afterTax = income - tax.total;
    const netSaving = afterTax - spending - employee;
    const savingRate = afterTax > 0 ? netSaving / afterTax : 0;
    return { income, employee, tax, spendCats, spending, afterTax, netSaving, savingRate, debtService };
  }, [profile, budget, cats]);

  const barData = [
    {
      name: 'budget',
      Saving: Math.max(0, totals.netSaving + totals.employee) / div,
      Tax: totals.tax.total / div,
      Spending: totals.spending / div,
    },
  ];

  const subcats = {
    Saving: [
      { name: '401k contribution (pre-tax)', value: totals.employee },
      { name: 'Net cash saving', value: totals.netSaving },
    ],
    Tax: [
      { name: 'Federal income tax', value: totals.tax.federal },
      { name: 'FICA', value: totals.tax.fica },
      { name: 'State income tax', value: totals.tax.state },
      ...(totals.tax.local > 0 ? [{ name: 'Local income tax', value: totals.tax.local }] : []),
    ],
    Spending: totals.spendCats,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-slate-400">Show all amounts</span>
        <Toggle
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'annual', label: 'Annual' },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card>
        <SectionTitle hint="percentiles are among all US households (BLS CE 2024)">
          Where do you sit, category by category?
        </SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {cats.map((c) => (
            <CategorySlider
              key={c.key}
              cat={c}
              dollars={budget[c.key] ?? c.meanAnnual}
              setDollars={(v) => setBudget((b) => ({ ...b, [c.key]: v }))}
              period={period}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Each curve is the lognormal spending distribution for that category (right-skewed on purpose — a long tail of heavy
          spenders). Drag the slider or type a dollar amount; they stay in sync. σ values are calibrated estimates.
        </p>
      </Card>

      <div className="space-y-4">
        <Card>
          <SectionTitle hint="click a block to expand">Your income, split</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barSize={88}>
                <XAxis dataKey="name" hide />
                <YAxis tickFormatter={fmtUSDCompact} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={52} />
                <Tooltip
                  formatter={(v, k) => [`${fmtUSD(v)}${per}`, k]}
                  cursor={{ fill: 'rgba(148,163,184,0.06)' }}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
                {['Spending', 'Tax', 'Saving'].map((k) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="a"
                    fill={GROUP_COLORS[k]}
                    radius={k === 'Saving' ? [8, 8, 0, 0] : k === 'Spending' ? [0, 0, 8, 8] : 0}
                    cursor="pointer"
                    onClick={() => setExpanded((e) => (e === k ? null : k))}
                    opacity={expanded && expanded !== k ? 0.45 : 1}
                    isAnimationActive
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex justify-center gap-4 text-xs">
            {Object.entries(GROUP_COLORS).map(([k, color]) => (
              <button key={k} type="button" onClick={() => setExpanded((e) => (e === k ? null : k))} className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 transition ${expanded === k ? 'bg-slate-100 font-semibold' : 'text-slate-500'}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {k}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {expanded && (
              <motion.div
                key={expanded}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3">
                  {subcats[expanded].map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{s.name}</span>
                      <span className="tabular-nums text-slate-700">
                        <span className={`font-semibold ${s.value < 0 ? 'text-rose-600' : ''}`}>{fmtUSD(s.value / div)}</span>
                        <span className="ml-2 inline-block w-12 text-right text-slate-400">{fmtPct(s.value / Math.max(1, totals.income))}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <Card>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400">Net saving {per.slice(1) === 'mo' ? '/ mo' : '/ yr'} (after tax &amp; 401k)</div>
              <div className={`text-2xl font-semibold ${totals.netSaving < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                <AnimatedNumber value={totals.netSaving / div} format={fmtUSD} />
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Saving rate (of after-tax income)</div>
              <div className={`text-2xl font-semibold ${totals.savingRate < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                <AnimatedNumber value={totals.savingRate} format={(v) => fmtPct(v)} />
              </div>
            </div>
          </div>
          <Button
            className={`mt-4 w-full overflow-hidden transition-colors duration-300 ${
              sent ? '!bg-emerald-600 hover:!bg-emerald-600' : ''
            }`}
            onClick={() => {
              setProfile((p) => ({ ...p, baselineSpending: Math.round(totals.spending - totals.debtService) }));
              setSent(true);
              clearTimeout(sentTimer.current);
              sentTimer.current = setTimeout(() => setSent(false), 1900);
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {sent ? (
                <motion.span
                  key="sent"
                  className="flex items-center justify-center gap-1.5"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  <motion.svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <motion.path
                      d="M4 12.5 L10 18 L20 6"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ delay: 0.08, duration: 0.32, ease: 'easeOut' }}
                    />
                  </motion.svg>
                  Sent to Trajectory
                </motion.span>
              ) : (
                <motion.span
                  key="label"
                  className="block"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                >
                  Use this budget in Trajectory ({fmtUSD((totals.spending - totals.debtService) / div)}{per})
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
          <p className="mt-2 text-[11px] text-slate-400">
            Sets your Trajectory baseline spending to the category total (debt payments are already modeled separately there).
          </p>
        </Card>
      </div>
      </div>
    </div>
  );
}
