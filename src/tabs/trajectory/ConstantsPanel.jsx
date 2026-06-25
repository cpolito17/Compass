// Collapsible Constants Panel (§6). Engine is nominal, so every rate here is
// nominal — labeled explicitly so users don't enter real rates by mistake.

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Field, PercentInput, NumberInput, Button } from '../../components/ui.jsx';
import { appData } from '../../lib/data.js';

export default function ConstantsPanel({ constants, setConstants }) {
  const [open, setOpen] = useState(false);
  const set = (key) => (v) => setConstants((c) => ({ ...c, [key]: v }));

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800"
      >
        <span>Assumptions (constants)</span>
        <motion.span animate={{ rotate: open ? 90 : 0 }} className="text-slate-400">
          ›
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Market return (nominal)">
                <PercentInput value={constants.marketReturn} onChange={set('marketReturn')} />
              </Field>
              <Field label="Inflation">
                <PercentInput value={constants.inflation} onChange={set('inflation')} />
              </Field>
              <Field label="Salary growth (nominal)">
                <PercentInput value={constants.salaryGrowth} onChange={set('salaryGrowth')} />
              </Field>
              <Field label="Home appreciation (nominal)">
                <PercentInput value={constants.homeAppreciation} onChange={set('homeAppreciation')} />
              </Field>
              <Field label="Capital gains rate">
                <PercentInput value={constants.capitalGainsRate} onChange={set('capitalGainsRate')} />
              </Field>
              <Field label="Soc. Sec. claiming age">
                <NumberInput value={constants.ssClaimAge} onChange={set('ssClaimAge')} min={62} max={70} />
              </Field>
            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <p className="text-xs text-slate-400">
                All rates are <span className="font-medium">nominal</span> (inflation included). A constant can also change
                mid-timeline via a “Constant Change” life event.
              </p>
              <Button variant="ghost" onClick={() => setConstants({ ...appData.constantsDefaults.constants })}>
                Reset defaults
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
