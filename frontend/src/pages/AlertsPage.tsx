/**
 * `/alerts` — the public alert surface (Phase 5).
 *
 * This page is the one place where the Phase 4 engine becomes something a person can
 * act on, so it is built around four rules:
 *
 *   1. **Never show a number without its provenance.** The source banner names the live
 *      API or the offline snapshot, the load time, the data cutoff and the age against
 *      the 48 h SLO; the payload's own quality warnings are shown, not swallowed.
 *   2. **Never show a map without a text alternative.** `DistrictAlertTable` carries the
 *      same districts, levels and hazards as table rows, reachable from the skip link
 *      and used as the primary view in low-bandwidth mode.
 *   3. **Never let a colour carry meaning alone.** Level words sit next to every swatch,
 *      the legend is present in both views, and the confidence sentence says out loud
 *      that the score is not a probability.
 *   4. **Never hide the human gate.** Warnings must wait for a named duty officer; the
 *      policy panel states the ceiling in force and what the thresholds are, read from
 *      the API, so this page cannot drift from the engine.
 *
 * The page degrades in one direction only: API → snapshot → "unavailable", and every
 * one of those states has its own honest copy.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import MaterialIcon from '../components/MaterialIcon';
import { AlertCard } from '../components/alerts/AlertCard';
import { AlertFilters, DEFAULT_ALERT_FILTERS, filterAlerts, type AlertFilterState } from '../components/alerts/AlertFilters';
import { AlertLevelLegend } from '../components/alerts/AlertLevelBadge';
import { DataSourceBanner } from '../components/alerts/DataSourceBanner';
import { Disclaimer } from '../components/alerts/Disclaimer';
import { DistrictAlertTable, type DistrictAlertRow } from '../components/alerts/DistrictAlertTable';
import { LanguageToggle } from '../components/alerts/LanguageToggle';
import { AlertLevelLadder, PolicyPanel } from '../components/alerts/PolicyPanel';
import { BangladeshSvgMap } from '../components/BangladeshSvgMap';
import { useAlertsData } from '../hooks/useAlertsData';
import { useBandwidthMode } from '../hooks/useBandwidthMode';
import { useI18n } from '../hooks/useI18n';
import { usePageSeo } from '../hooks/usePageSeo';
import { ALERT_LEVELS, sortAlerts } from '../lib/alerts';
import { DISTRICT_ALERT_LAYER_ID, buildAlertLevelLayer } from '../lib/alertLayer';
import { downloadAlertsCsv } from '../lib/alertsCsv';
import { EMERGENCY_NUMBERS } from '../lib/legal';

export const AlertsPage: React.FC = () => {
  usePageSeo('/alerts');
  const { t, formatDate, formatNumber } = useI18n();
  const navigate = useNavigate();
  const { lowBandwidth, setLowBandwidth, override } = useBandwidthMode();
  const data = useAlertsData();

  const [filters, setFilters] = useState<AlertFilterState>(DEFAULT_ALERT_FILTERS);
  const [view, setView] = useState<'cards' | 'list'>('cards');

  // Low-bandwidth users get the text list first: it is the cheapest view that still
  // answers "is my district at risk".
  useEffect(() => {
    if (lowBandwidth) setView('list');
  }, [lowBandwidth]);

  const filtered = useMemo(() => filterAlerts(data.alerts, filters), [data.alerts, filters]);
  const sorted = useMemo(() => sortAlerts(filtered), [filtered]);

  const alertLayers = useMemo(() => buildAlertLevelLayer(data.alerts), [data.alerts]);

  const levelLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const level of ALERT_LEVELS) labels[level] = t(`alerts.level.${level}`);
    return labels;
  }, [t]);

  const tableRows: DistrictAlertRow[] = useMemo(
    () => data.alerts.map((alert) => ({
      district: alert.district_name || String(alert.district_id ?? '—'),
      division: alert.division || null,
      alert,
      baselineOnly: false,
    })),
    [data.alerts],
  );

  const onSelectDistrict = useCallback((district: string) => {
    navigate(`/district/${encodeURIComponent(district.toLowerCase().replace(/\s+/g, '-'))}`);
  }, [navigate]);

  const onExportCsv = useCallback(() => {
    downloadAlertsCsv(sorted, {
      filename: `HazardNet_Alerts_${new Date().toISOString().slice(0, 10)}.csv`,
      columns: [
        { key: 'id', header: 'alert_id' },
        { key: 'level', header: 'level' },
        { key: 'district_name', header: 'district' },
        { key: 'division', header: 'division' },
        { key: 'hazard_type', header: 'hazard' },
        { key: 'horizon', header: 'horizon' },
        { key: 'target_date', header: 'target_date' },
        { key: 'lead_time_days', header: 'lead_time_days' },
        { key: 'severity_score', header: 'severity_score' },
        { key: 'confidence', header: 'model_score' },
        { key: 'policy_version', header: 'policy_version' },
      ],
    });
  }, [sorted]);

  // How many rows the run could not publish. Prefer the engine's own tally (blocked /
  // pending review / held) and fall back to what this payload dropped — never to zero
  // when the payload simply cannot say.
  const suppressed = data.notPublished ?? data.droppedUnpublished;

  const headline = data.alerts.length === 0
    ? t('alerts.empty.title')
    : (data.alerts.length === 1
      ? t('alerts.count.one', { count: formatNumber(1) })
      : t('alerts.count.other', { count: formatNumber(data.alerts.length) }));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-bold leading-[1.2] tracking-tight text-carbon-90 sm:text-[32px]">
            {t('alerts.title')}
          </h1>
          <p className="mt-1 max-w-2xl text-base leading-[1.62] text-carbon-70">
            {t('alerts.standfirst')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <LanguageToggle variant="switch" />
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-xs font-semibold text-carbon-70">
            <input
              type="checkbox"
              className="h-4 w-4 accent-amber-600"
              checked={lowBandwidth}
              onChange={(event) => setLowBandwidth(event.target.checked)}
              aria-describedby="low-bandwidth-hint"
            />
            {t('bandwidth.toggle')}
            {override === null && (
              <span className="text-xs font-normal text-carbon-60">(auto)</span>
            )}
          </label>
          <span id="low-bandwidth-hint" className="max-w-[240px] text-right text-xs text-carbon-60">
            {t('bandwidth.toggleHint')}
          </span>
        </div>
      </header>

      <div className="mt-4 space-y-2">
        <DataSourceBanner
          source={data.source}
          generatedAt={data.generatedAt}
          ageHours={data.ageHours}
          withinSlo={data.withinSlo}
          offline={typeof navigator !== 'undefined' && navigator.onLine === false}
          lineagePartial={data.warnings.some((warning) => /lineage|scene/i.test(warning))}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-carbon-60">
          <button
            type="button"
            onClick={data.refresh}
            className="inline-flex min-h-[44px] items-center gap-1 border border-carbon-20 bg-nasa-blue px-3 py-2 font-semibold text-white hover:bg-nasa-blue-shade touch-manipulation"
          >
            <MaterialIcon name="refresh" className="text-sm" aria-hidden="true" />
            {t('alerts.page.refresh')}
          </button>
          {data.fetchedAt && (
            <span>{t('alerts.page.loadedAt', { time: formatDate(data.fetchedAt, { withTime: true }) })}</span>
          )}
          <span aria-live="polite" className="font-semibold text-carbon-80">{headline}</span>
          {data.assessed !== null && (
            <span>{t('alerts.page.assessed', { count: formatNumber(data.assessed, { maximumFractionDigits: 0 }) })}</span>
          )}
          {suppressed > 0 && (
            <span className="text-amber-800">
              {t('alerts.page.dropped', { count: formatNumber(suppressed, { maximumFractionDigits: 0 }) })}
            </span>
          )}
          {data.alerts.length > 0 && (
            <button
              type="button"
              onClick={onExportCsv}
              className="inline-flex min-h-[44px] items-center gap-1 border border-carbon-20 px-3 py-2 font-semibold text-carbon-80 hover:bg-carbon-05 touch-manipulation"
            >
              <MaterialIcon name="download" className="text-sm" aria-hidden="true" />
              {t('alerts.page.csv')}
            </button>
          )}
        </div>
        {data.warnings.length > 0 && (
          <details className="border border-carbon-20 border-l-[2px] border-l-[#ea6f24] bg-white p-4 text-base text-carbon-90">
            <summary className="min-h-[44px] cursor-pointer font-bold">{t('alerts.page.degraded')}</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </details>
        )}
      </div>

      {/* List first in the DOM (mobile). CSS order puts the map first on desktop. */}
      <div className="mt-6 flex flex-col">
{/* Filters + list/table */}
      <section className="order-1 mt-8 lg:order-2" aria-labelledby="alerts-list-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="alerts-list-heading" className="text-base font-bold text-carbon-90">
            {t('alerts.page.listTitle')}
          </h2>
          <div className="no-print inline-flex items-center border border-carbon-20 bg-white p-0.5 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setView('cards')}
              aria-pressed={view === 'cards'}
              className={`min-h-[44px] px-3 py-2 touch-manipulation ${view === 'cards' ? 'bg-nasa-blue text-white' : 'text-carbon-70'}`}
            >
              {t('alerts.page.viewCards')}
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-pressed={view === 'list'}
              className={`min-h-[44px] px-3 py-2 touch-manipulation ${view === 'list' ? 'bg-nasa-blue text-white' : 'text-carbon-70'}`}
            >
              {t('alerts.page.viewList')}
            </button>
          </div>
        </div>

        <AlertFilters
          alerts={data.alerts}
          filters={filters}
          onChange={setFilters}
          shown={sorted.length}
          className="mb-4"
        />

        {data.loading && data.alerts.length === 0 && (
          <p className="text-sm text-carbon-60" role="status">{t('common.loading')}</p>
        )}

        {!data.loading && data.alerts.length === 0 && (
          <div className="border border-carbon-20 bg-white p-4">
            <h3 className="text-sm font-bold text-carbon-90">
              {data.source === 'none' ? t('alerts.empty.unavailable') : t('alerts.empty.title')}
            </h3>
            {data.source === 'none' && data.error && (
              <p className="mt-1 font-mono text-xs text-carbon-60">
                {data.error}
              </p>
            )}
            <p className="mt-1 text-xs text-carbon-60">
              {suppressed > 0
                ? t('alerts.empty.blocked', {
                  assessed: formatNumber(data.assessed ?? suppressed, { maximumFractionDigits: 0 }),
                })
                : t('alerts.empty.body')}
            </p>
            {data.assessed !== null && (
              <p className="mt-1 text-xs font-semibold text-carbon-60">
                {t('alerts.page.assessed', { count: formatNumber(data.assessed, { maximumFractionDigits: 0 }) })}
              </p>
            )}
          </div>
        )}

        {data.alerts.length > 0 && (
          <div id={DISTRICT_ALERT_LAYER_ID}>
            {view === 'cards' ? (
              sorted.length === 0 ? (
                <p className="border border-carbon-20 bg-white p-4 text-sm text-carbon-60">
                  {t('alerts.filter.results', { shown: '0', total: String(data.alerts.length) })}
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {sorted.map((alert) => (
                    <li key={alert.id}>
                      <AlertCard
                        alert={alert}
                        onOpen={() => navigate(`/alerts/${encodeURIComponent(alert.id)}`)}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <div id="district-alert-list">
                <DistrictAlertTable rows={tableRows} onSelectDistrict={onSelectDistrict} />
              </div>
            )}
          </div>
        )}
      </section>

<section className="order-2 mt-8 lg:order-1 lg:mt-0" aria-labelledby="alerts-map-heading">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="alerts-map-heading" className="text-base font-bold text-carbon-90">
            {t('alerts.page.mapTitle')}
          </h2>
          <AlertLevelLegend
            levels={ALERT_LEVELS.map((level) => ({
              level,
              label: t(`alerts.level.${level}`),
              description: t(`alerts.level.${level}.desc`),
            }))}
          />
        </div>
        <div className="h-[240px] overflow-hidden border border-carbon-20 lg:h-[320px]">
        <BangladeshSvgMap
          lowBandwidth={lowBandwidth}
          alertLevels={alertLayers}
          alertLevelLabels={levelLabels}
          onSelectDistrict={(district) => onSelectDistrict(district.name)}
          legendSlot={
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-carbon-70">{t('map.legend.alerts')}:</span>
              <AlertLevelLegend
                levels={ALERT_LEVELS.map((level) => ({
                  level,
                  label: t(`alerts.level.${level}`),
                  description: t(`alerts.level.${level}.desc`),
                }))}
              />
            </div>
          }
        />
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-carbon-60">{t('map.layer.note')}</p>
      </section>
      </div>

      {/* Policy in force */}
      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        <PolicyPanel policy={data.policy} />
        <AlertLevelLadder maxAutoLevel={data.policy?.human_in_the_loop?.max_auto_publish_level} />
      </section>

      {/* Official sources */}
      <section className="mt-6 border border-carbon-20 bg-white p-4">
        <h2 className="text-sm font-bold text-carbon-90">{t('alerts.page.official')}</h2>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-carbon-80">
          {EMERGENCY_NUMBERS.map((entry) => (
            <li key={entry.number}>
              <a href={`tel:${entry.number}`} className="underline decoration-dotted underline-offset-2 hover:text-amber-800">
                {entry.number} — {entry.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href="https://live4.bmd.gov.bd/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-amber-800"
            >
              BMD
            </a>
          </li>
          <li>
            <a
              href="https://ffwc.gov.bd/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-amber-800"
            >
              FFWC
            </a>
          </li>
        </ul>
      </section>

      <Disclaimer variant="banner" className="mt-4" text={data.policy?.disclaimer} />

      <p className="mt-4 text-xs text-carbon-60">
        {t('alerts.page.policyNote')}{' '}
        <Link to="/methodology" className="underline decoration-dotted underline-offset-2">
          {t('nav.methodology')}
        </Link>
      </p>
    </div>
  );
};

export default AlertsPage;
