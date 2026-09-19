/**
 * The district table: the map's *text alternative* (Phase 5, WCAG 2.2 AA).
 *
 * Two problems are solved by the same table, which is why it is not just a table:
 *
 *   1. **The `.svg` map is not perceivable non-visually.** `BangladeshSvgMap` has
 *      keyboard support and per-district `aria-label`s, which is better than most, but
 *      a screen-reader user still has to arrow through 64 shapes to find one district.
 *      A `<table>` with row headers is navigable by table semantics (jump by row, read
 *      a whole row, sort by column) and works at any zoom.
 *   2. **A slow connection cannot render 64 polygons and their labels.** The table is
 *      text, sorts by severity, and is the fallback the low-bandwidth mode links to.
 *
 * Accessibility decisions worth keeping: `<caption>` names the table for assistive
 * tech; level is a real `<th scope="row">`-adjacent cell with a *word*, never a colour
 * swatch alone; sort state is exposed with `aria-sort`; and the table is scrollable in
 * both directions at 400 % zoom, which is one of the WCAG 2.2 reflow criteria the
 * Phase 5 checklist calls out.
 */

import React, { useMemo, useState } from 'react';
import { LEVEL_COLOURS } from './AlertLevelBadge';
import type { AlertLevel, AlertRecord } from '../../lib/alerts';
import { useI18n } from '../../hooks/useI18n';

export interface DistrictAlertRow {
  district: string;
  division?: string | null;
  alert: AlertRecord | null;
  /** Static baseline shown when the run has no row for this district. */
  baselineLevel?: AlertLevel | null;
  baselineHazard?: string | null;
  /** True when the district has no live forecast in this run (PRODUCT_SPEC §5.1). */
  baselineOnly?: boolean;
}

export interface DistrictAlertTableProps {
  rows: DistrictAlertRow[];
  /** Called with the district slug/name when a row is activated. */
  onSelectDistrict?: (district: string) => void;
  className?: string;
  id?: string;
}

type SortKey = 'severity' | 'district' | 'level';

const levelLabelKey = (level: string | null | undefined) =>
  `alerts.level.${(level || 'NO_ALERT') as AlertLevel}` as const;

export const DistrictAlertTable: React.FC<DistrictAlertTableProps> = ({
  rows,
  onSelectDistrict,
  className = '',
  id = 'district-alert-table',
}) => {
  const { t, formatNumber } = useI18n();
  const [sort, setSort] = useState<SortKey>('severity');
  const [ascending, setAscending] = useState(false);

  const sorted = useMemo(() => {
    const withSeverity = (row: DistrictAlertRow) =>
      row.alert?.severity_score ?? (row.baselineOnly ? -1 : -0.5);
    const list = [...rows];
    list.sort((a, b) => {
      if (sort === 'district') return a.district.localeCompare(b.district);
      if (sort === 'level') {
        const rank = (row: DistrictAlertRow) =>
          ['SEVERE', 'WARNING', 'WATCH', 'NO_ALERT'].indexOf(String(row.alert?.level || 'NO_ALERT'));
        return rank(a) - rank(b);
      }
      return withSeverity(b) - withSeverity(a);
    });
    return ascending ? list.reverse() : list;
  }, [rows, sort, ascending]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAscending((value) => !value);
    else {
      setSort(key);
      setAscending(key === 'district');
    }
  };

  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' =>
    sort === key ? (ascending ? 'ascending' : 'descending') : 'none';

  const sortButton = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className="inline-flex items-center gap-1 font-bold text-carbon-80 hover:text-amber-800"
    >
      {label}
      <span aria-hidden="true" className={sort === key ? 'text-carbon-90' : 'text-carbon-60'}>
        {sort === key ? (ascending ? '↑' : '↓') : '↕'}
      </span>
    </button>
  );

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-xs text-carbon-60">{t('map.listAlternativeHint')}</p>
      <div className="overflow-auto max-h-[70vh] rounded-xl border border-carbon-20" tabIndex={0}>
        <table id={id} className="min-w-full border-collapse text-xs">
          <caption className="sr-only">
            {t('map.listAlternative')} — {t('map.column.district')}, {t('map.column.division')},{' '}
            {t('map.column.level')}, {t('map.column.hazard')}
          </caption>
          <thead className="sticky top-0 bg-carbon-10 text-left text-carbon-70">
            <tr>
              <th scope="col" className="px-3 py-2" aria-sort={ariaSort('district')}>
                {sortButton('district', t('map.column.district'))}
              </th>
              <th scope="col" className="px-3 py-2">{t('map.column.division')}</th>
              <th scope="col" className="px-3 py-2" aria-sort={ariaSort('level')}>
                {sortButton('level', t('map.column.level'))}
              </th>
              <th scope="col" className="px-3 py-2">{t('map.column.hazard')}</th>
              <th scope="col" className="px-3 py-2 text-right" aria-sort={ariaSort('severity')}>
                {sortButton('severity', t('alerts.card.evidence'))}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const level = row.alert?.level || row.baselineLevel || 'NO_ALERT';
              const hazard = row.alert?.hazard_type || row.baselineHazard || null;
              const severity = row.alert?.severity_score ?? null;
              return (
                <tr
                  key={row.district}
                  className="border-t border-carbon-10 hover:bg-amber-50/40 focus-within:bg-amber-50/60"
                >
                  <th scope="row" className="px-3 py-2 text-left font-semibold text-carbon-90">
                    {onSelectDistrict ? (
                      <button
                        type="button"
                        onClick={() => onSelectDistrict(row.district)}
                        className="underline decoration-dotted underline-offset-2 hover:text-amber-800"
                      >
                        {row.district}
                      </button>
                    ) : row.district}
                    {row.baselineOnly && (
                      <span className="ml-1.5 rounded border border-carbon-30 bg-carbon-10 px-1 py-0.5 text-[10px] font-bold uppercase text-carbon-60">
                        {t('coverage.baselineBadge')}
                      </span>
                    )}
                  </th>
                  <td className="px-3 py-2 text-carbon-60">{row.division || '—'}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10"
                        style={{ backgroundColor: LEVEL_COLOURS[level as AlertLevel] }}
                      />
                      <span className="font-semibold text-carbon-80">{t(levelLabelKey(level))}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-carbon-70">{hazard || '—'}</td>
                  <td className="px-3 py-2 text-right font-mono text-carbon-80">
                    {severity === null ? '—' : formatNumber(severity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DistrictAlertTable;
