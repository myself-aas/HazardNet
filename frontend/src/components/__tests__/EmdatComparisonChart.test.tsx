/**
 * The EM-DAT panel shipped for months as a 160px grey box captioned
 * "Interactive EM-DAT Comparison Chart (Authorized Researcher View)". The
 * caption promised a chart; there was no chart. Nothing failed, because an
 * empty div is valid JSX and the contrast scanner is happy to score a box with
 * no content in it.
 *
 * These tests pin the two things that made it a defect: that marks actually
 * render for the data, and that the panel cannot quietly turn back into a
 * caption with nothing behind it.
 *
 * They also pin the honesty constraints. model-performance.json says in its own
 * `how_to_read` that the episode counts are "detection counts against recorded
 * historical events, not a forecast-skill estimate" and that five episodes is
 * "far too small to support a skill claim". A chart that renders those counts
 * as a percentage, or interpolates five points into a trend line, would be
 * lying with real data — which is worse than the empty box was.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmdatComparisonChart } from '../EmdatComparisonChart';

const events = [
  ...Array.from({ length: 5 }, () => ({ year: 2000, hazard_type: 'Flood' })),
  ...Array.from({ length: 3 }, () => ({ year: 2001, hazard_type: 'Cyclone' })),
  ...Array.from({ length: 9 }, () => ({ year: 2020, hazard_type: 'Tropical Cyclone' })),
];

const episodes = [
  {
    id: 'amphan-2020',
    title: 'Cyclone Amphan: Bangladesh landfall, 20 May 2020',
    hazard_class: 'Tropical Cyclone',
    onset_date: '2020-05-20',
    detection: { named_districts: 14, flagged_any_class: 14 },
  },
];

const caveats = [
  'These are detection counts against recorded historical events, not a forecast-skill estimate.',
];

describe('EmdatComparisonChart', () => {
  it('renders a mark per catalogued year rather than a placeholder', () => {
    render(<EmdatComparisonChart events={events} episodes={episodes} />);
    // 2000, 2001, 2020 — three distinct years in the fixture.
    expect(screen.getByLabelText('2000: 5 catalogued events')).toBeInTheDocument();
    expect(screen.getByLabelText('2001: 3 catalogued events')).toBeInTheDocument();
    expect(screen.getByLabelText('2020: 9 catalogued events')).toBeInTheDocument();
  });

  it('never renders the placeholder caption it replaced', () => {
    render(<EmdatComparisonChart events={events} episodes={episodes} />);
    expect(screen.queryByText(/Authorized Researcher View/i)).not.toBeInTheDocument();
  });

  it('reports episode detection as a count, never as a skill percentage', () => {
    render(<EmdatComparisonChart events={events} episodes={episodes} />);
    expect(screen.getByText('14/14 districts')).toBeInTheDocument();
    // A "100%" anywhere would read as perfect accuracy on a 1-episode sample.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('surfaces the dataset\u2019s own caveats on the panel, not in a tooltip', () => {
    render(<EmdatComparisonChart events={events} episodes={episodes} caveats={caveats} />);
    expect(screen.getByText(/not a forecast-skill estimate/i)).toBeVisible();
  });

  it('carries a text alternative so the chart is not pixels-only', () => {
    render(<EmdatComparisonChart events={events} episodes={episodes} />);
    const table = screen.getByRole('table', { name: /Catalogued hazard events per year/i });
    expect(within(table).getByRole('rowheader', { name: '2020' })).toBeInTheDocument();
  });

  it('does not fall over on an empty record', () => {
    render(<EmdatComparisonChart events={[]} episodes={[]} />);
    expect(screen.getByTestId('emdat-comparison-chart')).toBeInTheDocument();
  });
});
