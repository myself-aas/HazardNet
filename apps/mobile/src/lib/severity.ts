/**
 * Severity helpers for the mobile UI.
 *
 * Maps an AlertItem's level/severity to visual tokens (color, bg, edge
 * color, word label, icon glyph, haptic intent). Aligns with
 * @hazardnet/core SEVERITY_THRESHOLDS and @hazardnet/design-system tokens.
 */

import { useTheme } from '../theme/ThemeProvider';
import type { AlertItemType } from '@hazardnet/core';

export type SeverityVisual = {
  color: string;
  bg: string;
  edge: string;
  label: string;
  shortLabel: string;
  icon: string;
  // English confidence label per confidence bins (mobile-color-system rule).
  confidenceLabel: (confidence: number) => string;
};

/** Severity edge names we use for cards/banners. */
export type SeverityEdgeName = 'severe' | 'warning' | 'watch' | 'allClear' | 'info';

export function severityForAlert(a: Pick<AlertItemType, 'level'>): SeverityEdgeName {
  switch (a.level) {
    case 'SEVERE': return 'severe';
    case 'WARNING': return 'warning';
    case 'WATCH': return 'watch';
    case 'NO_ALERT': return 'allClear';
    default: return 'info';
  }
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Certain';
  if (confidence >= 0.70) return 'Probable';
  return 'Uncertain';
}

export function useSeverityVisual(level: AlertItemType['level']): SeverityVisual {
  const { theme } = useTheme();
  switch (level) {
    case 'SEVERE':
      return {
        color: theme.colors.severe, bg: theme.colors.severeBg, edge: theme.colors.severe,
        label: 'SEVERE', shortLabel: 'Severe', icon: '!',
        confidenceLabel,
      };
    case 'WARNING':
      return {
        color: theme.colors.warning, bg: theme.colors.warningBg, edge: theme.colors.warning,
        label: 'WARNING', shortLabel: 'Warning', icon: '!',
        confidenceLabel,
      };
    case 'WATCH':
      return {
        color: theme.colors.watch, bg: theme.colors.watchBg, edge: theme.colors.watch,
        label: 'WATCH', shortLabel: 'Watch', icon: '◉',
        confidenceLabel,
      };
    case 'NO_ALERT':
    default:
      return {
        color: theme.colors.allClear, bg: theme.colors.allClearBg, edge: theme.colors.allClear,
        label: 'ALL CLEAR', shortLabel: 'All clear', icon: '✓',
        confidenceLabel,
      };
  }
}

/** Format a target_date as a relative/absolute label. */
export function formatTargetDate(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diffH = Math.round((t - now) / (60 * 60 * 1000));
  if (diffH < 0) return `${Math.abs(diffH)}h ago`;
  if (diffH < 1) return '<1h from now';
  if (diffH < 48) return `in ${diffH}h`;
  const days = Math.round(diffH / 24);
  return `in ${days}d`;
}

/** Format a published_at/issued_at as "Updated X ago". */
export function formatAge(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diffMin = Math.max(0, Math.round((now - t) / 60_000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 48) return `${diffH}h ago`;
  const d = Math.floor(diffH / 24);
  return `${d}d ago`;
}
