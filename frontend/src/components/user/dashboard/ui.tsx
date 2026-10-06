/**
 * The user-area kit: one set of primitives for `/dashboard` and `/profile`.
 *
 * **Why this file exists in this shape.** The two signed-in surfaces were written twice: this kit
 * rendered `/dashboard`, and `pages/UserProfilePage.tsx` hand-rolled the same fields again with its
 * own cards, its own toggle, its own heading levels and the severity palette spent on chrome
 * (docs/audits/2026-10-06-profile-page-design-audit.md, F-1 to F-4). The 2026-10-06 pass below
 * unifies them, and the fix is structural rather than cosmetic: there is now exactly one
 * implementation of every control in the user area, and both pages import it.
 *
 * **The depth rule, which is what "too many nested cardviews" actually was.** A settings page has
 * two levels and no more:
 *
 *   1. `Panel` — the grouping surface. One per section, and it is the system's own card
 *      (`.ap-card`: hairline, 18px radius, no shadow) rather than a second square white box.
 *   2. everything inside it — labelled fields, toggle rows, connector rows, selectable options.
 *      These draw NO border and NO radius of their own. They are separated by hairlines
 *      (`divide-y divide-carbon-10`) instead of by boxes.
 *
 * The only third thing is soft grouping, and it has no border (`bg-carbon-05 p-4`) so it cannot
 * read as a card: the unsaved-changes summary, a connector's config field, the completeness
 * breakdown, the public-profile facts. A bordered element inside a bordered element is the shape
 * this file is designed not to produce.
 *
 * **Grammar, from DESIGN.md §Components.** Pills (`rounded.pill`) for actions and inputs — the
 * buttons are the system's `.ap-btn` roles and the fields are `.ap-input`; the two radius steps in
 * between are `rounded.sm` for compact utility cells and `rounded.lg` for cards, and this file uses
 * `rounded-md` (which the theme maps to `{rounded.sm}`, 8px) for the one non-pill control, the
 * selectable option. Severity is a data encoding: it is never a switch thumb, a badge or a hover.
 */

import React, { useId } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../apple/primitives';

/* ────────────────────────────────────────────────────────────────────────────
   Surfaces
   ──────────────────────────────────────────────────────────────────────────── */

export interface PanelProps {
  /** Rendered as the panel's `<h2>`. Omit only for a panel with its own heading. */
  title?: string;
  description?: React.ReactNode;
  /** Right side of the header row: a count, a link, one secondary action. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * One section of a user-area page. This is the ONLY bordered container in the user area; the rule
 * at the top of this file is that nothing inside it draws another one.
 */
export const Panel: React.FC<PanelProps> = ({ title, description, actions, children, className = '' }) => {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={`ap-card ${className}`}
    >
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {title && (
              <h2 id={titleId} className="text-lg font-bold tracking-tight text-carbon-90">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1.5 max-w-prose text-sm leading-[1.62] text-carbon-70">{description}</p>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
};

/** The field grid: two columns from `sm`, one below it, one rhythm everywhere. */
export const FieldGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => <div className={`grid gap-5 sm:grid-cols-2 ${className}`}>{children}</div>;

/**
 * A completeness bar. The fill is Action Blue: the old one filled with `bg-severity-low`, so a
 * half-filled profile bar and a low-hazard reading were the same green, and green is the data
 * layer, not chrome.
 */
export const ProgressMeter: React.FC<{ value: number; label: string; id?: string }> = ({ value, label, id }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      id={id}
      className="h-1.5 w-full overflow-hidden rounded-full bg-carbon-10"
    >
      <div className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   Fields

   Every primitive here wires `id` + `htmlFor` itself, which is the fix for the audit's F-1: the
   profile page's hand-rolled inputs had visible labels with no `for` and controls with no `id`, so
   a screen reader announced all of them as "edit text, blank".

   The control class is the system's own input role. `.ap-input` is the pill search/text field from
   DESIGN.md (hairline, 44px, pill radius, published focus ring), and it is defined in apple.css, so
   it is applied BY NAME rather than re-implemented with utilities — tailwind utilities cannot
   override it, which is exactly why a local copy would drift.
   ──────────────────────────────────────────────────────────────────────────── */

export const inputClass = 'ap-input';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, htmlFor, hint, error, children, className = '' }) => (
  <div className={`min-w-0 ${className}`}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-carbon-80">
      {label}
    </label>
    {children}
    {hint && !error && <p className="mt-1.5 text-xs leading-[1.62] text-carbon-60">{hint}</p>}
    {error && (
      <p className="mt-1.5 text-xs font-semibold leading-[1.62] text-ap-link" role="alert">
        {error}
      </p>
    )}
  </div>
);

export interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: React.ReactNode;
  autoComplete?: string;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}

export const TextField: React.FC<TextFieldProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
  autoComplete,
  disabled,
  maxLength,
  className = '',
}) => (
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
  hint?: React.ReactNode;
  maxLength?: number;
  className?: string;
}> = ({ id, label, value, onChange, placeholder, rows = 3, hint, maxLength, className = '' }) => (
  <Field label={label} htmlFor={id} hint={hint} className={className}>
    <textarea
      id={id}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      /* A textarea is the one control that cannot be a pill. It takes the card's background and
         hairline at the compact-utility radius rather than inventing a third grammar. */
      className="w-full resize-y rounded-md border border-carbon-20 bg-white p-4 text-base leading-[1.62] text-carbon-90 placeholder-carbon-40 focus:border-ap-primary focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-primary"
    />
  </Field>
);

export const SelectField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: React.ReactNode;
  placeholder?: string;
  className?: string;
}> = ({ id, label, value, onChange, options, hint, placeholder, className = '' }) => (
  <Field label={label} htmlFor={id} hint={hint} className={className}>
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
  hint?: React.ReactNode;
  /** Unit of the number, e.g. "hectares" — the label carries it; the field has no inline suffix
   *  because the pill's padding is the system's and cannot be nudged per-instance. */
  unit?: string;
  className?: string;
}> = ({ id, label, value, onChange, min, max, step, hint, unit, className = '' }) => (
  <Field
    label={unit ? `${label} (${unit})` : label}
    htmlFor={id}
    hint={hint}
    className={className}
  >
    <input
      id={id}
      type="number"
      inputMode="decimal"
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
      className={inputClass}
    />
  </Field>
);

export const DateField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: React.ReactNode;
  className?: string;
}> = ({ id, label, value, onChange, hint, className = '' }) => (
  <Field label={label} htmlFor={id} hint={hint} className={className}>
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

/* ────────────────────────────────────────────────────────────────────────────
   Rows
   ──────────────────────────────────────────────────────────────────────────── */

export interface ToggleFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/**
 * One switch row. There used to be two switch designs in the user area (a white thumb on a green
 * track here, an amber thumb on a carbon track on `/profile`); there is one now, and it is this
 * one. The on-state is Action Blue rather than the severity green the old kit used: green is the
 * "low hazard" reading on this product, and a settings switch must not borrow a hazard colour to
 * say "enabled".
 *
 * The switch button is 44px tall so the row meets the touch-target minimum; the visible track
 * inside it stays 28px, which is what the eye expects a switch to be.
 */
export const ToggleField: React.FC<ToggleFieldProps> = ({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}) => {
  const labelId = `${id}-label`;
  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <p id={labelId} className="text-sm font-semibold text-carbon-90">
          {label}
        </p>
        {description && <p className="mt-1 text-xs leading-[1.62] text-carbon-60">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="ap-focusable flex h-11 w-12 shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className={`relative inline-block h-7 w-12 rounded-full transition-colors duration-[var(--ap-duration-base)] ${
            checked ? 'bg-primary' : 'bg-carbon-20'
          }`}
        >
          <span
            className={`pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white transition-transform duration-[var(--ap-duration-base)] ${
              checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    </div>
  );
};

export interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}

/**
 * A selectable option (stakeholder role, profile visibility, notification channel, map appearance).
 * Selection is the system's own chip pattern — a 2px Action Blue border on a white cell — and the
 * mark is drawn, so it survives greyscale and reaches a screen reader as `aria-checked`.
 */
export const OptionCard: React.FC<OptionCardProps> = ({ label, description, selected, onSelect }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    data-selected={selected ? 'true' : 'false'}
    onClick={onSelect}
    className={`ap-focusable flex min-h-[44px] w-full items-start gap-3 rounded-md border-2 bg-white p-3.5 text-left transition-colors duration-[var(--ap-duration-base)] ${
      selected ? 'border-ap-primary' : 'border-carbon-20 hover:border-carbon-30 hover:bg-carbon-05'
    }`}
  >
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        selected ? 'border-primary bg-primary text-ap-action-fg' : 'border-carbon-30 text-transparent'
      }`}
    >
      <Check className="h-3 w-3" />
    </span>
    <span className="min-w-0">
      <span className={`block text-sm ${selected ? 'font-bold text-carbon-90' : 'font-semibold text-carbon-80'}`}>
        {label}
      </span>
      {description && (
        <span className="mt-0.5 block text-xs leading-[1.62] text-carbon-60">{description}</span>
      )}
    </span>
  </button>
);

export interface OptionGroupProps<V extends string> {
  /** Accessible group name; also rendered as the visible label. */
  label: string;
  hint?: React.ReactNode;
  value: V;
  onChange: (value: V) => void;
  options: Array<{ value: V; label: string; description?: string }>;
  columns?: 1 | 2;
}

/** A `radiogroup` of `OptionCard`s. Two columns from `sm`; one on a phone. */
export function OptionGroup<V extends string>({
  label,
  hint,
  value,
  onChange,
  options,
  columns = 2,
}: OptionGroupProps<V>) {
  const groupId = useId();
  const labelId = `${groupId}-label`;
  return (
    <div role="radiogroup" aria-labelledby={labelId}>
      <p id={labelId} className="text-sm font-semibold text-carbon-80">
        {label}
      </p>
      {hint && <p className="mt-1 text-xs leading-[1.62] text-carbon-60">{hint}</p>}
      <div className={`mt-2.5 grid gap-2.5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
        {options.map((option) => (
          <OptionCard
            key={option.value}
            label={option.label}
            description={option.description}
            selected={option.value === value}
            onSelect={() => onChange(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Save bar
   ──────────────────────────────────────────────────────────────────────────── */

export interface SaveBarProps {
  dirty: boolean;
  saving: boolean;
  message?: string | null;
  onSave: () => void;
  onReset: () => void;
  label?: string;
}

/**
 * The unsaved-changes bar. Sticky, because the edit surface is long and the save action has to stay
 * reachable; `ap-sticky-bar` is the system's own floating-bar role (frosted, hairline top), so the
 * blur sits on chrome rather than on a scrolling content container — the profile page used to put
 * `overflow-y-auto` on its form instead, which is a nested scroll region inside a page that already
 * scrolls.
 */
export const SaveBar: React.FC<SaveBarProps> = ({
  dirty,
  saving,
  message,
  onSave,
  onReset,
  label = 'Save changes',
}) => (
  <div className="sticky bottom-0 z-10 mt-6" aria-live="polite">
    <div className="ap-sticky-bar flex flex-wrap items-center justify-between gap-3">
      <p className={`text-sm font-semibold ${dirty ? 'text-carbon-90' : 'text-carbon-60'}`}>
        {message ?? (dirty ? 'You have unsaved changes.' : 'No unsaved changes.')}
      </p>
      <div className="flex items-center gap-2">
        <Button intent="secondary" size="sm" onClick={onReset} disabled={!dirty || saving}>
          Discard
        </Button>
        <Button intent="primary" size="sm" onClick={onSave} disabled={!dirty || saving}>
          {saving && (
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {saving ? 'Saving…' : label}
        </Button>
      </div>
    </div>
  </div>
);
