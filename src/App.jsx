import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { appData, DATA_VINTAGE } from './lib/data.js';
import { simulate } from './engine/simulate.js';
import { useProfile, useConstants, useEvents, useControls, useBudget, useCompare } from './state/useStore.js';
import TrajectoryTab from './tabs/TrajectoryTab.jsx';
import BudgetTab from './tabs/BudgetTab.jsx';
import CompareTab from './tabs/CompareTab.jsx';

const TABS = ['Trajectory', 'Budget', 'Compare'];

export default function App() {
  const [tab, setTab] = useState('Trajectory');
  const [profile, setProfile] = useProfile();
  const [constants, setConstants] = useConstants();
  const [events, setEvents] = useEvents();
  const [controls, setControls] = useControls();
  const [budget, setBudget] = useBudget();
  const [compare, setCompare] = useCompare();

  // One engine, one calculation path (§2): the simulation is computed once here
  // and consumed by Trajectory; Compare reuses the tax engine per city.
  const sim = useMemo(
    () => simulate(profile, constants, events, controls, appData),
    [profile, constants, events, controls]
  );

  const shared = { profile, setProfile, constants, setConstants, events, setEvents, controls, setControls, sim, budget, setBudget, compare, setCompare };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
              C
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-800">Compass</span>
          </div>
          <nav className="relative flex gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === t && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">{t}</span>
              </button>
            ))}
          </nav>
          <div className="w-24 text-right text-xs text-slate-400 max-sm:hidden">no accounts · no ads</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {tab === 'Trajectory' && <TrajectoryTab {...shared} />}
            {tab === 'Budget' && <BudgetTab {...shared} />}
            {tab === 'Compare' && <CompareTab {...shared} />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-400">
          <span>
            Tax &amp; cost-of-living data: {DATA_VINTAGE} · IRS Rev. Proc. 2025-32 · Tax Foundation · BEA RPP · BLS CE 2024 · SSA
          </span>
          <span>All data stays in your browser. Projections are estimates, not advice.</span>
        </div>
      </footer>
    </div>
  );
}
