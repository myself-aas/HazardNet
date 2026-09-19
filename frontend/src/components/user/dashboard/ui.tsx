import React from 'react';
import { motion } from 'framer-motion';

/**
 * Shared primitives for the user dashboard — clean, modern, accessible form
 * controls and section cards. All inputs are uncontrolled-friendly controlled
 * components wired by the section editors.
 */

export const inputClass =
  'w-full px-3.5 py-2.5 text-sm bg-white border border-carbon-20 rounded-xl text-carbon-90 placeholder-carbon-40 font-medium transition-all focus:outline-none focus:border-nasa-blue focus:ring-2 focus:ring-nasa-blue/30 disabled:bg-carbon-05 disabled:text-carbon-60';

export const Card: React.FC<{
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon, actions, children, className = '' }) => (
  <section className={`rounded-3xl border border-carbon-20/90 bg-white shadow-xs ${className}`}>
    {(title || actions) && (
      <header className="flex items-start justify-between gap-3 border-b border-carbon-10 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              {icon}
            </span>
          )}
          <div>
            <h3 className="text-sm font-extrabold tracking-tight text-carbon-90">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-carbon-60">{subtitle}</p>}
          </div>
        </div>
        {actions}
      </header>
    )}
    <div className="px-5 py-4 sm:px-6 sm:py-5">{children}</div>
  </section>
);

export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, hint, error, children, className = '' }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-carbon-60">
      {label}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-[11px] leading-relaxed text-carbon-60">{hint}</p>}
    {error && <p className="mt-1 text-[11px] font-semibold text-rose-700">{error}</p>}
  </div>
);

export const TextField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  autoComplete?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}> = ({ id, label, value, onChange, placeholder, type = 'text', hint, autoComplete, disabled, maxLength, className = '' }) => (
  <Field label={label} htmlFor={id} hint={hint} className={className}>
    <input
      id={id}
      type={type}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      disabled={disabled}
      maxLength={maxLength}
      className={inputClass}
    />
  </Field>
);

export const TextAreaField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  maxLength?: number;
}> = ({ id, label, value, onChange, placeholder, rows = 3, hint, maxLength }) => (
  <Field label={label} htmlFor={id} hint={hint}>
    <textarea
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className={`${inputClass} resize-y`}
    />
  </Field>
);

export const SelectField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  placeholder?: string;
}> = ({ id, label, value, onChange, options, hint, placeholder }) => (
  <Field label={label} htmlFor={id} hint={hint}>
    <select
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} cursor-pointer ${value ? '' : 'text-carbon-60'}`}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </Field>
);

export const NumberField: React.FC<{
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  suffix?: string;
}> = ({ id, label, value, onChange, min, max, step, hint, suffix }) => (
  <Field label={label} htmlFor={id} hint={hint}>
    <div className="relative">
      <input
        id={id}
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step ?? 'any'}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') return onChange(undefined);
          const parsed = Number(raw);
          if (!Number.isNaN(parsed)) onChange(parsed);
        }}
        className={`${inputClass} ${suffix ? 'pr-14' : ''}`}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-carbon-60">{suffix}</span>
      )}
    </div>
  </Field>
);

export const DateField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}> = ({ id, label, value, onChange, hint }) => (
  <Field label={label} htmlFor={id} hint={hint}>
    <input
      id={id}
      type="date"
      value={value ?? ''}
      max={new Date().toISOString().slice(0, 10)}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
    />
  </Field>
);

export const ToggleField: React.FC<{
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, label, description, checked, onChange }) => (
  <div className="flex items-center justify-between gap-4 py-2.5">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-bold text-carbon-80">
        {label}
      </label>
      {description && <p className="mt-0.5 text-[11px] leading-relaxed text-carbon-60">{description}</p>}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nasa-blue/60 ${
        checked ? 'bg-emerald-500' : 'bg-carbon-30'
      }`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${checked ? 'right-0.5' : 'left-0.5'}`}
      />
    </button>
  </div>
);

/** Sticky bar shown when an editor has unsaved changes. */
export const SaveBar: React.FC<{
  dirty: boolean;
  saving: boolean;
  message?: string | null;
  onSave: () => void;
  onReset: () => void;
  label?: string;
}> = ({ dirty, saving, message, onSave, onReset, label = 'Save changes' }) => (
  <div className="sticky bottom-4 z-20 mt-5" aria-live="polite">
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-md backdrop-blur transition-all ${
        message
          ? 'border-emerald-200 bg-emerald-50/95'
          : dirty
            ? 'border-amber-200 bg-amber-50/95'
            : 'border-carbon-20 bg-white/95'
      }`}
    >
      <p className={`text-xs font-bold ${message ? 'text-emerald-800' : dirty ? 'text-amber-800' : 'text-carbon-60'}`}>
        {message ?? (dirty ? 'You have unsaved changes.' : 'All changes saved.')}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty || saving}
          className="rounded-xl px-3 py-2 text-xs font-bold text-carbon-60 transition-colors hover:bg-carbon-10 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="flex items-center gap-2 rounded-xl bg-carbon-90 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-carbon-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {saving ? 'Saving…' : label}
        </button>
      </div>
    </div>
  </div>
);
