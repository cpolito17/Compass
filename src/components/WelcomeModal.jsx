import { AnimatePresence, motion } from 'framer-motion';
import { Button } from './ui.jsx';

// Shown once on a visitor's first session (gated by pf.seenWelcome in App).
// Briefly frames why Compass exists and what each tab is for.
export default function WelcomeModal({ open, onClose }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="welcome-title"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" aria-hidden="true">
                  <circle cx="16" cy="16" r="10.5" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1.5" />
                  <path d="M16 5 L19 16 L16 16 Z" fill="currentColor" />
                  <path d="M16 5 L13 16 L16 16 Z" fill="currentColor" fillOpacity="0.7" />
                  <path d="M16 27 L19 16 L16 16 Z" fill="currentColor" fillOpacity="0.7" />
                  <path d="M16 27 L13 16 L16 16 Z" fill="currentColor" fillOpacity="0.45" />
                  <circle cx="16" cy="16" r="1.7" fill="currentColor" />
                </svg>
              </div>
              <div>
                <h2 id="welcome-title" className="text-lg font-semibold tracking-tight text-slate-800">
                  Welcome to Compass
                </h2>
                <p className="text-xs text-slate-400">A calmer way to plan your money</p>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5 text-sm leading-relaxed text-slate-600">
              <p>
                Most budgeting apps are bloated, data-hungry, and plastered with ads. They also make
                it hard to plan retirement when you&rsquo;re young, and harder still to know whether
                your spending is normal. Compass fixes all three.
              </p>
              <ul className="space-y-2.5">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <span>
                    <span className="font-medium text-slate-800">No ads, no accounts, no tracking.</span>{' '}
                    Everything stays in your browser.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <span>
                    <span className="font-medium text-slate-800">Trajectory</span> lets you add the
                    big life events ahead — a move, a raise, a kid, a home — and see how each one
                    shifts your retirement age and nest egg.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                  <span>
                    <span className="font-medium text-slate-800">Budget</span> shows real spending
                    distributions, so you can see exactly where you land compared to the average
                    American — category by category.
                  </span>
                </li>
              </ul>
              <p className="text-xs text-slate-400">
                Nothing here is financial advice — just estimates to help you think.
              </p>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
              <Button onClick={onClose}>Get started</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
