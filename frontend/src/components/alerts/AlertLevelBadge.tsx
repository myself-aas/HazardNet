/**
 * The alert badge — the single place a level is turned into colour and words.
 *
 * Why one component: the level palette appears on the map, the list, the district
 * card, the evidence card and the printed export. Five implementations would drift,
 * and a colour that means "watch" in one place and "warning" in another is a safety
 * problem in a hazard UI, not a styling inconsistency.
 *
 * Accessibility: colour is never the only carrier. Every badge renders the level's
 * *word* next to its swatch, uses a shape-adjacent glyph (`alerts.level.*.desc`
 * tooltip and a distinct icon), and the text/background pair clears WCAG AA contrast
 * in both languages. A user who cannot distinguish red from amber still reads
 * "সতর্কতা / Warning".
 */

import React from 'react';
import type { AlertLevel } from '../../lib/alerts';
import MaterialIcon from '../MaterialIcon';

export interface LevelTokens {
  /** Tailwind classes for the pill (text + background + border). */
  pill: string;
  /** Solid hex, for the map fill and any canvas/SVG consumer. */
  solid: string;
  /** Icon name (Material Symbols). */
  icon: string;
}

const LEVEL_TOKENS: Record<AlertLevel, LevelTokens> = {
  NO_ALERT: {
    pill: 'bg-emerald-50 text-emerald-900 border-emerald-300',
    solid: '#15803d',
    icon: 'check_circle',
  },
  WATCH: {
    pill: 'bg-amber-50 text-amber-950 border-amber-400',
    solid: '#f59e0b',
    icon: 'visibility',
  },
  WARNING: {
    pill: 'bg-orange-100 text-orange-950 border-orange-500',
    solid: '#ea580c',
    icon: 'warning',
  },
  SEVERE: {
    pill: 'bg-red-100 text-red-950 border-red-600',
    solid: '#b91c1c',
    icon: 'shield_alert',
  },
};

/** Map/legend colours, keyed by level, for SVG and raster consumers. */
export const LEVEL_COLOURS: Record<AlertLevel, string> = {
  NO_ALERT: LEVEL_TOKENS.NO_ALERT.solid,
  WATCH: LEVEL_TOKENS.WATCH.solid,
  WARNING: LEVEL_TOKENS.WARNING.solid,
  SEVERE: LEVEL_TOKENS.SEVERE.solid,
};

export function levelTokens(level: string | null | undefined): LevelTokens {
  return LEVEL_TOKENS[(level || 'NO_ALERT') as AlertLevel] || LEVEL_TOKENS.NO_ALERT;
}

export interface AlertLevelBadgeProps {
  level: string | null | undefined;
  /** Already-translated level name. */
  label: string;
  /** Already-translated one-line description, used as the accessible title. */
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Prefix read by screen readers before the level name (e.g. "Alert level"). */
  srPrefix?: string;
}

const SIZES = {
  sm: { wrapper: 'px-2 py-0.5 text-[11px] gap-1', icon: 'text-[13px]' },
  md: { wrapper: 'px-2.5 py-1 text-xs gap-1.5', icon: 'text-[15px]' },
  lg: { wrapper: 'px-3 py-1.5 text-sm gap-2', icon: 'text-[18px]' },
};

export const AlertLevelBadge: React.FC<AlertLevelBadgeProps> = ({
  level,
  label,
  description,
  size = 'md',
  className = '',
  srPrefix,
}) => {
  const tokens = levelTokens(level);
  const sizes = SIZES[size];
  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-wide ${tokens.pill} ${sizes.wrapper} ${className}`}
      title={description}
      data-level={level || 'NO_ALERT'}
    >
      <MaterialIcon name={tokens.icon} className={sizes.icon} aria-hidden="true" />
      <span className="sr-only">{srPrefix ? `${srPrefix}: ` : ''}</span>
      <span>{label}</span>
    </span>
  );
};

export interface AlertLevelLegendProps {
  levels: Array<{ level: AlertLevel; label: string; description: string }>;
  className?: string;
}

/** The legend the map and the list share, so a colour is explained wherever it appears. */
export const AlertLevelLegend: React.FC<AlertLevelLegendProps> = ({ levels, className = '' }) => (
  <ul className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-700 ${className}`}>
    {levels.map(({ level, label, description }) => (
      <li key={level} className="flex items-center gap-1.5" title={description}>
        <span
          className="inline-block w-3 h-3 rounded-sm border border-black/10"
          style={{ backgroundColor: LEVEL_COLOURS[level] }}
          aria-hidden="true"
        />
        <span className="font-semibold">{label}</span>
      </li>
    ))}
  </ul>
);

export default AlertLevelBadge;
