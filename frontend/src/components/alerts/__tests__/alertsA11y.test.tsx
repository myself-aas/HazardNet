import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * WCAG automated pass on the new surfaces (Phase 5).
 *
 * `jest-axe` runs the axe-core rule set (WCAG 2 A/AA/2.2 AA plus best-practice rules) over
 * rendered markup, which catches the failures that are easy to introduce and hard to see:
 * a control with no accessible name, a heading level skipped, an ARIA attribute used on
 * the wrong role, duplicate ids, a list that is not a list.
 *
 * What it cannot check — contrast of colours defined in Tailwind classes, or whether the
 * text makes sense — is the part of the Phase 5 accessibility pass that was done by hand
 * and is written up in docs/frontend/ACCESSIBILITY.md. Its value here is regression
 * prevention: these rules will run on every future change to these components.
 */

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import { AlertCard } from '../AlertCard';
import { AlertFilters, DEFAULT_ALERT_FILTERS } from '../AlertFilters';
import { AlertLevelLegend } from '../AlertLevelBadge';
import { DataSourceBanner } from '../DataSourceBanner';
import { Disclaimer } from '../Disclaimer';
import { DistrictAlertTable } from '../DistrictAlertTable';
import { EvidenceCard } from '../EvidenceCard';
import { PolicyPanel } from '../PolicyPanel';
import { ALERT_DISCLAIMER } from '../../../lib/legal';
import { resetLanguageForTests } from '../../../lib/i18n';
import type { AlertRecord } from '../../../lib/alerts';

expect.extend(toHaveNoViolations);

const alert: AlertRecord = {
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
    line: ['precip_72h=91mm'],
  },
  freshness: { data_cutoff: '2026-09-18T00:00:00Z' },
  provenance: { model_version: 'model-2026-09-12' },
  reasons: [{ rule: 'watch_severity_band', detail: 'severity 0.9999 ≥ 0.55', track: 'model' }],
  published: { at: '2026-09-18T06:00:00Z', mode: 'auto' },
  disclaimer: ALERT_DISCLAIMER,
};

const surfaces: Array<[string, React.ReactElement]> = [
  ['AlertCard', <AlertCard alert={alert} onOpen={() => {}} />],
  ['Disclaimer (inline)', <Disclaimer />],
  ['Disclaimer (banner)', <Disclaimer variant="banner" />],
  ['DataSourceBanner', <DataSourceBanner source="snapshot" generatedAt="2026-09-17T20:00:00Z" ageHours={10} withinSlo />],
  ['PolicyPanel', <PolicyPanel policy={{ version: 'alert-policy/1.0.0', thresholds: { watch_probability: 0.4 } }} />],
  ['DistrictAlertTable', (
    <DistrictAlertTable
      rows={[
        { district: 'Sunamganj', division: 'Sylhet', alert },
        { district: 'Dhaka', division: 'Dhaka', alert: null, baselineOnly: true, baselineLevel: 'NO_ALERT' },
      ]}
    />
  )],
  ['AlertFilters', (
    <AlertFilters alerts={[alert]} filters={DEFAULT_ALERT_FILTERS} onChange={() => {}} shown={1} />
  )],
  ['AlertLevelLegend', (
    <AlertLevelLegend levels={[
      { level: 'NO_ALERT', label: 'No alert', description: 'Quiet' },
      { level: 'WATCH', label: 'Watch', description: 'Monitor' },
      { level: 'WARNING', label: 'Warning', description: 'Prepare' },
      { level: 'SEVERE', label: 'Severe', description: 'Act' },
    ]} />
  )],
];

beforeEach(() => {
  localStorage.clear();
  resetLanguageForTests('en');
});

describe.each(surfaces)('%s', (_name, element) => {
  it('has no detectable accessibility violations in English', async () => {
    const { container } = render(<MemoryRouter>{element}</MemoryRouter>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no detectable accessibility violations in Bengali', async () => {
    resetLanguageForTests('bn');
    const { container } = render(<MemoryRouter>{element}</MemoryRouter>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EvidenceCard', () => {
  it('has no detectable accessibility violations', async () => {
    const { container } = render(
      <MemoryRouter><EvidenceCard alert={alert} /></MemoryRouter>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
