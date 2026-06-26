// Life-event timeline (§5.3, §10): horizontal timeline, persistent + control,
// 16 event types, minimal inputs with costs pulled from life-event-costs.json.
// Entity dropdowns validate against the simulated state at the event's age by
// replaying the timeline (the current sim run's snapshots).

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card, SectionTitle, Field, NumberInput, PercentInput, Select, Button, Checkbox } from '../../components/ui.jsx';
import CityAutocomplete from '../../components/CityAutocomplete.jsx';
import { simulate } from '../../engine/simulate.js';
import { appData } from '../../lib/data.js';
import { fmtUSD, fmtPct } from '../../lib/format.js';

export const EVENT_TYPES = [
  { type: 'newJob', label: 'New job', icon: '💼' },
  { type: 'promotion', label: 'Promotion / raise', icon: '📈' },
  { type: 'housePurchase', label: 'House purchase', icon: '🏠' },
  { type: 'childBorn', label: 'Child born', icon: '👶' },
  { type: 'windfall', label: 'Inheritance / windfall', icon: '🪙' },
  { type: 'largeExpense', label: 'Large expense', icon: '💸' },
  { type: 'newDebt', label: 'New debt', icon: '🧾' },
  { type: 'payoffDebt', label: 'Pay off debt', icon: '✅' },
  { type: 'move', label: 'Move', icon: '🚚' },
  { type: 'constantChange', label: 'Constant change', icon: '🎛️' },
  { type: 'sellHome', label: 'Sell home', icon: '🔑' },
  { type: 'newAsset', label: 'New asset', icon: '🚗' },
  { type: 'sellAsset', label: 'Sell asset', icon: '🏷️' },
  { type: 'colChange', label: 'Lifestyle (COL) change', icon: '🎚️' },
  { type: 'marriage', label: 'Marriage', icon: '💍' },
  { type: 'divorce', label: 'Divorce', icon: '⚖️' },
];

const typeMeta = Object.fromEntries(EVENT_TYPES.map((t) => [t.type, t]));

/** Simulated entities entering `age` (end of the prior year), per §4.2. */
function entitiesEnteringAge(sim, profile, age) {
  if (age <= profile.age) {
    return {
      debts: (profile.debts || []).filter((d) => d.balance > 0).map((d) => ({ id: d.id, name: d.name, balance: d.balance })),
      home: profile.home?.owned ? { value: profile.home.value } : null,
      assets: (profile.assets || []).map((a) => ({ id: a.id, name: a.name, value: a.value })),
      married: profile.filingStatus === 'mfj',
    };
  }
  const snap = sim.snapshots[Math.min(age - 1 - profile.age, sim.snapshots.length - 1)];
  return snap ? snap.entities : { debts: [], home: null, assets: [], married: false };
}

function defaultsForType(type, profile, entities) {
  const cfg = appData.lifeEvents.housePurchase;
  switch (type) {
    case 'newJob':
      return { income: profile.income, employeeContribPct: profile.k401.employeeContribPct, employerMatchRate: profile.k401.employerMatchRate, employerMatchCapPct: profile.k401.employerMatchCapPct };
    case 'promotion':
      return { pctBump: 0.1, income: null };
    case 'housePurchase':
      return { price: cfg.fallbackPrice, downPct: cfg.defaultDownPct, rate: cfg.defaultMortgageRate, termYears: cfg.defaultTermYears };
    case 'childBorn':
      return { childcare: true, privateK12: false, collegeFund: false, collegeType: 'public' };
    case 'windfall':
      return { amount: 50000 };
    case 'largeExpense':
      return { amount: 20000 };
    case 'newDebt':
      return { name: 'Loan', balance: 20000, apr: 0.07, termYears: 5 };
    case 'payoffDebt':
      return { debtId: entities.debts[0]?.id ?? null };
    case 'move':
      return { cityKey: appData.cities.find((c) => c.key !== profile.homeCity)?.key };
    case 'constantChange':
      return { constant: 'marketReturn', value: appData.constantsDefaults.constants.marketReturn };
    case 'newAsset':
      return { name: 'Asset', value: 25000, appreciation: 0.03 };
    case 'sellAsset':
      return { assetId: entities.assets[0]?.id ?? null };
    case 'colChange':
      return { multiplier: 1.0 };
    case 'marriage':
      return { partnerIncome: 60000, partnerSavings: 20000, partnerDebt: 0, partnerDebtApr: 0.06, colIncrease: 0.2 };
    default:
      return {};
  }
}

/** Reasons a type can't be placed at this age (validated dropdowns, §4.2). */
function typeDisabledReason(type, entities) {
  if (type === 'payoffDebt' && entities.debts.length === 0) return 'no debt with a balance at this age';
  if (type === 'sellAsset' && entities.assets.length === 0) return 'no owned asset at this age';
  if (type === 'sellHome' && !entities.home) return 'no home owned at this age';
  if (type === 'housePurchase' && entities.home) return 'already own a home at this age';
  if (type === 'divorce' && !entities.married) return 'no active marriage at this age';
  if (type === 'marriage' && entities.married) return 'already married at this age';
  return null;
}

function EventFields({ ev, setEv, entities, savingRateReadout }) {
  const set = (patch) => setEv((e) => ({ ...e, ...patch }));
  switch (ev.type) {
    case 'newJob':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="New annual income"><NumberInput value={ev.income} onChange={(v) => set({ income: v })} prefix="$" min={0} /></Field>
          <Field label="401k contribution"><PercentInput value={ev.employeeContribPct} onChange={(v) => set({ employeeContribPct: v })} max={100} /></Field>
          <Field label="Employer match rate"><PercentInput value={ev.employerMatchRate} onChange={(v) => set({ employerMatchRate: v })} max={200} /></Field>
          <Field label="Match cap (% of salary)"><PercentInput value={ev.employerMatchCapPct} onChange={(v) => set({ employerMatchCapPct: v })} max={25} /></Field>
        </div>
      );
    case 'promotion':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Raise (% bump)"><PercentInput value={ev.pctBump ?? 0} onChange={(v) => set({ pctBump: v, income: null })} max={500} /></Field>
          <Field label="…or set new income"><NumberInput value={ev.income} onChange={(v) => set({ income: v, pctBump: null })} prefix="$" min={0} placeholder="leave blank to use %" /></Field>
        </div>
      );
    case 'housePurchase':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><NumberInput value={ev.price} onChange={(v) => set({ price: v })} prefix="$" min={0} /></Field>
          <Field label="Down payment"><PercentInput value={ev.downPct} onChange={(v) => set({ downPct: v })} max={100} /></Field>
          <Field label="Mortgage rate"><PercentInput value={ev.rate} onChange={(v) => set({ rate: v })} max={20} /></Field>
          <Field label="Term (years)"><NumberInput value={ev.termYears} onChange={(v) => set({ termYears: v })} min={5} max={40} /></Field>
          <p className="col-span-2 text-[11px] text-slate-400">
            Adds {fmtPct(appData.lifeEvents.housePurchase.closingCostPct, 0)} closing costs; property tax comes from the city you live in then.
          </p>
        </div>
      );
    case 'childBorn': {
      const c = appData.lifeEvents.child;
      return (
        <div className="space-y-2">
          <Checkbox checked={ev.childcare} onChange={(v) => set({ childcare: v })} label={`Childcare, ages 0–4 (≈ ${fmtUSD(c.childcare.nationalAvgAnnual)}/yr national; state-adjusted)`} />
          <Checkbox checked={ev.privateK12} onChange={(v) => set({ privateK12: v })} label={`Private K-12, ages 5–17 (≈ ${fmtUSD(c.privateK12.nationalAvgAnnual)}/yr)`} />
          <Checkbox checked={ev.collegeFund} onChange={(v) => set({ collegeFund: v })} label="College fund (529), ages 18–21" />
          {ev.collegeFund && (
            <Select
              value={ev.collegeType}
              onChange={(v) => set({ collegeType: v })}
              options={[
                { value: 'public', label: `Public in-state (≈ ${fmtUSD(c.college.publicInStateAnnual)}/yr all-in)` },
                { value: 'private', label: `Private (≈ ${fmtUSD(c.college.privateAnnual)}/yr all-in)` },
              ]}
            />
          )}
          <p className="text-[11px] text-slate-400">Base cost ≈ {fmtUSD(c.baseAnnual)}/yr to 18 (USDA). The expense windows in and out automatically.</p>
        </div>
      );
    }
    case 'windfall':
      return <Field label="Amount (after any estate tax)"><NumberInput value={ev.amount} onChange={(v) => set({ amount: v })} prefix="$" min={0} /></Field>;
    case 'largeExpense':
      return <Field label="Amount"><NumberInput value={ev.amount} onChange={(v) => set({ amount: v })} prefix="$" min={0} /></Field>;
    case 'newDebt':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2">
            <input type="text" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-400" value={ev.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Balance"><NumberInput value={ev.balance} onChange={(v) => set({ balance: v })} prefix="$" min={0} /></Field>
          <Field label="APR"><PercentInput value={ev.apr} onChange={(v) => set({ apr: v })} max={40} /></Field>
          <Field label="Term (years)"><NumberInput value={ev.termYears} onChange={(v) => set({ termYears: v })} min={1} max={40} /></Field>
        </div>
      );
    case 'payoffDebt':
      return (
        <Field label="Debt to pay off (with a balance at this age)">
          <Select
            value={ev.debtId ?? ''}
            onChange={(v) => set({ debtId: v })}
            options={entities.debts.map((d) => ({ value: d.id, label: `${d.name} — ${fmtUSD(d.balance)} left` }))}
          />
        </Field>
      );
    case 'move':
      return (
        <Field label="New city">
          <CityAutocomplete value={ev.cityKey} onSelect={(key) => set({ cityKey: key })} />
        </Field>
      );
    case 'constantChange': {
      const labels = appData.constantsDefaults.labels;
      const isAge = ev.constant === 'ssClaimAge';
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Constant">
            <Select
              value={ev.constant}
              onChange={(v) => set({ constant: v, value: appData.constantsDefaults.constants[v] })}
              options={Object.keys(labels).map((k) => ({ value: k, label: labels[k] }))}
            />
          </Field>
          <Field label={isAge ? 'New age' : 'New value (nominal)'}>
            {isAge ? (
              <NumberInput value={ev.value} onChange={(v) => set({ value: v })} min={62} max={70} />
            ) : (
              <PercentInput value={ev.value} onChange={(v) => set({ value: v })} min={-10} max={50} />
            )}
          </Field>
        </div>
      );
    }
    case 'sellHome':
      return (
        <p className="text-sm text-slate-500">
          Sells the home at its simulated value{entities.home ? ` (≈ ${fmtUSD(entities.home.value)} then)` : ''}, nets out the
          mortgage and capital-gains tax with the primary-residence exclusion, and stops property tax.
        </p>
      );
    case 'newAsset':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2">
            <input type="text" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-400" value={ev.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Purchase price"><NumberInput value={ev.value} onChange={(v) => set({ value: v })} prefix="$" min={0} /></Field>
          <Field label="Appreciation / yr"><PercentInput value={ev.appreciation} onChange={(v) => set({ appreciation: v })} min={-50} max={50} /></Field>
        </div>
      );
    case 'sellAsset':
      return (
        <Field label="Asset to sell (owned at this age)">
          <Select
            value={ev.assetId ?? ''}
            onChange={(v) => set({ assetId: v })}
            options={entities.assets.map((a) => ({ value: a.id, label: `${a.name} — worth ≈ ${fmtUSD(a.value)} then` }))}
          />
        </Field>
      );
    case 'colChange':
      return (
        <div>
          <Field label={`Lifestyle multiplier: ${ev.multiplier.toFixed(2)}× current spending`}>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={ev.multiplier}
              onChange={(e) => set({ multiplier: parseFloat(e.target.value) })}
            />
          </Field>
          <div className="mt-1 flex justify-between text-[11px] text-slate-400">
            <span>0.5× lean</span><span>1× current</span><span>2× lavish</span>
          </div>
          {savingRateReadout != null && (
            <p className="mt-2 text-xs text-slate-500">
              Saving rate that year: <span className={`font-semibold ${savingRateReadout < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtPct(savingRateReadout)}</span>
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-400">Persists until overridden; stacks multiplicatively with Move.</p>
        </div>
      );
    case 'marriage':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partner annual income"><NumberInput value={ev.partnerIncome} onChange={(v) => set({ partnerIncome: v })} prefix="$" min={0} /></Field>
          <Field label="Partner savings (one-time in)"><NumberInput value={ev.partnerSavings} onChange={(v) => set({ partnerSavings: v })} prefix="$" min={0} /></Field>
          <Field label="Partner debt"><NumberInput value={ev.partnerDebt} onChange={(v) => set({ partnerDebt: v })} prefix="$" min={0} /></Field>
          {ev.partnerDebt > 0 && (
            <Field label="Partner debt APR"><PercentInput value={ev.partnerDebtApr} onChange={(v) => set({ partnerDebtApr: v })} max={40} /></Field>
          )}
          <Field label="Household COL increase"><PercentInput value={ev.colIncrease} onChange={(v) => set({ colIncrease: v })} max={100} /></Field>
          <p className="col-span-2 text-[11px] text-slate-400">Files jointly from this age. 401k stays tied to your own salary (v1).</p>
        </div>
      );
    case 'divorce':
      return (
        <p className="text-sm text-slate-500">
          Splits the entire balance sheet 50/50 (including debts), sells the home and splits the equity, removes partner
          income and the marriage-era COL bump, and reverts filing status to single.
        </p>
      );
    default:
      return null;
  }
}

function EventEditor({ draft, setDraft, onSave, onCancel, onDelete, sim, profile, constants, controls, isNew }) {
  const entities = useMemo(
    () => entitiesEnteringAge(sim, profile, draft.age),
    [sim, profile, draft.age]
  );
  const reason = typeDisabledReason(draft.type, entities);

  // Live saving-rate readout for the lifestyle slider (§10 #14): run the engine
  // with the draft applied and read that year's saving rate.
  const savingRateReadout = useMemo(() => {
    if (draft.type !== 'colChange') return null;
    try {
      const others = sim.events?.filter?.((e) => e.id !== draft.id) ?? [];
      const r = simulate(profile, constants, [...others, draft], controls, appData);
      const snap = r.snapshots[draft.age - profile.age];
      return snap ? snap.savingRate : null;
    } catch {
      return null;
    }
  }, [draft, sim, profile, constants, controls]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        initial={{ scale: 0.96, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">
            {typeMeta[draft.type].icon} {typeMeta[draft.type].label}
          </h3>
          <div className="flex items-center gap-3">
            <Field label="At age">
              <NumberInput
                value={draft.age}
                onChange={(v) => setDraft((d) => ({ ...d, age: Math.round(v) }))}
                min={profile.age}
                max={100}
                className="w-20"
              />
            </Field>
            <span className="pt-4 text-xs text-slate-400">year {2026 + (draft.age - profile.age)}</span>
          </div>
        </div>

        {isNew && (
          <div className="mb-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {EVENT_TYPES.map((t) => {
              const dis = typeDisabledReason(t.type, entities);
              return (
                <button
                  key={t.type}
                  type="button"
                  disabled={!!dis}
                  title={dis ?? t.label}
                  onClick={() => setDraft((d) => ({ id: d.id, age: d.age, type: t.type, ...defaultsForType(t.type, profile, entities) }))}
                  className={`rounded-lg border px-2 py-1.5 text-left text-xs transition ${
                    draft.type === t.type
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : dis
                        ? 'cursor-not-allowed border-slate-100 text-slate-300'
                        : 'border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/50'
                  }`}
                >
                  {t.icon} {t.label}
                </button>
              );
            })}
          </div>
        )}

        {reason ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Not available at age {draft.age}: {reason}.</p>
        ) : (
          <EventFields ev={draft} setEv={setDraft} entities={entities} savingRateReadout={savingRateReadout} />
        )}

        <div className="mt-5 flex justify-between">
          {!isNew ? (
            <Button variant="danger" onClick={onDelete}>Remove event</Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button onClick={onSave} disabled={!!reason}>{isNew ? 'Add event' : 'Save'}</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function EventTimeline({ events, setEvents, sim, profile, constants, controls }) {
  const [editing, setEditing] = useState(null); // {draft, isNew}
  const sorted = useMemo(() => [...events].sort((a, b) => a.age - b.age), [events]);
  // Events at the same age share an x position and would stack invisibly, so we
  // group them: a single-event year renders one bubble; a multi-event year shows
  // a counted bubble that expands vertically on hover (§5.3).
  const groups = useMemo(() => {
    const byAge = new Map();
    for (const ev of sorted) {
      if (!byAge.has(ev.age)) byAge.set(ev.age, []);
      byAge.get(ev.age).push(ev);
    }
    return [...byAge.entries()].map(([age, evs]) => ({ age, evs }));
  }, [sorted]);
  const span = Math.max(1, 100 - profile.age);

  const openNew = () => {
    const age = Math.min(100, profile.age + 5);
    const entities = entitiesEnteringAge(sim, profile, age);
    setEditing({
      isNew: true,
      draft: { id: `ev-${Date.now().toString(36)}`, type: 'promotion', age, ...defaultsForType('promotion', profile, entities) },
    });
  };

  const save = () => {
    const { draft, isNew } = editing;
    setEvents((evs) => (isNew ? [...evs, draft] : evs.map((e) => (e.id === draft.id ? draft : e))));
    setEditing(null);
  };

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionTitle hint="add and remove to weigh life choices — the line re-draws">Life events</SectionTitle>
        <Button onClick={openNew}>+ Add event</Button>
      </div>

      {/* The timeline track */}
      <div className="relative mt-6 h-24">
        <div className="absolute left-0 right-0 top-9 h-0.5 rounded bg-gradient-to-r from-indigo-200 via-violet-200 to-emerald-200" />
        {/* Age ruler */}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const age = Math.round(profile.age + (span * i) / 5);
          return (
            <div key={i} className="absolute top-12 -translate-x-1/2 text-[10px] text-slate-400" style={{ left: `${(i / 5) * 100}%` }}>
              {age}
            </div>
          );
        })}
        <AnimatePresence>
          {groups.map(({ age, evs }) => {
            const x = ((age - profile.age) / span) * 100;
            const left = `${Math.min(99, Math.max(1, x))}%`;
            const open = (ev) => setEditing({ isNew: false, draft: { ...ev } });
            return (
              <motion.div
                key={age}
                initial={{ opacity: 0, scale: 0.5, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="group absolute top-3 z-10 -translate-x-1/2 hover:z-30"
                style={{ left }}
              >
                {evs.length === 1 ? (
                  <button
                    type="button"
                    onClick={() => open(evs[0])}
                    className="block"
                    title={`${typeMeta[evs[0].type].label} at ${age}`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-indigo-100 to-violet-100 text-base shadow-sm transition group-hover:scale-110 group-hover:shadow-md">
                      {typeMeta[evs[0].type].icon}
                    </span>
                    <span className="mt-0.5 block text-center text-[10px] font-semibold text-slate-500">{age}</span>
                  </button>
                ) : (
                  <>
                    {/* Collapsed: one bubble with a count badge; fades out on hover. */}
                    <div className="block transition-opacity group-hover:pointer-events-none group-hover:opacity-0" title={`${evs.length} events at ${age} — hover to expand`}>
                      <span className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-indigo-100 to-violet-100 text-base shadow-sm transition group-hover:scale-110">
                        {typeMeta[evs[0].type].icon}
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[9px] font-bold text-white shadow">
                          {evs.length}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-center text-[10px] font-semibold text-slate-500">{age}</span>
                    </div>
                    {/* Expanded: vertical list of every event that year, on hover. */}
                    <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 opacity-0 transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                      <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur">
                        <div className="px-1 text-center text-[10px] font-semibold text-slate-400">Age {age}</div>
                        {evs.map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => open(ev)}
                            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-1.5 py-1 text-left text-xs text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-sm">
                              {typeMeta[ev.type].icon}
                            </span>
                            {typeMeta[ev.type].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {sorted.length === 0 && (
          <p className="absolute inset-x-0 top-1 text-center text-xs text-slate-400">
            Nothing planned yet — add a job change, a house, a child, a move…
          </p>
        )}
      </div>

      {/* Chips list for quick edit/remove */}
      {sorted.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sorted.map((ev) => (
            <span key={ev.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-xs text-slate-600">
              <button type="button" className="hover:text-indigo-600" onClick={() => setEditing({ isNew: false, draft: { ...ev } })}>
                {typeMeta[ev.type].icon} {typeMeta[ev.type].label} · {ev.age}
              </button>
              <button
                type="button"
                className="flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-rose-100 hover:text-rose-600"
                onClick={() => setEvents((evs) => evs.filter((e) => e.id !== ev.id))}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Soft warnings from the engine (no-op payoffs etc., §4.2) */}
      {sim.warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {sim.warnings.map((w, i) => (
            <p key={i} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
              ⚠ Age {w.age}: {w.message}
            </p>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <EventEditor
            draft={editing.draft}
            setDraft={(updater) =>
              setEditing((e) => ({ ...e, draft: typeof updater === 'function' ? updater(e.draft) : updater }))
            }
            isNew={editing.isNew}
            onSave={save}
            onCancel={() => setEditing(null)}
            onDelete={() => {
              setEvents((evs) => evs.filter((e) => e.id !== editing.draft.id));
              setEditing(null);
            }}
            sim={{ ...sim, events }}
            profile={profile}
            constants={constants}
            controls={controls}
          />
        )}
      </AnimatePresence>
    </Card>
  );
}
