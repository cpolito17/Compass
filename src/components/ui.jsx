// Small shared form/layout primitives.

import { useEffect, useState } from 'react';

export function Card({ className = '', children }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

export function Field({ label, children, className = '' }) {
  // Top-aligned: the input sits directly under its label, so a tall non-Field
  // sibling in the same grid row (e.g. the effective-tax card) doesn't open a
  // gap. Where labels themselves wrap and inputs must line up (the constants
  // grid), the parent reserves a uniform label height via a Tailwind variant.
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium leading-5 text-slate-500">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';

/** Numeric input that tolerates partial typing; commits parsed numbers. */
export function NumberInput({ value, onChange, prefix, suffix, step, min, max, className = '', placeholder }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value == null ? '' : String(value));
  }, [value, focused]);
  const commit = (raw) => {
    const n = parseFloat(String(raw).replace(/[$,%\s,]/g, ''));
    if (!Number.isNaN(n)) {
      let v = n;
      if (min != null) v = Math.max(min, v);
      if (max != null) v = Math.min(max, v);
      onChange(v);
    }
  };
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        className={`${inputCls} ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''} ${className}`}
        value={text}
        step={step}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
    </div>
  );
}

/** Percent input: displays "7" for 0.07. */
export function PercentInput({ value, onChange, min = 0, max = 100, step = 0.1 }) {
  return (
    <NumberInput
      value={value == null ? null : Math.round(value * 10000) / 100}
      onChange={(v) => onChange(v / 100)}
      suffix="%"
      min={min}
      max={max}
      step={step}
    />
  );
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select className={`${inputCls} ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Button({ children, onClick, variant = 'primary', className = '', type = 'button', disabled }) {
  const styles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm',
    soft: 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    ghost: 'text-slate-500 hover:bg-slate-100',
    danger: 'text-rose-600 hover:bg-rose-50',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Toggle({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition ${
            value === o.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
      />
      {label}
    </label>
  );
}
