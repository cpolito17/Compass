// Baseline input section (§5.1): a dense but tidy form writing into the shared
// profile. Tax is derived automatically from city + filing status (§5.1).

import { Card, SectionTitle, Field, NumberInput, PercentInput, Select, Button, Toggle, Checkbox } from '../../components/ui.jsx';
import CityAutocomplete from '../../components/CityAutocomplete.jsx';
import AnimatedNumber from '../../components/AnimatedNumber.jsx';
import ConstantsPanel from './ConstantsPanel.jsx';
import { effectiveTax } from '../../engine/tax.js';
import { appData } from '../../lib/data.js';
import { fmtPct, fmtUSD } from '../../lib/format.js';

let idCounter = 1;
const newId = (p) => `${p}${Date.now().toString(36)}${idCounter++}`;

export default function BaselineForm({ profile, setProfile, constants, setConstants }) {
  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));
  const setK = (patch) => setProfile((p) => ({ ...p, k401: { ...p.k401, ...patch } }));

  const pretax = Math.min(
    profile.k401.employeeContribPct * profile.income,
    appData.retirement.k401.employeeLimit
  );
  const tax = effectiveTax(profile.income, profile.filingStatus, profile.homeCity, appData, pretax);

  const mortgage = profile.home?.owned
    ? profile.debts.find((d) => d.id === profile.home.mortgageDebtId)
    : null;

  const setDebt = (id, patch) =>
    set({ debts: profile.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const removeDebt = (id) => {
    const patch = { debts: profile.debts.filter((d) => d.id !== id) };
    if (profile.home?.mortgageDebtId === id) patch.home = { ...profile.home, mortgageDebtId: null };
    set(patch);
  };
  const setAsset = (id, patch) =>
    set({ assets: profile.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const toggleHome = (owned) => {
    if (owned === !!profile.home?.owned) return;
    if (owned) {
      const mId = newId('m');
      set({
        home: { owned: true, value: 450000, mortgageDebtId: mId },
        debts: [...profile.debts, { id: mId, name: 'Mortgage', balance: 300000, apr: 0.065, termYears: 30 }],
      });
    } else {
      set({
        home: null,
        debts: profile.debts.filter((d) => d.id !== profile.home?.mortgageDebtId),
      });
    }
  };

  return (
    <Card>
      <SectionTitle hint="shared by all three tabs">Your baseline</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Field label="Age">
          <NumberInput value={profile.age} onChange={(v) => set({ age: Math.round(v) })} min={18} max={80} />
        </Field>
        <Field label="Filing status">
          <Select
            value={profile.filingStatus}
            onChange={(v) => set({ filingStatus: v })}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'mfj', label: 'Married filing jointly' },
              { value: 'hoh', label: 'Head of household' },
            ]}
          />
        </Field>
        <Field label="Home city" className="col-span-2">
          <CityAutocomplete value={profile.homeCity} onSelect={(key) => set({ homeCity: key })} />
        </Field>
        <Field label="Annual income (gross)">
          <NumberInput value={profile.income} onChange={(v) => set({ income: v })} prefix="$" min={0} />
        </Field>
        <div className="rounded-lg bg-indigo-50/70 px-3 py-1.5">
          <div className="text-xs font-medium text-indigo-500">Effective tax (auto)</div>
          <div className="text-lg font-semibold text-indigo-700">
            <AnimatedNumber value={tax.effectiveRate} format={(v) => fmtPct(v)} />
          </div>
          <div className="text-[11px] leading-tight text-indigo-400">
            fed {fmtPct(tax.federal / Math.max(1, profile.income), 1)} · FICA{' '}
            {fmtPct(tax.fica / Math.max(1, profile.income), 1)} · state{' '}
            {fmtPct(tax.state / Math.max(1, profile.income), 1)}
            {tax.local > 0 && <> · local {fmtPct(tax.local / Math.max(1, profile.income), 1)}</>}
          </div>
        </div>

        <Field label="Cash / savings">
          <NumberInput value={profile.cash} onChange={(v) => set({ cash: v })} prefix="$" min={0} />
        </Field>
        <Field label="Taxable investments">
          <NumberInput value={profile.investments} onChange={(v) => set({ investments: v })} prefix="$" min={0} />
        </Field>
        <Field label="401k balance">
          <NumberInput value={profile.k401.balance} onChange={(v) => setK({ balance: v })} prefix="$" min={0} />
        </Field>
        <Field label="401k contribution">
          {profile.savingMode === 'auto' ? (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-400">
              set automatically
            </div>
          ) : (
            <PercentInput value={profile.k401.employeeContribPct} onChange={(v) => setK({ employeeContribPct: v })} max={100} />
          )}
        </Field>
        <Field label="Employer match rate">
          <PercentInput value={profile.k401.employerMatchRate} onChange={(v) => setK({ employerMatchRate: v })} max={200} />
        </Field>
        <Field label="Match cap (% of salary)">
          <PercentInput value={profile.k401.employerMatchCapPct} onChange={(v) => setK({ employerMatchCapPct: v })} max={25} />
        </Field>
      </div>

      {/* Saving strategy (§6b): manual fixed-% vs. the financial order of operations. */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saving plan</div>
            <p className="mt-0.5 whitespace-normal text-[11px] text-slate-400 sm:whitespace-nowrap">
              {profile.savingMode === 'auto'
                ? 'Each year’s surplus flows in order: employer match → high-APR debt → HSA → Roth IRA → max 401k → brokerage.'
                : 'A fixed 401k contribution; whatever is left over each year goes to a taxable brokerage.'}
            </p>
          </div>
          <Toggle
            options={[
              { value: 'auto', label: 'Auto-allocate' },
              { value: 'manual', label: 'Manual' },
            ]}
            value={profile.savingMode || 'auto'}
            onChange={(v) => set({ savingMode: v })}
          />
        </div>
        {profile.savingMode === 'auto' && (
          <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-2">
            <Checkbox checked={!!profile.hsaEligible} onChange={(v) => set({ hsaEligible: v })} label="HSA-eligible (on an HDHP)" />
            {profile.hsaEligible && (
              <Toggle
                options={[
                  { value: 'self', label: 'Self-only' },
                  { value: 'family', label: 'Family' },
                ]}
                value={profile.hsaFamily ? 'family' : 'self'}
                onChange={(v) => set({ hsaFamily: v === 'family' })}
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* Home */}
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home</span>
            <Toggle
              options={[
                { value: 'rent', label: 'Renting' },
                { value: 'own', label: 'Own' },
              ]}
              value={profile.home?.owned ? 'own' : 'rent'}
              onChange={(v) => toggleHome(v === 'own')}
            />
          </div>
          {profile.home?.owned ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Home value">
                <NumberInput
                  value={profile.home.value}
                  onChange={(v) => set({ home: { ...profile.home, value: v } })}
                  prefix="$"
                  min={0}
                />
              </Field>
              {mortgage ? (
                <>
                  <Field label="Mortgage balance">
                    <NumberInput value={mortgage.balance} onChange={(v) => setDebt(mortgage.id, { balance: v })} prefix="$" min={0} />
                  </Field>
                  <Field label="Mortgage rate">
                    <PercentInput value={mortgage.apr} onChange={(v) => setDebt(mortgage.id, { apr: v })} max={20} />
                  </Field>
                  <Field label="Years left">
                    <NumberInput value={mortgage.termYears} onChange={(v) => setDebt(mortgage.id, { termYears: v })} min={1} max={40} />
                  </Field>
                </>
              ) : (
                <p className="col-span-2 self-end pb-1 text-xs text-slate-400">Owned outright (no mortgage).</p>
              )}
              <p className="col-span-2 text-[11px] text-slate-400">
                Property tax is added automatically from your city ({fmtPct(appData.col.cities[profile.homeCity]?.propertyTaxRate ?? 0.011, 2)}
                /yr of value).
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Renting — shelter cost lives inside your baseline spending. Use the “House purchase” life event to buy later.
            </p>
          )}
        </div>

        {/* Debts */}
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Debts</span>
            <Button
              variant="soft"
              onClick={() =>
                set({ debts: [...profile.debts, { id: newId('d'), name: 'Student loan', balance: 15000, apr: 0.055, termYears: 8 }] })
              }
            >
              + Add
            </Button>
          </div>
          {profile.debts.filter((d) => d.id !== profile.home?.mortgageDebtId).length === 0 && (
            <p className="text-xs text-slate-400">No debts. Lucky you.</p>
          )}
          <div className="space-y-2">
            {profile.debts
              .filter((d) => d.id !== profile.home?.mortgageDebtId)
              .map((d) => (
                <div key={d.id} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg bg-slate-50 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Name" className="col-span-2">
                      <NameInput value={d.name} onChange={(v) => setDebt(d.id, { name: v })} />
                    </Field>
                    <Field label="Balance">
                      <NumberInput value={d.balance} onChange={(v) => setDebt(d.id, { balance: v })} prefix="$" min={0} />
                    </Field>
                    <Field label="APR">
                      <PercentInput value={d.apr} onChange={(v) => setDebt(d.id, { apr: v })} max={40} />
                    </Field>
                    <Field label="Term (years)">
                      <NumberInput value={d.termYears} onChange={(v) => setDebt(d.id, { termYears: v })} min={1} max={40} />
                    </Field>
                  </div>
                  <Button variant="danger" onClick={() => removeDebt(d.id)}>
                    ✕
                  </Button>
                </div>
              ))}
          </div>
        </div>

        {/* Named assets */}
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other assets</span>
            <Button
              variant="soft"
              onClick={() => set({ assets: [...profile.assets, { id: newId('a'), name: 'Vehicle', value: 20000, appreciation: -0.1 }] })}
            >
              + Add
            </Button>
          </div>
          {profile.assets.length === 0 && <p className="text-xs text-slate-400">Cars, collections, business stakes…</p>}
          <div className="space-y-2">
            {profile.assets.map((a) => (
              <div key={a.id} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-lg bg-slate-50 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Name" className="col-span-2">
                    <NameInput value={a.name} onChange={(v) => setAsset(a.id, { name: v })} />
                  </Field>
                  <Field label="Value">
                    <NumberInput value={a.value} onChange={(v) => setAsset(a.id, { value: v })} prefix="$" min={0} />
                  </Field>
                  <Field label="Appreciation / yr">
                    <PercentInput value={a.appreciation} onChange={(v) => setAsset(a.id, { appreciation: v })} min={-50} max={50} />
                  </Field>
                </div>
                <Button variant="danger" onClick={() => set({ assets: profile.assets.filter((x) => x.id !== a.id) })}>
                  ✕
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Field label="Baseline annual spending (excl. debt payments & property tax)" className="max-w-xs flex-1">
          <NumberInput value={profile.baselineSpending} onChange={(v) => set({ baselineSpending: v })} prefix="$" min={0} />
        </Field>
        <p className="max-w-sm text-right text-[11px] text-slate-400">
          Tip: build this number on the <span className="font-medium">Budget</span> tab and send it here with one tap.
          Take-home after tax today: <span className="font-medium text-slate-500">{fmtUSD(profile.income - tax.total)}</span>
        </p>
      </div>

      <ConstantsPanel constants={constants} setConstants={setConstants} />
    </Card>
  );
}

function NameInput({ value, onChange }) {
  return (
    <input
      type="text"
      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
