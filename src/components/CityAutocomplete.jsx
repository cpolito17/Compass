// Search box with autocomplete over the top-50 cities (cities.json). Used by
// the Trajectory baseline form, the Move event editor, and Compare.

import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { appData } from '../lib/data.js';

export default function CityAutocomplete({ value, onSelect, placeholder = 'Search a city…', exclude = [] }) {
  const selected = value ? appData.cityIndex[value] : null;
  const [query, setQuery] = useState(selected ? selected.name : '');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const blurTimer = useRef(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return appData.cities
      .filter((c) => !exclude.includes(c.key))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, exclude]);

  const pick = (city) => {
    onSelect(city.key);
    setQuery(city.name);
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        value={query}
        placeholder={placeholder}
        onFocus={(e) => {
          clearTimeout(blurTimer.current);
          setOpen(true);
          e.target.select();
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            setQuery(selected ? selected.name : '');
          }, 150);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, matches.length - 1));
          else if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0));
          else if (e.key === 'Enter' && matches[hi]) pick(matches[hi]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      <AnimatePresence>
        {open && matches.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {matches.map((c, i) => (
              <li key={c.key}>
                <button
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-sm ${i === hi ? 'bg-indigo-50 text-indigo-800' : 'text-slate-700 hover:bg-slate-50'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(c)}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
