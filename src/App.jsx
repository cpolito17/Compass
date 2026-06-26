import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { appData, DATA_VINTAGE } from './lib/data.js';
import { simulate } from './engine/simulate.js';
import { useProfile, useConstants, useEvents, useControls, useBudget, useCompare, usePersistedState } from './state/useStore.js';
import TrajectoryTab from './tabs/TrajectoryTab.jsx';
import BudgetTab from './tabs/BudgetTab.jsx';
import CompareTab from './tabs/CompareTab.jsx';
import WelcomeModal from './components/WelcomeModal.jsx';

const TABS = ['Trajectory', 'Budget', 'Compare'];

export default function App() {
  const [tab, setTab] = useState('Trajectory');
  const [profile, setProfile] = useProfile();
  const [constants, setConstants] = useConstants();
  const [events, setEvents] = useEvents();
  const [controls, setControls] = useControls();
  const [budget, setBudget] = useBudget();
  const [compare, setCompare] = useCompare();
  // First-visit welcome: defaults to unseen, then sticks once dismissed.
  const [seenWelcome, setSeenWelcome] = usePersistedState('pf.seenWelcome', false);

  // One engine, one calculation path (§2): the simulation is computed once here
  // and consumed by Trajectory; Compare reuses the tax engine per city.
  const sim = useMemo(
    () => simulate(profile, constants, events, controls, appData),
    [profile, constants, events, controls]
  );

  const shared = { profile, setProfile, constants, setConstants, events, setEvents, controls, setControls, sim, budget, setBudget, compare, setCompare };

  return (
    <div className="flex min-h-screen flex-col">
      <WelcomeModal open={!seenWelcome} onClose={() => setSeenWelcome(true)} />
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" aria-hidden="true">
                <circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
                <path d="M16 5 L19 16 L16 16 Z" fill="currentColor" />
                <path d="M16 5 L13 16 L16 16 Z" fill="currentColor" fillOpacity="0.7" />
                <path d="M16 27 L19 16 L16 16 Z" fill="currentColor" fillOpacity="0.7" />
                <path d="M16 27 L13 16 L16 16 Z" fill="currentColor" fillOpacity="0.45" />
                <circle cx="16" cy="16" r="1.7" fill="currentColor" />
              </svg>
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
          <div className="whitespace-nowrap text-right text-xs text-slate-400 max-sm:hidden">no accounts · no ads</div>
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
