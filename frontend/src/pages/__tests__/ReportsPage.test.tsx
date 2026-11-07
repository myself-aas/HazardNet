import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportsPage from '../ReportsPage';
import {
  fetchArchiveIndex,
  fetchDailySnapshot,
  fetchReportMarkdown,
  type ArchiveEntry,
  type ArchiveIndex,
  type DailySnapshot,
} from '../../lib/reports';

jest.mock('../../lib/reports', () => {
  const actual = jest.requireActual('../../lib/reports');
  return {
    ...actual,
    fetchArchiveIndex: jest.fn(),
    fetchDailySnapshot: jest.fn(),
    fetchReportMarkdown: jest.fn(),
  };
});

jest.mock('recharts', () => {
  const ReactRuntime = require('react');
  const chart = (name: string) => (props: { children?: unknown }) => ReactRuntime.createElement(
    'div',
    { 'data-testid': `recharts-${name}` },
    props.children,
  );
  const empty = () => null;
  return {
    Bar: chart('Bar'),
    BarChart: chart('BarChart'),
    CartesianGrid: empty,
    Cell: empty,
    Line: chart('Line'),
    LineChart: chart('LineChart'),
    ResponsiveContainer: chart('ResponsiveContainer'),
    Tooltip: empty,
    XAxis: empty,
    YAxis: empty,
  };
});

const olderEntry: ArchiveEntry = {
  date: '2026-11-05',
  file: '2026-11-05.md',
  runId: 'run-2026-11-05',
  generatedAt: '2026-11-05T23:00:00.000Z',
  datasetVersion: 46,
  modelVersion: 'hazardnet-v1',
  rows: 2,
  districts: 1,
  forecastDays: 1,
  tiers: { WATCH: 2 },
  topAdvisory: { district: 'Kurigram', hazard: 'Flash Flood', tier: 'WATCH', severityScore: 0.3 },
};

const currentEntry: ArchiveEntry = {
  ...olderEntry,
  date: '2026-11-06',
  file: '2026-11-06.md',
  runId: 'run-2026-11-06',
  generatedAt: '2026-11-06T23:07:39.823Z',
  datasetVersion: 47,
};

const latestSnapshot: DailySnapshot = {
  run: {
    id: 'run-2026-11-06',
    generatedAt: '2026-11-06T23:07:39.823Z',
    modelVersion: 'hazardnet-v1',
    sourceDatasetVersion: 47,
  },
  coverage: { districts: 1, forecastDays: 1, publishedRows: 2 },
  advisories: [
    { district: 'Kurigram', division: 'Rangpur', hazard: 'Flash Flood', targetDate: '2026-11-08', tier: 'WATCH', severityScore: 0.3 },
    { district: 'Gaibandha', division: 'Rangpur', hazard: 'Flash Flood', targetDate: '2026-11-08', tier: 'WATCH', severityScore: 0.3 },
  ],
};

const markdown = [
  '# Daily report',
  '',
  '## 1. Snapshot summary',
  '',
  '| Field | Value |',
  '|---|---|',
  '| Published rows | 2 |',
  '',
  '## 2. Tier distribution',
  '',
  '{{chart:tier-distribution}}',
  '',
  '| Tier | Rows |',
  '|---|---:|',
  '| WATCH | 2 |',
  '',
  '## 3. Statistical analysis',
  '',
  'Descriptive statistics only.',
  '',
  '## 4. Frequently asked questions',
  '',
  '### Are these official warnings?',
  '',
  'No.',
].join('\n');

function mountPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:date" element={<ReportsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReportsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchArchiveIndex as jest.Mock).mockResolvedValue({ schema: 1, entries: [currentEntry, olderEntry] } satisfies ArchiveIndex);
    (fetchDailySnapshot as jest.Mock).mockResolvedValue(latestSnapshot);
    (fetchReportMarkdown as jest.Mock).mockResolvedValue(markdown);
  });

  it('loads the latest indexed report with provenance, safety framing and matching figures', async () => {
    mountPage('/reports');

    expect(await screen.findByRole('heading', { level: 1, name: 'Daily report: 2026-11-06' })).toBeInTheDocument();
    expect(screen.getByText(/HazardNet is not an official warning service/i)).toBeInTheDocument();
    expect(screen.getByText('run-2026-11-06')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByTestId('recharts-BarChart')).toBeInTheDocument();
    expect(fetchReportMarkdown).toHaveBeenCalledWith('2026-11-06');
  });

  it('keeps a dated report tied to its archived run when the live snapshot is newer', async () => {
    mountPage('/reports/2026-11-05');

    expect(await screen.findByRole('heading', { level: 1, name: 'Daily report: 2026-11-05' })).toBeInTheDocument();
    expect(screen.getByText(/newer snapshot is available.*does not match this archived report/i)).toBeInTheDocument();
    expect(screen.getByText(/not rendered because the archived source snapshot/i)).toBeInTheDocument();
    expect(screen.getByText('WATCH')).toBeInTheDocument();
    expect(screen.queryByTestId('recharts-BarChart')).not.toBeInTheDocument();
    expect(fetchReportMarkdown).toHaveBeenCalledWith('2026-11-05');
  });
});
