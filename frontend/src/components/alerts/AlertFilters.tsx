/**
 * Alert list filters (Phase 5).
 *
 * Design constraints from the audience, not from a component library:
 *
 *  - **Three controls, no more.** Level, hazard, district search. Every additional
 *    select is another round-trip of attention on a phone in the field.
 *  - **44 px minimum touch targets** (`--control-min-size` in index.css) — a filter
 *    chip that needs precision is a filter chip that gets mis-tapped in the rain.
 *  - **Real form semantics**: a `<form role="search">`, a `<label>` per control that
 *    is visible (not a placeholder — placeholders vanish on focus and are read
 *    inconsistently), and the result count announced through `aria-live="polite"` so
 *    a screen-reader user hears "showing 4 of 74" after changing a filter without
 *    hunting for it.
 */

import React, { useMemo } from 'react';
import MaterialIcon from '../MaterialIcon';
import { ALERT_LEVELS, type AlertLevel, type AlertRecord } from '../../lib/alerts';
import { useI18n } from '../../hooks/useI18n';
import { useHazardLabel } from '../../hooks/useHazardLabel';

export interface AlertFilterState {
  level: AlertLevel | 'ALL';
  hazard: string | 'ALL';
  division: string | 'ALL';
  query: string;
}

export const DEFAULT_ALERT_FILTERS: AlertFilterState = {
  level: 'ALL',
  hazard: 'ALL',
  division: 'ALL',
  query: '',
};

export function filterAlerts(alerts: AlertRecord[], filters: AlertFilterState): AlertRecord[] {
  const query = filters.query.trim().toLowerCase();
  return alerts.filter((alert) => {
    if (filters.level !== 'ALL' && alert.level !== filters.level) return false;
    if (filters.hazard !== 'ALL' && alert.hazard_type !== filters.hazard) return false;
    if (filters.division !== 'ALL' && (alert.division || '') !== filters.division) return false;
    if (query) {
      const haystack = `${alert.district_name || ''} ${alert.district_id || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export interface AlertFiltersProps {
  alerts: AlertRecord[];
  filters: AlertFilterState;
  onChange: (filters: AlertFilterState) => void;
  shown: number;
  className?: string;
}

export const AlertFilters: React.FC<AlertFiltersProps> = ({
  alerts, filters, onChange, shown, className = '',
}) => {
  const { t, formatNumber } = useI18n();
  const hazardLabel = useHazardLabel();

  const options = useMemo(() => {
    const hazards = new Set<string>();
    const divisions = new Set<string>();
    const levels = new Set<string>();
    for (const alert of alerts) {
      if (alert.hazard_type) hazards.add(alert.hazard_type);
      if (alert.division) divisions.add(alert.division);
      if (alert.level) levels.add(String(alert.level));
    }
    return {
      hazards: [...hazards].sort(),
      divisions: [...divisions].sort(),
      levels: ALERT_LEVELS.filter((level) => levels.has(level)),
    };
  }, [alerts]);

  const update = (patch: Partial<AlertFilterState>) => onChange({ ...filters, ...patch });

  const selectClass =
    'min-h-[44px] w-full rounded-control border border-carbon-20 bg-white px-3 py-2 text-base sm:text-sm font-semibold text-carbon-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1';

  return (
    <form
      role="search"
      aria-label={t('alerts.filter.level')}
      className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${className}`}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="col-span-1">
        <label htmlFor="alert-filter-level" className="mb-1 block text-xs font-bold text-carbon-60">
          {t('alerts.filter.level')}
        </label>
        <select
          id="alert-filter-level"
          className={selectClass}
          value={filters.level}
          onChange={(event) => update({ level: event.target.value as AlertFilterState['level'] })}
        >
          <option value="ALL">{t('common.all')}</option>
          {options.levels.map((level) => (
            <option key={level} value={level}>{t(`alerts.level.${level}`)}</option>
          ))}
        </select>
      </div>

      <div className="col-span-1">
        <label htmlFor="alert-filter-hazard" className="mb-1 block text-xs font-bold text-carbon-60">
          {t('alerts.filter.hazard')}
        </label>
        <select
          id="alert-filter-hazard"
          className={selectClass}
          value={filters.hazard}
          onChange={(event) => update({ hazard: event.target.value })}
        >
          <option value="ALL">{t('common.all')}</option>
          {options.hazards.map((hazard) => (
            <option key={hazard} value={hazard}>{hazardLabel(hazard)}</option>
          ))}
        </select>
      </div>

      {options.divisions.length > 1 && (
        <div className="col-span-1">
          <label htmlFor="alert-filter-division" className="mb-1 block text-xs font-bold text-carbon-60">
            {t('alerts.filter.division')}
          </label>
          <select
            id="alert-filter-division"
            className={selectClass}
            value={filters.division}
            onChange={(event) => update({ division: event.target.value })}
          >
            <option value="ALL">{t('common.all')}</option>
            {options.divisions.map((division) => (
              <option key={division} value={division}>{division}</option>
            ))}
          </select>
        </div>
      )}

      <div className="col-span-2 sm:col-span-1">
        <label htmlFor="alert-filter-query" className="mb-1 block text-xs font-bold text-carbon-60">
          {t('alerts.filter.search')}
        </label>
        <div className="relative">
          <MaterialIcon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-carbon-60"
            aria-hidden="true"
          />
          <input
            id="alert-filter-query"
            type="search"
            inputMode="search"
            autoComplete="off"
            className={`${selectClass} pl-8`}
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
          />
        </div>
      </div>

      <p className="col-span-2 text-xs font-semibold text-carbon-60 sm:col-span-1 sm:self-end" aria-live="polite">
        {t('alerts.filter.results', {
          shown: formatNumber(shown, { maximumFractionDigits: 0 }),
          total: formatNumber(alerts.length, { maximumFractionDigits: 0 }),
        })}
        {filters.level !== 'ALL' || filters.hazard !== 'ALL' || filters.division !== 'ALL' || filters.query
          ? (
            <button
              type="button"
              onClick={() => onChange({ ...DEFAULT_ALERT_FILTERS })}
              className="ml-2 underline decoration-dotted underline-offset-2 hover:text-amber-800"
            >
              {t('alerts.filter.clear')}
            </button>
          )
          : null}
      </p>
    </form>
  );
};

export default AlertFilters;
