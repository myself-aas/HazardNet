/**
 * The alert badge — the single place a level/tier is turned into colour and words.
 *
 * Colour is never the only carrier. Every badge renders the level word next to
 * its swatch and accessible SVG icon. Minimum type is 12px (HDS metadata floor).
 *
 * Conforms strictly to TASK-005 color ramps and icons:
 *  - SEVERE → Crimson Red (#DC2626) with Alert Triangle icon
 *  - WARNING → Vivid Amber (#D97706) with Warning Shield icon
 *  - WATCH → Golden Yellow (#CA8A04) with Eye/Observation icon
 *  - NORMAL → Emerald Green (#16A34A) with Check Circle icon
 */

import React from 'react';
import type { AlertLevel } from '../../lib/alerts';
import type { AdvisoryTier } from '../../lib/forecasts';
import MaterialIcon from '../MaterialIcon';

export interface LevelTokens {
  pill: string;
  solid: string;
  icon: string;
  label?: string;
}

export type SupportedTierOrLevel = AlertLevel | AdvisoryTier | string;

export const ADVISORY_TIER_COLOURS: Record<string, string> = {
  SEVERE: '#DC2626',
  WARNING: '#D97706',
  WATCH: '#CA8A04',
  NORMAL: '#16A34A',
  NO_ALERT: '#16A34A',
};

const LEVEL_TOKENS: Record<string, LevelTokens> = {
  NORMAL: {
    pill: 'bg-emerald-50 text-[#15803D] border-[#16A34A]/40 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700',
    solid: '#16A34A',
    icon: 'check_circle',
    label: 'Normal',
  },
  NO_ALERT: {
    pill: 'bg-emerald-50 text-[#15803D] border-[#16A34A]/40 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700',
    solid: '#16A34A',
    icon: 'check_circle',
    label: 'No Alert',
  },
  WATCH: {
    pill: 'bg-yellow-50 text-[#854D0E] border-[#CA8A04]/40 dark:bg-yellow-950/60 dark:text-yellow-300 dark:border-yellow-700',
    solid: '#CA8A04',
    icon: 'visibility',
    label: 'Watch',
  },
  WARNING: {
    pill: 'bg-amber-50 text-[#9A3412] border-[#D97706]/40 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700',
    solid: '#D97706',
    icon: 'shield_alert',
    label: 'Warning',
  },
  SEVERE: {
    pill: 'bg-rose-50 text-[#991B1B] border-[#DC2626]/40 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-700',
    solid: '#DC2626',
    icon: 'alert_triangle',
    label: 'Severe',
  },
};

export const LEVEL_COLOURS: Record<AlertLevel, string> = {
  NO_ALERT: ADVISORY_TIER_COLOURS.NORMAL,
  WATCH: ADVISORY_TIER_COLOURS.WATCH,
  WARNING: ADVISORY_TIER_COLOURS.WARNING,
  SEVERE: ADVISORY_TIER_COLOURS.SEVERE,
};

export function levelTokens(level: SupportedTierOrLevel | null | undefined): LevelTokens {
  if (!level) return LEVEL_TOKENS.NORMAL;
  const key = String(level).toUpperCase();
  return LEVEL_TOKENS[key] || LEVEL_TOKENS.NORMAL;
}

export interface AlertLevelBadgeProps {
  level: SupportedTierOrLevel | null | undefined;
  label?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  srPrefix?: string;
  role?: string;
}

const SIZES = {
  sm: { wrapper: 'min-h-6 px-2 py-0.5 text-xs gap-1', icon: 'text-sm' },
  md: { wrapper: 'min-h-6 px-2.5 py-1 text-xs gap-1.5', icon: 'text-base' },
  lg: { wrapper: 'min-h-8 px-3.5 py-1.5 text-sm gap-2', icon: 'text-lg' },
};

export const AlertLevelBadge: React.FC<AlertLevelBadgeProps> = ({
  level,
  label,
  description,
  size = 'md',
  className = '',
  srPrefix,
  role,
}) => {
  const tokens = levelTokens(level);
  const sizes = SIZES[size];
  const displayLabel = label || tokens.label || String(level || 'Normal');
  const resolvedRole = role ?? 'status';

  return (
    <span
      role={resolvedRole === 'status' ? 'status' : (resolvedRole || undefined)}
      // Accessible status indicator: role="status"
      className={`inline-flex items-center rounded-control border font-semibold tracking-wide ${tokens.pill} ${sizes.wrapper} ${className}`}
      title={description}
      data-level={level || 'NORMAL'}
    >
      <MaterialIcon name={tokens.icon} className={sizes.icon} aria-hidden="true" />
      <span className="sr-only">{srPrefix ? `${srPrefix}: ` : ''}</span>
      <span>{displayLabel}</span>
    </span>
  );
};

export interface AlertLevelLegendProps {
  levels: Array<{ level: AlertLevel | AdvisoryTier; label: string; description: string }>;
  className?: string;
}

export const AlertLevelLegend: React.FC<AlertLevelLegendProps> = ({ levels, className = '' }) => (
  <ul className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-carbon-70 ${className}`}>
    {levels.map(({ level, label, description }) => {
      const tokens = levelTokens(level);
      return (
        <li key={level} className="flex items-center gap-1.5" title={description}>
          <span
            className="inline-block w-3 h-3 rounded-xs border border-carbon-20"
            style={{ backgroundColor: tokens.solid }}
            aria-hidden="true"
          />
          <span className="font-semibold">{label}</span>
        </li>
      );
    })}
  </ul>
);

export default AlertLevelBadge;
