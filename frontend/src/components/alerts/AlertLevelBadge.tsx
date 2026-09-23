/**
 * The alert badge — the single place a level is turned into colour and words.
 *
 * Colour is never the only carrier. Every badge renders the level word next to
 * its swatch. Minimum type is 12px (HDS metadata floor).
 */

import React from 'react';
import type { AlertLevel } from '../../lib/alerts';
import MaterialIcon from '../MaterialIcon';

export interface LevelTokens {
  pill: string;
  solid: string;
  icon: string;
}

const LEVEL_TOKENS: Record<AlertLevel, LevelTokens> = {
  NO_ALERT: {
    pill: 'bg-severity-low-surface text-severity-low border-severity-low',
    solid: '#15803d',
    icon: 'check_circle',
  },
  WATCH: {
    pill: 'bg-severity-moderate-surface text-severity-moderate border-severity-moderate',
    solid: '#f59e0b',
    icon: 'visibility',
  },
  WARNING: {
    pill: 'bg-severity-moderate-surface text-severity-moderate border-international-orange',
    solid: '#ea580c',
    icon: 'warning',
  },
  SEVERE: {
    pill: 'bg-severity-high-surface text-severity-high border-severity-high',
    solid: '#b91c1c',
    icon: 'shield_alert',
  },
};

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
  label: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  srPrefix?: string;
}

const SIZES = {
  sm: { wrapper: 'min-h-6 px-2 py-1 text-xs gap-1', icon: 'text-sm' },
  md: { wrapper: 'min-h-6 px-2 py-1 text-xs gap-1.5', icon: 'text-base' },
  lg: { wrapper: 'min-h-8 px-3 py-1.5 text-sm gap-2', icon: 'text-lg' },
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
      className={`inline-flex items-center rounded-control border font-semibold tracking-wide ${tokens.pill} ${sizes.wrapper} ${className}`}
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

export const AlertLevelLegend: React.FC<AlertLevelLegendProps> = ({ levels, className = '' }) => (
  <ul className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-carbon-70 ${className}`}>
    {levels.map(({ level, label, description }) => (
      <li key={level} className="flex items-center gap-1.5" title={description}>
        <span
          className="inline-block w-3 h-3 border border-carbon-20"
          style={{ backgroundColor: LEVEL_COLOURS[level] }}
          aria-hidden="true"
        />
        <span className="font-semibold">{label}</span>
      </li>
    ))}
  </ul>
);

export default AlertLevelBadge;
