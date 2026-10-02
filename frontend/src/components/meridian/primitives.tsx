/**
 * Meridian primitives — the components every HazardNet surface builds from.
 *
 * These are deliberately small and unopinionated about layout: they exist so
 * that the decisions in MERIDIAN.md (44px floor, dual-primary, lift-over-border,
 * severity as colour+shape+label, two geometry tracks) are made ONCE here
 * instead of re-made in 230 files.
 *
 * Nothing is copied from Apple or Meta. SF Pro and Optimistic are proprietary
 * and neither is shipped; the type stacks resolve to faces this repo is already
 * licensed to distribute. What is adopted is method — Apple's role-based
 * semantic colour and named type styles, Meta's display/text split and
 * lift-over-border surfaces — expressed in our own code.
 */

import React, { forwardRef } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
   Types shared by every primitive
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Which intent a button carries. Colour scarcity is the navigational signal,
 * so this prop is a safety contract, not a style preference:
 *
 *   ink          browse / navigate / open the map  ← the default primary
 *   hazard       the alert itself — RESERVED, never navigation
 *   interactive  filters, tabs, links
 *   outline      secondary
 *   quiet        tertiary, or the cancel half of a destructive pair
 */
export type MeridianIntent = 'ink' | 'hazard' | 'interactive' | 'outline' | 'quiet';

export type MeridianSize = 'sm' | 'md' | 'lg';

const INTENT_CLASS: Record<MeridianIntent, string> = {
  ink: 'mrd-btn-ink',
  hazard: 'mrd-btn-hazard',
  interactive: 'mrd-btn-interactive',
  outline: 'mrd-btn-outline',
  quiet: 'mrd-btn-quiet',
};

const SIZE_CLASS: Record<MeridianSize, string> = {
  sm: 'mrd-btn-sm',
  md: '',
  lg: 'mrd-btn-lg',
};

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

/* ────────────────────────────────────────────────────────────────────────────
   Button
   ──────────────────────────────────────────────────────────────────────────── */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: MeridianIntent;
  size?: MeridianSize;
  /** Icon-only buttons stay square and still clear the 44px floor. */
  iconOnly?: boolean;
  /** Required for icon-only buttons: the accessible name a screen reader reads. */
  accessibleName?: string;
}

/**
 * The one button. 44px minimum is not overridable from the call site — it is
 * baked into `.mrd-btn` — because a control smaller than 44px is not a styling
 * choice on a warning service used from a phone in a field.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { intent = 'ink', size = 'md', iconOnly = false, accessibleName, className, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={iconOnly ? accessibleName : rest['aria-label']}
      className={cx('mrd-btn', INTENT_CLASS[intent], SIZE_CLASS[size], iconOnly && 'mrd-btn-icon', className)}
      {...rest}
    >
      {children}
    </button>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   ButtonLink — same geometry, renders a router <a>. Kept separate from Button
   so navigation and actions stay distinguishable in the DOM and to a11y tools.
   ──────────────────────────────────────────────────────────────────────────── */

export interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  intent?: MeridianIntent;
  size?: MeridianSize;
  iconOnly?: boolean;
  accessibleName?: string;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { intent = 'ink', size = 'md', iconOnly = false, accessibleName, className, children, ...rest },
  ref,
) {
  return (
    <a
      ref={ref}
      aria-label={iconOnly ? accessibleName : rest['aria-label']}
      className={cx('mrd-btn', INTENT_CLASS[intent], SIZE_CLASS[size], iconOnly && 'mrd-btn-icon', className)}
      {...rest}
    >
      {children}
    </a>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   Card
   ──────────────────────────────────────────────────────────────────────────── */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lifts on hover/focus-within. Only for cards that go somewhere. */
  interactive?: boolean;
  /** Removes padding and clips children to the radius — for full-bleed media. */
  flush?: boolean;
}

/**
 * A surface. On the editorial track this is white lifted off the canvas by an
 * ink-tinted shadow with no border — Meta's hierarchy-by-lift. Inside
 * `.mrd-track-console` the same component tightens to 8px and a near-flat
 * shadow, because dense data must not look pressable.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, flush = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx('mrd-card', interactive && 'mrd-card-interactive', flush && 'mrd-card-flush', className)}
      {...rest}
    >
      {children}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   Eyebrow / SectionHeading
   ──────────────────────────────────────────────────────────────────────────── */

/** The small uppercase label above a heading. Meta's editorial rhythm. */
export function Eyebrow({ children, className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cx('mrd-eyebrow', className)} {...rest}>
      {children}
    </p>
  );
}

export interface SectionHeadingProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Standfirst: the one paragraph under a heading. Apple's deference — it
   *  explains, it does not decorate. */
  standfirst?: React.ReactNode;
  level?: 1 | 2 | 3;
  id?: string;
  align?: 'start' | 'center';
  className?: string;
}

/**
 * Heading + optional eyebrow + optional standfirst, as one unit, so the
 * vertical rhythm between the three is identical on every page.
 */
export function SectionHeading({
  eyebrow,
  title,
  standfirst,
  level = 2,
  id,
  align = 'start',
  className,
}: SectionHeadingProps) {
  const Tag = (`h${level}` as unknown) as 'h2';
  const titleClass = level === 1 ? 'mrd-display2' : level === 2 ? 'mrd-title1' : 'mrd-title2';
  return (
    <div className={cx('mrd-section-heading', align === 'center' && 'text-center', className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Tag id={id} className={cx(titleClass, 'mt-3', 'text-[color:var(--mrd-label)]')}>
        {title}
      </Tag>
      {standfirst ? (
        <p
          className={cx(
            'mrd-callout mt-4 max-w-2xl text-[color:var(--mrd-label-secondary)]',
            align === 'center' && 'mx-auto',
          )}
        >
          {standfirst}
        </p>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   SeverityBadge — colour + shape + label, never colour alone
   ──────────────────────────────────────────────────────────────────────────── */

export type MeridianSeverity = 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

const SEVERITY_CLASS: Record<MeridianSeverity, string> = {
  low: 'mrd-severity-low',
  moderate: 'mrd-severity-moderate',
  high: 'mrd-severity-high',
  veryHigh: 'mrd-severity-very-high',
  extreme: 'mrd-severity-extreme',
};

const SEVERITY_LABEL: Record<MeridianSeverity, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  veryHigh: 'Very high',
  extreme: 'Extreme',
};

/**
 * Shape cue per level. Redundant with the hue on purpose: WCAG 1.4.1 forbids
 * colour as the only carrier of meaning, and the practical case is a
 * colour-blind reader on a cracked screen in monsoon light.
 */
function SeverityGlyph({ level }: { level: MeridianSeverity }) {
  const bars = { low: 1, moderate: 2, high: 3, veryHigh: 4, extreme: 5 }[level];
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="shrink-0">
      {level === 'extreme' ? (
        /* Extreme breaks the bar pattern entirely — a filled diamond — so it is
           distinguishable by silhouette even in greyscale print. */
        <path d="M6 0.5 11.5 6 6 11.5 0.5 6Z" fill="currentColor" />
      ) : (
        [0, 1, 2, 3].map((i) => (
          <rect
            key={i}
            x={i * 3}
            y={11 - (i + 1) * 2.2}
            width="2"
            height={(i + 1) * 2.2}
            rx="0.5"
            fill="currentColor"
            opacity={i < bars ? 1 : 0.22}
          />
        ))
      )}
    </svg>
  );
}

export interface SeverityBadgeProps {
  level: MeridianSeverity;
  /** Overrides the English label — pass the i18n string when localised. */
  label?: string;
  /** Prefix announced to screen readers before the level. */
  srPrefix?: string;
  className?: string;
}

export function SeverityBadge({ level, label, srPrefix = 'Severity', className }: SeverityBadgeProps) {
  const text = label ?? SEVERITY_LABEL[level];
  return (
    <span className={cx('mrd-badge mrd-severity', SEVERITY_CLASS[level], className)}>
      <SeverityGlyph level={level} />
      <span>
        <span className="sr-only">{srPrefix}: </span>
        {text}
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Figure — a number and its label, with provenance
   ──────────────────────────────────────────────────────────────────────────── */

export interface FigureProps {
  value: React.ReactNode;
  label: React.ReactNode;
  /** Where the number came from. HazardNet's honesty contract: a figure with
   *  no artifact behind it is not a figure, it is a guess. */
  source?: React.ReactNode;
  /** An em dash, not a zero, when the artifact is missing. */
  missing?: boolean;
  className?: string;
}

export function Figure({ value, label, source, missing = false, className }: FigureProps) {
  return (
    <div className={cx('mrd-figure-block bg-[color:var(--mrd-bg-elevated)] p-5', className)}>
      {/* leading-[1.1], not leading-none: a value like "7 & 15 days" wraps on a
          360px screen, and zero leading would collide the wrapped lines. 1.1 is
          still tight enough to read as a metric. */}
      <p className="mrd-figure text-[length:var(--mrd-text-display3)] font-semibold leading-[1.1] text-[color:var(--mrd-label)]">
        {missing ? <span aria-hidden="true">—</span> : value}
        {missing ? <span className="sr-only">not available</span> : null}
      </p>
      <p className="mrd-caption mt-2 text-[color:var(--mrd-label-secondary)]">{label}</p>
      {source ? <p className="mrd-micro mt-1">{source}</p> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   PillTabs — segmented control
   ──────────────────────────────────────────────────────────────────────────── */

export interface PillTab {
  id: string;
  label: React.ReactNode;
  /** Optional count shown beside the label. */
  count?: number;
}

export interface PillTabsProps {
  tabs: PillTab[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. Required — this is a labelled region. */
  ariaLabel: string;
  className?: string;
}

/**
 * A segmented control. Arrow-key navigable and wired as a real tablist, because
 * a row of buttons that behaves like tabs but does not announce like tabs fails
 * every keyboard user.
 */
export function PillTabs({ tabs, value, onChange, ariaLabel, className }: PillTabsProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (activeIndex + step + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    document.getElementById(`mrd-tab-${tabs[next].id}`)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cx(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-[length:var(--mrd-radius-pill)]',
        'bg-[color:var(--mrd-bg-grouped)] p-1',
        className,
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            id={`mrd-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cx(
              'inline-flex min-h-[var(--mrd-tap-min)] shrink-0 items-center gap-2 whitespace-nowrap',
              'rounded-[length:var(--mrd-radius-pill)] px-4 text-[length:var(--mrd-text-footnote)] font-semibold',
              'touch-manipulation transition-colors duration-[var(--mrd-duration-fast)]',
              selected
                ? 'bg-[color:var(--mrd-bg-elevated)] text-[color:var(--mrd-label)] shadow-[var(--mrd-shadow-console)]'
                : 'bg-transparent text-[color:var(--mrd-label-secondary)] hover:text-[color:var(--mrd-label)]',
            )}
          >
            {tab.label}
            {tab.count != null ? (
              <span className="mrd-num text-[length:var(--mrd-text-micro)] opacity-70">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ProvenanceNote — the honesty contract, as a component
   ──────────────────────────────────────────────────────────────────────────── */

export interface ProvenanceNoteProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Every published number on HazardNet carries the artifact it was read from.
 * Making that a component means it cannot be forgotten, and it reads the same
 * on every surface.
 */
export function ProvenanceNote({ children, className }: ProvenanceNoteProps) {
  return (
    <p
      className={cx(
        'mrd-grouped mrd-footnote flex items-start gap-2 text-[color:var(--mrd-label-secondary)]',
        className,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" className="mt-0.5 shrink-0">
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 6.2v4M7 4.1v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   EmptyState / ErrorState — honest absence
   ──────────────────────────────────────────────────────────────────────────── */

export interface StateBlockProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'neutral' | 'hazard';
  className?: string;
}

/**
 * Absence is a fact. A missing artifact renders as a sentence that says it is
 * missing — never as a zero that reads like a real measurement.
 */
export function StateBlock({ title, children, action, tone = 'neutral', className }: StateBlockProps) {
  return (
    <div
      className={cx(
        'mrd-grouped flex flex-col items-start gap-3 py-8',
        tone === 'hazard' && 'bg-[color:var(--mrd-crimson)]/5',
        className,
      )}
    >
      <h3 className="mrd-title3 text-[color:var(--mrd-label)]">{title}</h3>
      {children ? (
        <div className="mrd-subhead max-w-prose text-[color:var(--mrd-label-secondary)]">{children}</div>
      ) : null}
      {action}
    </div>
  );
}
