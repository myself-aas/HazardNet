/**
 * Apple design system — React primitives.
 *
 * The component layer of the ONE design system. Every value here resolves to a token defined in
 * `styles/apple.css`, which mirrors `packages/design-system/src/apple.ts`, which is transcribed
 * from DESIGN.md. Nothing in this file invents a colour, a radius, a size or a shadow.
 *
 * Replaces `components/meridian/primitives.tsx` and keeps the six export names that file actually
 * had a consumer for (ButtonLink, Card, PillTabs, ProvenanceNote, SectionHeading, SeverityBadge)
 * so the migration is a one-line import change at each call site.
 *
 * The rules this file enforces, from DESIGN.md:
 *   · ONE accent. `intent` cannot select a colour; it selects a *grammar* (filled pill, ghost
 *     pill, utility rect). The fill is always Action Blue or ink.
 *   · NO shadows on UI. Depth is a 1px hairline and a change of background. The single
 *     documented shadow is reserved for product photography (`.ap-product-shadow`).
 *   · NO hover states are documented. Press is `transform: scale(0.95)`. Hover is allowed only
 *     as a non-essential affordance (link underline), never as the only signal.
 *   · 44 × 44 minimum touch target on every interactive element.
 *   · Severity is colour + icon + word. Never colour alone (WCAG 1.4.1).
 */

import React, { forwardRef } from 'react';
import { SeverityGlyph, type SeverityGlyphId } from './HazardGlyph';

function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join(' ');
}

/* ────────────────────────────────────────────────────────────────────────────
   Buttons

   DESIGN.md documents five button grammars and they differ by SHAPE and WEIGHT,
   not by hue. `intent` is therefore a grammar selector.

   The superseded system's intent names ('ink' | 'hazard' | 'interactive' |
   'outline' | 'quiet') used to be accepted here and quietly mapped, so that
   call sites did not have to change in the same commit as the import. That
   migration is finished — one call site was still using the old vocabulary,
   and it now names the grammar it wants. The shim is gone, because an API that
   accepts two sets of names for the same five things is two APIs.
   ──────────────────────────────────────────────────────────────────────────── */

export type AppleIntent =
  | 'primary' /* Action Blue pill — the page's one real CTA            */
  | 'secondary' /* ghost pill, blue hairline — the second of a pair      */
  | 'utility' /* compact ink rect — nav actions                        */
  | 'pearl' /* pearl capsule — card-level secondary                  */
  | 'hero' /* oversized light-weight pill — store hero              */
  | 'icon'; /* 44×44 circle over imagery                            */

export type AppleSize = 'sm' | 'md' | 'lg';

const INTENT_CLASS: Record<AppleIntent, string> = {
  primary: 'ap-btn',
  secondary: 'ap-btn ap-btn-secondary',
  utility: 'ap-btn ap-btn-utility',
  pearl: 'ap-btn ap-btn-pearl',
  hero: 'ap-btn ap-btn-hero',
  icon: 'ap-btn ap-btn-icon',
};

/** Size nudges the padding only. It must never take a control under 44px. */
const SIZE_CLASS: Record<AppleSize, string> = {
  sm: 'px-4',
  md: '',
  lg: 'px-7 text-ap-body',
};

function resolveIntent(intent: AppleIntent | undefined): AppleIntent {
  return intent && intent in INTENT_CLASS ? intent : 'primary';
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  intent?: AppleIntent;
  size?: AppleSize;
  /** Stretch to the container. Apple's hero CTAs do this below 640px. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { intent, size = 'md', block, className, type = 'button', ...rest },
  ref,
) {
  const resolved = resolveIntent(intent);
  return (
    <button
      ref={ref}
      type={type}
      className={cx(INTENT_CLASS[resolved], SIZE_CLASS[size], block && 'w-full', className)}
      {...rest}
    />
  );
});

export interface ButtonLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  intent?: AppleIntent;
  size?: AppleSize;
  block?: boolean;
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { intent, size = 'md', block, className, ...rest },
  ref,
) {
  const resolved = resolveIntent(intent);
  return (
    <a
      ref={ref}
      className={cx(INTENT_CLASS[resolved], SIZE_CLASS[size], block && 'w-full', className)}
      {...rest}
    />
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   Surfaces

   Apple's depth model is a change of BACKGROUND plus a 1px hairline. There is
   no elevation ladder because there are no shadows, so `Card` has no `elevated`
   variant — asking for one is asking for a different design system.
   ──────────────────────────────────────────────────────────────────────────── */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `grouped` sits the card on parchment; `raised` on pearl. Both are flat. */
  tone?: 'canvas' | 'grouped' | 'raised';
  /** Drop the hairline — for cards that butt against each other in a grid. */
  seamless?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}


const CARD_TONE: Record<NonNullable<CardProps['tone']>, string> = {
  canvas: 'bg-ap-canvas',
  grouped: 'bg-ap-grouped',
  raised: 'bg-ap-raised',
};

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { tone = 'canvas', seamless, as: Tag = 'div', className, ...rest },
  ref,
) {
  const Component = Tag as React.ElementType;
  return (
    <Component
      ref={ref}
      className={cx('ap-card', CARD_TONE[tone], seamless && 'border-0', className)}
      {...rest}
    />
  );
});

/**
 * A full-bleed Apple tile.
 *
 * DESIGN.md §Layout: tiles are edge-to-edge, `rounded.none`, 80px of vertical padding, and the
 * change of background colour IS the divider — there is no rule, no border, no shadow between
 * sections. Alternating `light` and `parchment` is the whole page rhythm.
 */
export interface TileProps extends React.HTMLAttributes<HTMLElement> {
  tone?: 'light' | 'parchment' | 'dark' | 'dark-2' | 'dark-3';
  /** Constrain the inner content. `text` = 980px, `wide` = 1440px. */
  width?: 'text' | 'wide' | 'full';
  as?: 'section' | 'div' | 'header' | 'footer';
}

const TILE_TONE: Record<NonNullable<TileProps['tone']>, string> = {
  light: 'ap-tile-light',
  parchment: 'ap-tile-parchment',
  dark: 'ap-tile-dark',
  'dark-2': 'ap-tile-dark-2',
  'dark-3': 'ap-tile-dark-3',
};

export function Tile({ tone = 'light', width = 'text', as: Tag = 'section', className, children, ...rest }: TileProps) {
  const Component = Tag as React.ElementType;
  return (
    <Component className={cx('ap-tile', TILE_TONE[tone], className)} {...rest}>
      <div
        className={cx(
          width === 'text' && 'max-w-ap-text mx-auto',
          width === 'wide' && 'max-w-ap-wide mx-auto',
        )}
      >
        {children}
      </div>
    </Component>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Type
   ──────────────────────────────────────────────────────────────────────────── */

export function Eyebrow({ children, className, ...rest }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cx('ap-caption-strong text-ap-link', className)} {...rest}>
      {children}
    </p>
  );
}

export interface SectionHeadingProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Standfirst: the one paragraph under a heading. Apple's deference — it explains,
   *  it does not decorate. */
  standfirst?: React.ReactNode;
  level?: 1 | 2 | 3;
  id?: string;
  align?: 'start' | 'center';
  className?: string;
}

/**
 * Heading + optional eyebrow + optional standfirst as one unit, so the vertical rhythm between
 * the three is identical on every page. Levels map to Apple's named styles rather than to
 * arbitrary sizes: h1 → hero, h2 → display, h3 → tagline.
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
  const Tag = `h${level}` as unknown as 'h2';
  const titleClass = level === 1 ? 'ap-hero' : level === 2 ? 'ap-display' : 'ap-tagline';
  return (
    <div className={cx(align === 'center' && 'text-center', className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Tag id={id} className={cx(titleClass, eyebrow && 'mt-3')}>
        {title}
      </Tag>
      {standfirst ? (
        <p className={cx('ap-lead mt-4 max-w-2xl', align === 'center' && 'mx-auto')}>{standfirst}</p>
      ) : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Severity — the declared data layer

   DESIGN.md forbids a second ACCENT. It does not, and could not, forbid a data
   encoding: five hazard levels cannot be carried by one blue, and WCAG 1.4.1
   forbids colour as the sole carrier of meaning. So every badge is
   colour + glyph + word, and the hues are retuned to sit inside Apple's palette
   (measured 4.94:1 – 8.66:1 on parchment; see apple.ts §SEVERITY).
   ──────────────────────────────────────────────────────────────────────────── */

export type AppleSeverityLevel = SeverityGlyphId;

const SEVERITY_CLASS: Record<AppleSeverityLevel, string> = {
  low: 'ap-sev-low',
  moderate: 'ap-sev-moderate',
  high: 'ap-sev-high',
  veryHigh: 'ap-sev-very-high',
  extreme: 'ap-sev-extreme',
};

const SEVERITY_LABEL: Record<AppleSeverityLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  veryHigh: 'Very high',
  extreme: 'Extreme',
};

export interface SeverityBadgeProps {
  level: AppleSeverityLevel;
  /** Overrides the English label — pass the i18n string when localised. */
  label?: string;
  /** Prefix announced to screen readers before the level. */
  srPrefix?: string;
  className?: string;
}

export function SeverityBadge({ level, label, srPrefix = 'Severity', className }: SeverityBadgeProps) {
  const text = label ?? SEVERITY_LABEL[level];
  return (
    <span className={cx('ap-sev', SEVERITY_CLASS[level], className)}>
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
  source?: React.ReactNode;
  /** Renders the em-dash placeholder instead of a number. An absent reading is
   *  information; a zero is a lie. */
  missing?: boolean;
  className?: string;
}

export function Figure({ value, label, source, missing = false, className }: FigureProps) {
  return (
    <div className={cx(className)}>
      <p className={cx('ap-display-md ap-mono', missing && 'text-ap-label-tertiary')}>
        {missing ? '—' : value}
      </p>
      <p className="ap-caption mt-1">{label}</p>
      {source ? <p className="ap-micro-legal mt-1">{source}</p> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   PillTabs — a real tablist, keyboard-navigable
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
 * A segmented control. Arrow-key navigable and wired as a real tablist, because a row of buttons
 * that behaves like tabs but does not announce like tabs fails every keyboard user.
 *
 * Selection is a 2px Action Blue border, not a fill: DESIGN.md's own chip pattern.
 */
export function PillTabs({ tabs, value, onChange, ariaLabel, className }: PillTabsProps) {
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.id === value),
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = tabs.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = activeIndex === last ? 0 : activeIndex + 1;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = activeIndex === 0 ? last : activeIndex - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].id);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('flex flex-wrap gap-2', className)} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className="ap-chip"
            data-selected={selected ? 'true' : 'false'}
          >
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span className="ap-mono text-ap-label-secondary">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ProvenanceNote
   ──────────────────────────────────────────────────────────────────────────── */

export interface ProvenanceNoteProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Every published number on HazardNet carries the artifact it was read from. Making that a
 * component means it cannot be forgotten, and it reads the same on every surface.
 */
export function ProvenanceNote({ children, className }: ProvenanceNoteProps) {
  return (
    <p className={cx('ap-fine-print flex items-start gap-2', className)}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false" className="mt-0.5 shrink-0">
        <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M7 6.2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="7" cy="4" r="0.8" fill="currentColor" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   StateBlock — empty / error / loading, in the house voice
   ──────────────────────────────────────────────────────────────────────────── */

export interface StateBlockProps {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'neutral' | 'warning' | 'danger';
  className?: string;
}

const STATE_TONE: Record<NonNullable<StateBlockProps['tone']>, string> = {
  neutral: 'text-ap-label-secondary',
  warning: 'text-severity-moderate',
  danger: 'text-severity-very-high',
};

export function StateBlock({ title, children, action, tone = 'neutral', className }: StateBlockProps) {
  return (
    <div className={cx('ap-card bg-ap-grouped text-center', className)} role="status">
      <p className={cx('ap-body-strong', STATE_TONE[tone])}>{title}</p>
      {children ? <div className="ap-caption mt-2">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Container
   ──────────────────────────────────────────────────────────────────────────── */

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: 'text' | 'wide';
}

export function Container({ width = 'text', className, ...rest }: ContainerProps) {
  return (
    <div
      className={cx('mx-auto px-ap-lg', width === 'text' ? 'max-w-ap-text' : 'max-w-ap-wide', className)}
      {...rest}
    />
  );
}

export { SeverityGlyph, HazardGlyph, normaliseHazardId } from './HazardGlyph';
export type { HazardId, SeverityGlyphId } from './HazardGlyph';
