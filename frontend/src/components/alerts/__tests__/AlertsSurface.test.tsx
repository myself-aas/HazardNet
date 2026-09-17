import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * The alert components (Phase 5) rendered in jsdom.
 *
 * The assertions are the accessibility and honesty rules the phase exists for:
 * a level is never communicated by colour alone, the §1.7 disclaimer is always
 * represented, an uncalibrated score is never described as a probability, and the
 * district table is a real table with row headers so it works as the map's text
 * alternative.
 *
 * `lib/alerts.loadAlerts` is mocked: these are component tests, and the network path is
 * covered by the library suite.
 */

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AlertCard } from '../AlertCard';
import { AlertLevelBadge, AlertLevelLegend } from '../AlertLevelBadge';
import { AlertFilters, DEFAULT_ALERT_FILTERS } from '../AlertFilters';
import { DataSourceBanner } from '../DataSourceBanner';
import { Disclaimer } from '../Disclaimer';
import { DistrictAlertTable } from '../DistrictAlertTable';
import { PolicyPanel } from '../PolicyPanel';
import type { AlertRecord } from '../../../lib/alerts';
import { ALERT_DISCLAIMER } from '../../../lib/legal';
import { resetLanguageForTests } from '../../../lib/i18n';

const alert = (over: Partial<AlertRecord> = {}): AlertRecord => ({
  id: '2026-09-21__7_days__sunamganj__flash-flood__p2026-09-18',
  state: 'PUBLISHED',
  level: 'WATCH',
  district_id: 60,
  district_name: 'Sunamganj',
  division: 'Sylhet',
  horizon: '7_days',
  hazard_type: 'Flash Flood',
  target_date: '2026-09-21',
  prediction_date: '2026-09-18',
  lead_time_days: 3,
  severity_score: 0.9999,
  confidence: 0.9912,
  policy_version: 'alert-policy/1.0.0',
  evidence: {
    model: { model_severity: 0.9999, confidence_published: 'uncalibrated_model_softmax' },
    physics: { physics_severity: 0.7549, divergence: 0.245, physics_agreement: 'partial' },
    line: ['precip_72h=91mm', 'soil_moisture=0.42'],
  },
  freshness: { data_cutoff: '2026-09-18T00:00:00Z', within_slo: true },
  provenance: { model_version: 'tflite-2026-09-12' },
  published: { at: '2026-09-18T06:00:00Z', mode: 'auto', model_version: 'tflite-2026-09-12' },
  disclaimer: ALERT_DISCLAIMER,
  ...over,
});

const renderInRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests('en');
});

describe('AlertLevelBadge', () => {
  it('renders the level as a word, not only as a colour', () => {
    render(<AlertLevelBadge level="WARNING" label="Warning" description="Prepare" srPrefix="Alert level" />);
    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Alert level:')).toBeInTheDocument();
  });

  it('falls back to the no-alert palette for an unknown level instead of rendering blank', () => {
    render(<AlertLevelBadge level="SOMETHING" label="?" />);
    expect(document.querySelector('[data-level="SOMETHING"]')).toBeTruthy();
  });
});

describe('AlertLevelLegend', () => {
  it('names every level it colours', () => {
    renderInRouter(
      <AlertLevelLegend
        levels={[
          { level: 'WATCH', label: 'Watch', description: 'Monitor' },
          { level: 'SEVERE', label: 'Severe', description: 'Act' },
        ]}
      />,
    );
    expect(screen.getByText('Watch')).toBeInTheDocument();
    expect(screen.getByText('Severe')).toBeInTheDocument();
  });
});

describe('AlertCard', () => {
  it('shows the hazard, level, lead time and the evidence trail', () => {
    renderInRouter(<AlertCard alert={alert()} />);
    expect(screen.getByRole('heading', { name: /Sunamganj/ })).toBeInTheDocument();
    expect(screen.getByText(/Flash Flood/)).toBeInTheDocument();
    expect(screen.getByText('Independent physics severity:')).toBeInTheDocument();
    expect(screen.getByText(/0\.75/)).toBeInTheDocument();
  });

  it('translates the hazard class in Bengali', () => {
    resetLanguageForTests('bn');
    renderInRouter(<AlertCard alert={alert()} />);
    expect(screen.getByText(/আকস্মিক বন্যা/)).toBeInTheDocument();
  });

  it('says out loud that an uncalibrated score is not a probability', () => {
    renderInRouter(<AlertCard alert={alert()} />);
    expect(screen.getByText(/not a probability/i)).toBeInTheDocument();
  });

  it('switches to probability wording only when the API says it is calibrated', () => {
    renderInRouter(
      <AlertCard
        alert={alert({ evidence: { model: { model_severity: 0.9, confidence_published: 'calibrated_probability' } } })}
      />,
    );
    expect(screen.getByText(/Calibrated probability/)).toBeInTheDocument();
    expect(screen.queryByText(/not a probability/i)).not.toBeInTheDocument();
  });

  it('marks an alert awaiting a duty officer', () => {
    renderInRouter(<AlertCard alert={alert({ requires_human_review: true, published: null })} />);
    expect(screen.getByText(/Awaiting duty-officer review/)).toBeInTheDocument();
  });

  it('says nothing rather than "undefined" when a field is missing', () => {
    renderInRouter(<AlertCard alert={alert({ lead_time_days: null, evidence: null, published: null })} />);
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(screen.getByText(/No independent physics score/)).toBeInTheDocument();
  });
});

describe('Disclaimer', () => {
  it('renders the canonical §1.7 text with callable emergency numbers', () => {
    renderInRouter(<Disclaimer variant="banner" />);
    expect(screen.getByTestId('disclaimer')).toBeInTheDocument();
    expect(screen.getByText(/not an official warning service/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /999/ })).toHaveAttribute('href', 'tel:999');
    expect(screen.getByRole('link', { name: /1090/ })).toHaveAttribute('href', 'tel:1090');
  });

  it('uses the server-supplied wording when the API sends one', () => {
    renderInRouter(<Disclaimer text="Server-supplied disclaimer text." />);
    expect(screen.getByText('Server-supplied disclaimer text.')).toBeInTheDocument();
  });

  it('marks the English body as English on a Bengali page, so it is pronounced correctly', () => {
    resetLanguageForTests('bn');
    renderInRouter(<Disclaimer />);
    const body = screen.getByText(/not an official warning service/);
    expect(body).toHaveAttribute('lang', 'en');
  });

  it('keeps the disclaimer in the print variant, without call links', () => {
    renderInRouter(<Disclaimer variant="print" />);
    const print = screen.getByTestId('disclaimer-print');
    expect(within(print).getByText(/not an official warning service/)).toBeInTheDocument();
    expect(within(print).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('DataSourceBanner', () => {
  it('labels live data as live', () => {
    renderInRouter(<DataSourceBanner source="api" generatedAt="2026-09-18T06:00:00Z" ageHours={6} withinSlo />);
    expect(screen.getByText('Live API')).toBeInTheDocument();
    expect(screen.getByText(/18 September 2026/)).toBeInTheDocument();
  });

  it('labels the offline snapshot as a snapshot and dates it', () => {
    renderInRouter(<DataSourceBanner source="snapshot" generatedAt="2026-09-17T20:00:00Z" />);
    expect(screen.getByText('Offline snapshot')).toBeInTheDocument();
    expect(screen.getByText(/generated 17 September 2026/)).toBeInTheDocument();
  });

  it('labels a service-worker cache copy as an offline copy, not as live', () => {
    renderInRouter(<DataSourceBanner source="cache" generatedAt="2026-09-18T06:00:00Z" />);
    expect(screen.getByText('Offline copy')).toBeInTheDocument();
    expect(screen.getByText(/may be older than the live service/)).toBeInTheDocument();
  });

  it('flags data past the SLO', () => {
    renderInRouter(<DataSourceBanner source="api" generatedAt="2026-09-10T00:00:00Z" ageHours={192} withinSlo={false} />);
    expect(screen.getByText(/192 hours old/)).toBeInTheDocument();
  });

  it('flags partial lineage', () => {
    renderInRouter(<DataSourceBanner source="snapshot" lineagePartial />);
    expect(screen.getByText(/cannot name the satellite scenes/)).toBeInTheDocument();
  });
});

describe('PolicyPanel', () => {
  it('states the automatic ceiling and the calibration gap', () => {
    renderInRouter(
      <PolicyPanel
        policy={{
          version: 'alert-policy/1.0.0',
          human_in_the_loop: { max_auto_publish_level: 'WATCH' },
          thresholds: { watch_probability: 0.4, warning_probability: 0.65, watch_severity: 0.55, divergence_watch: 0.3 },
          calibration: { calibrated_probability_required_for_warning: true },
        }}
      />,
    );
    expect(screen.getByText(/publishes at or below WATCH automatically/)).toBeInTheDocument();
    expect(screen.getByText(/No calibration map is fitted yet/)).toBeInTheDocument();
    expect(screen.getByText(/≥ 40%/)).toBeInTheDocument();
  });

  it('renders the real policy version from the API', () => {
    renderInRouter(<PolicyPanel policy={{ version: 'alert-policy/1.0.0', source: 'committed' }} />);
    expect(screen.getByText(/alert-policy\/1\.0\.0/)).toBeInTheDocument();
  });
});

describe('DistrictAlertTable', () => {
  it('is a real table with row headers, usable as the map text alternative', () => {
    renderInRouter(
      <DistrictAlertTable
        rows={[
          { district: 'Sunamganj', division: 'Sylhet', alert: alert() },
          { district: 'Dhaka', division: 'Dhaka', alert: null, baselineOnly: true, baselineLevel: 'NO_ALERT' },
        ]}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: /District/ })).toBeInTheDocument();
    expect(within(table).getByRole('rowheader', { name: /Sunamganj/ })).toBeInTheDocument();
    expect(within(table).getByText('Baseline')).toBeInTheDocument();
    expect(within(table).getByText(/text alternative for the map/i)).toBeInTheDocument();
  });

  it('exposes sort state to assistive technology', () => {
    renderInRouter(<DistrictAlertTable rows={[{ district: 'Dhaka', alert: null }]} />);
    const severityHeader = screen.getByRole('columnheader', { name: /Evidence/ });
    expect(severityHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('writes a dash rather than a zero for a missing score', () => {
    renderInRouter(
      <DistrictAlertTable rows={[{ district: 'Dhaka', alert: alert({ severity_score: null, district_name: 'Dhaka' }) }]} />,
    );
    expect(screen.getAllByRole('cell', { name: '—' }).length).toBeGreaterThan(0);
  });
});

describe('AlertFilters', () => {
  it('labels every control and announces the result count', () => {
    renderInRouter(
      <AlertFilters
        alerts={[alert(), alert({ id: 'b', district_name: 'Kurigram', level: 'SEVERE' })]}
        filters={DEFAULT_ALERT_FILTERS}
        onChange={jest.fn()}
        shown={1}
      />,
    );
    expect(screen.getByLabelText('Alert level', { selector: 'select' })).toBeInTheDocument();
    expect(screen.getByLabelText('Hazard', { selector: 'select' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search district', { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2')).toHaveAttribute('aria-live', 'polite');
  });
});
