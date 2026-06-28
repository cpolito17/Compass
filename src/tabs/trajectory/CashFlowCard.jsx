// "Where this year's money goes" (§6b). Makes the income → expenses → saving-rate
// relationship legible: gross is taxed into take-home, then take-home is split
// across living costs, debt, and each savings bucket. Reads the first projected
// year's allocation, so it updates live as income, debt, and budget change.

import { motion } from 'framer-motion';
import { Card, SectionTitle } from '../../components/ui.jsx';
import { fmtUSD, fmtPct } from '../../lib/format.js';

// Buckets that together sum to take-home (after-tax) income, in flow order.
const BUCKETS = [
  ['livingExpenses', 'Living expenses', '#94a3b8'],
  ['minDebt', 'Debt payments', '#fb7185'],
  ['debtExtra', 'Extra debt payoff', '#e11d48'],
  ['employee401k', '401k', '#8b5cf6'],
  ['hsa', 'HSA', '#14b8a6'],
  ['roth', 'Roth IRA', '#0ea5e9'],
  ['brokerage', 'Brokerage', '#6366f1'],
  ['deficit', 'Drawn from savings', '#f59e0b'],
];

export default function CashFlowCard({ sim }) {
  const snap = sim.snapshots[0];
  if (!snap || snap.retired) return null;
  const a = snap.allocation;
  const gross = snap.income.gross;
  const takeHome = a.afterTax;
  if (takeHome <= 0) return null;

  const segments = BUCKETS.map(([key, label, color]) => ({ key, label, color, value: a[key] || 0 })).filter(
    (s) => s.value > 0.5
  );
  const rateColor = snap.savingRate < 0.1 ? 'text-rose-600' : snap.savingRate < 0.2 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <SectionTitle hint={`this year (${snap.year}) — updates as you change income, debt, and budget`}>
          Where this year’s money goes
        </SectionTitle>
        <div className="text-right">
          <div className="text-xs text-slate-400">Saving rate</div>
          <div className={`text-2xl font-semibold tabular-nums ${rateColor}`}>{fmtPct(snap.savingRate)}</div>
        </div>
      </div>

      {/* Gross → tax → take-home */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <span>Gross <span className="font-semibold text-slate-700">{fmtUSD(gross)}</span></span>
        <span className="text-slate-300">−</span>
        <span>Taxes <span className="font-semibold text-rose-600">{fmtUSD(snap.tax.total)}</span> <span className="text-slate-400">({fmtPct(snap.tax.effectiveRate)})</span></span>
        <span className="text-slate-300">=</span>
        <span>Take-home <span className="font-semibold text-slate-700">{fmtUSD(takeHome)}</span></span>
        {a.employerMatch > 0 && (
          <span className="ml-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
            + {fmtUSD(a.employerMatch)} employer match
          </span>
        )}
      </div>

      {/* Stacked take-home bar */}
      <div className="mt-3 flex h-7 w-full overflow-hidden rounded-lg">
        {segments.map((s) => (
          <motion.div
            key={s.key}
            layout
            title={`${s.label}: ${fmtUSD(s.value)}`}
            style={{ width: `${(s.value / takeHome) * 100}%`, backgroundColor: s.color }}
            className="h-full"
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-slate-500">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="font-medium tabular-nums text-slate-700">{fmtUSD(s.value)}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Saving rate is the share of take-home going to investments and debt payoff rather than living costs — an aggressive
        rate early compounds hard by retirement.
      </p>
    </Card>
  );
}
