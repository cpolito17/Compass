// Net-worth projection chart (§5.2): Recharts line with gradient + draw-in,
// real/nominal toggle (default real), hover breakdown tooltip, and the three
// interacting retirement controls (retirement age, target withdrawal, SWR).

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import { Card, SectionTitle, Field, NumberInput, PercentInput, Toggle } from '../../components/ui.jsx';
import AnimatedNumber from '../../components/AnimatedNumber.jsx';
import { fmtUSD, fmtUSDCompact, fmtPct } from '../../lib/format.js';

function BreakdownTooltip({ active, payload, mode }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  const rows = [
    ['401k', s.k401, 'text-violet-600'],
    ['Savings & investments', s.savings, 'text-indigo-600'],
    ['Assets (incl. home equity)', s.assets, 'text-emerald-600'],
    ['Debt', -s.debt, 'text-rose-600'],
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
      <div className="mb-1 flex items-baseline justify-between gap-6">
        <span className="font-semibold text-slate-700">Age {s.age} · {s.year}</span>
        <span className="text-slate-400">{mode === 'real' ? "today's $" : 'nominal $'}</span>
      </div>
      <div className="mb-1.5 text-base font-semibold text-slate-800">{fmtUSD(s.netWorth)}</div>
      {rows.map(([label, v, cls]) => (
        <div key={label} className="flex justify-between gap-6">
          <span className="text-slate-500">{label}</span>
          <span className={`font-medium tabular-nums ${cls}`}>{fmtUSD(v)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-6 border-t border-slate-100 pt-1">
        <span className="text-slate-500">Saving rate</span>
        {s.retired ? (
          <span className="font-medium text-slate-400">— in retirement</span>
        ) : (
          <span className={`font-medium tabular-nums ${s.savingRate < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {fmtPct(s.savingRate)}
          </span>
        )}
      </div>
      {s.retired && <div className="mt-1 text-slate-400">retired{s.depleted ? ' · portfolio depleted' : ''}</div>}
    </div>
  );
}

export default function NetWorthChart({ sim, controls, setControls, profile }) {
  const [mode, setMode] = useState('real'); // default: real (today's dollars)
  const { meta } = sim;

  const data = useMemo(
    () =>
      sim.snapshots.map((s) => {
        const f = mode === 'real' ? s.inflFactor : 1;
        return {
          age: s.age,
          year: s.year,
          netWorth: Math.round(s.netWorth / f),
          k401: Math.round(s.components.k401 / f),
          savings: Math.round(s.components.savings / f),
          assets: Math.round(s.components.assets / f),
          debt: Math.round(s.components.debt / f),
          savingRate: s.savingRate,
          retired: s.retired,
          depleted: s.depleted,
        };
      }),
    [sim, mode]
  );

  // Re-trigger the draw-in animation whenever the projection itself changes.
  const animKey = useMemo(
    () => `${mode}-${sim.snapshots.length}-${Math.round(sim.snapshots.at(-1)?.netWorth ?? 0)}`,
    [sim, mode]
  );

  const setC = (patch) => setControls((c) => ({ ...c, ...patch }));

  return (
    <Card>
      <SectionTitle hint="hover the line for a year-by-year breakdown">Net-worth trajectory</SectionTitle>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <Toggle
          options={[
            { value: 'fixAge', label: 'Fix retirement age' },
            { value: 'fixWithdrawal', label: 'Fix withdrawal target' },
          ]}
          value={controls.mode}
          onChange={(v) => setC({ mode: v })}
        />
        <Field label="Retirement age">
          <NumberInput value={controls.retirementAge} onChange={(v) => setC({ retirementAge: Math.round(v) })} min={profile.age + 1} max={100} className="w-24" />
        </Field>
        {controls.mode === 'fixWithdrawal' && (
          <Field label="Target withdrawal (pre-tax, today's $/yr)">
            <NumberInput value={controls.targetWithdrawal} onChange={(v) => setC({ targetWithdrawal: v })} prefix="$" min={0} className="w-36" />
          </Field>
        )}
        <Field label="Safe withdrawal rate">
          <PercentInput value={controls.swr} onChange={(v) => setC({ swr: v })} min={1} max={10} />
        </Field>

        <div className="ml-auto flex items-end gap-4">
          {controls.mode === 'fixAge' ? (
            <div className="text-right">
              <div className="text-xs text-slate-400">Safe annual withdrawal at {controls.retirementAge} (pre-tax, today's $)</div>
              <div className="text-xl font-semibold text-emerald-600">
                <AnimatedNumber value={meta.safeWithdrawalReal ?? 0} format={fmtUSD} />
              </div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-xs text-slate-400">Earliest age where {Math.round(controls.swr * 1000) / 10}% × portfolio covers the target</div>
              <div className="text-xl font-semibold text-emerald-600">
                {meta.solvedAge != null ? `age ${meta.solvedAge}` : 'not reached by 100'}
              </div>
            </div>
          )}
          <Toggle
            options={[
              { value: 'real', label: "Today's $" },
              { value: 'nominal', label: 'Nominal $' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="60%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="age" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tickCount={10} />
            <YAxis tickFormatter={fmtUSDCompact} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<BreakdownTooltip mode={mode} />} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            <ReferenceLine
              x={controls.retirementAge}
              stroke="#a5b4fc"
              strokeWidth={1}
              label={{ value: 'retire', position: 'insideTopRight', fontSize: 10, fill: '#818cf8' }}
            />
            {controls.mode === 'fixWithdrawal' && meta.solvedAge != null && (
              <ReferenceLine
                x={meta.solvedAge}
                stroke="#10b981"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{ value: `earliest: ${meta.solvedAge}`, position: 'insideTopLeft', fontSize: 10, fill: '#059669' }}
              />
            )}
            <Line
              key={animKey}
              type="monotone"
              dataKey="netWorth"
              stroke="url(#nwGradient)"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
              isAnimationActive
              animationDuration={900}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {sim.snapshots.some((s) => s.depleted) && (
        <p className="mt-2 text-xs font-medium text-rose-500">
          ⚠ The portfolio runs out before age 100 under this plan — the flat tail shows it.
        </p>
      )}
      <p className="mt-1 text-[11px] text-slate-400">
        Retirement withdrawals are pre-tax (v1). Social Security starts at your claiming age and offsets the withdrawal.
      </p>
    </Card>
  );
}
