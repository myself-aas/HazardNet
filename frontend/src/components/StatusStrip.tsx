/**
 * StatusStrip component (TASK-005, TRD §5.1, §7.2)
 *
 * Displays active advisory tier counts:
 * "N SEVERE · M WARNING · K WATCH · L NORMAL"
 * Matching active snapshot totals with exact arithmetic.
 */

import React, { useMemo } from 'react';
import type { ForecastRow, AdvisoryTier } from '../lib/forecasts';
import { useI18n } from '../hooks/useI18n';
import AlertLevelBadge from './alerts/AlertLevelBadge';

export interface TierCounts {
  SEVERE: number;
  WARNING: number;
  WATCH: number;
  NORMAL: number;
}

export interface StatusStripProps {
  forecasts?: ForecastRow[];
  counts?: Partial<TierCounts>;
  totalDistricts?: number;
  className?: string;
  horizon?: string;
  showBadges?: boolean;
}

/**
 * Computes tier counts from forecast rows.
 * If 128 rows (2 horizons) are passed, filters to the current horizon or unique districts.
 */
export function computeTierCounts(rows?: ForecastRow[], horizon?: string): TierCounts {
  const counts: TierCounts = {
    SEVERE: 0,
    WARNING: 0,
    WATCH: 0,
    NORMAL: 0,
  };

  if (!rows || rows.length === 0) {
    return counts;
  }

  // Filter to horizon if specified, otherwise take unique districts by district_name/id
  const targetHorizon = horizon || (rows.some((r) => r.horizon === '7_days') ? '7_days' : undefined);
  const relevantRows = targetHorizon
    ? rows.filter((r) => r.horizon === targetHorizon)
    : rows;

  const districtMap = new Map<string, ForecastRow>();
  for (const row of relevantRows) {
    const key = String(row.district_name || row.district_id || '').toLowerCase();
    if (!districtMap.has(key)) {
      districtMap.set(key, row);
    }
  }

  for (const row of districtMap.values()) {
    const tier = (row.advisory_tier || '').toUpperCase() as AdvisoryTier;
    if (tier === 'SEVERE') {
      counts.SEVERE += 1;
    } else if (tier === 'WARNING') {
      counts.WARNING += 1;
    } else if (tier === 'WATCH') {
      counts.WATCH += 1;
    } else if (tier === 'NORMAL') {
      counts.NORMAL += 1;
    } else {
      // Fallback derivation based on severity_score when tier is absent (backward compatibility)
      const score = row.severity_score ?? 0;
      if (score >= 0.75) counts.SEVERE += 1;
      else if (score >= 0.50) counts.WARNING += 1;
      else if (score >= 0.30) counts.WATCH += 1;
      else counts.NORMAL += 1;
    }
  }

  return counts;
}

export const StatusStrip: React.FC<StatusStripProps> = ({
  forecasts,
  counts: explicitCounts,
  totalDistricts = 64,
  className = '',
  horizon,
  showBadges = true,
}) => {
  const { isBengali, formatNumber } = useI18n();

  const counts: TierCounts = useMemo(() => {
    if (explicitCounts) {
      return {
        SEVERE: explicitCounts.SEVERE ?? 0,
        WARNING: explicitCounts.WARNING ?? 0,
        WATCH: explicitCounts.WATCH ?? 0,
        NORMAL: explicitCounts.NORMAL ?? 0,
      };
    }
    return computeTierCounts(forecasts, horizon);
  }, [explicitCounts, forecasts, horizon]);

  const labels = isBengali
    ? {
        SEVERE: 'গুরুতর',
        WARNING: 'সতর্কবার্তা',
        WATCH: 'পর্যবেক্ষণ',
        NORMAL: 'স্বাভাবিক',
      }
    : {
        SEVERE: 'SEVERE',
        WARNING: 'WARNING',
        WATCH: 'WATCH',
        NORMAL: 'NORMAL',
      };

  const formattedText = `${formatNumber(counts.SEVERE)} ${labels.SEVERE} · ${formatNumber(
    counts.WARNING
  )} ${labels.WARNING} · ${formatNumber(counts.WATCH)} ${labels.WATCH} · ${formatNumber(
    counts.NORMAL
  )} ${labels.NORMAL}`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 dark:bg-carbon-90/95 border border-carbon-20 dark:border-carbon-80 shadow-xs backdrop-blur-md text-xs font-mono ${className}`}
      data-testid="status-strip"
    >
      {showBadges ? (
        <div className="flex flex-wrap items-center gap-2">
          <AlertLevelBadge
            level="SEVERE"
            label={`${formatNumber(counts.SEVERE)} ${labels.SEVERE}`}
            size="sm"
          />
          <span className="text-carbon-40" aria-hidden="true">·</span>
          <AlertLevelBadge
            level="WARNING"
            label={`${formatNumber(counts.WARNING)} ${labels.WARNING}`}
            size="sm"
          />
          <span className="text-carbon-40" aria-hidden="true">·</span>
          <AlertLevelBadge
            level="WATCH"
            label={`${formatNumber(counts.WATCH)} ${labels.WATCH}`}
            size="sm"
          />
          <span className="text-carbon-40" aria-hidden="true">·</span>
          <AlertLevelBadge
            level="NORMAL"
            label={`${formatNumber(counts.NORMAL)} ${labels.NORMAL}`}
            size="sm"
          />
        </div>
      ) : (
        <span className="font-semibold text-carbon-80 dark:text-carbon-20 tracking-wide">
          {formattedText}
        </span>
      )}
    </div>
  );
};

export default StatusStrip;
