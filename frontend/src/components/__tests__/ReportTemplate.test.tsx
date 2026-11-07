import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { buildReportContents, parseReportBlocks } from '../ReportTemplate';
import ReportTemplate from '../ReportTemplate';
import type { DailySnapshot } from '../../lib/reports';

jest.mock('recharts', () => {
  const ReactRuntime = require('react');
  const chart = (name: string) => (props: { children?: unknown; data?: unknown[] }) => ReactRuntime.createElement(
    'div',
    {
      'data-testid': `recharts-${name}`,
      'data-row-count': Array.isArray(props.data) ? props.data.length : undefined,
    },
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

const snapshot: DailySnapshot = {
  run: {
    id: 'run-2026-11-06',
    generatedAt: '2026-11-06T23:07:39.823Z',
    modelVersion: 'hazardnet-test',
    sourceDatasetVersion: 47,
  },
  coverage: { districts: 1, forecastDays: 1, publishedRows: 2 },
  advisories: [
    { district: 'Kurigram', division: 'Rangpur', hazard: 'Flash Flood', targetDate: '2026-11-08', tier: 'WATCH', severityScore: 0.3 },
    { district: 'Gaibandha', division: 'Rangpur', hazard: 'Flash Flood', targetDate: '2026-11-08', tier: 'WATCH', severityScore: 0.3 },
  ],
};

const reportMarkdown = [
  '# Daily report',
  '',
  '## 1. Snapshot summary',
  '',
  'Published rows are a snapshot, not observed events.',
  '',
  '## 2. Tier distribution',
  '',
  '{{chart:tier-distribution}}',
  '',
  '| Tier | Rows |',
  '|---|---:|',
  '| WATCH | 2 |',
  '',
  '## 3. Mathematical and statistical analysis',
  '',
  '### Severity-score distribution',
  '',
  '{{chart:severity-distribution}}',
  '',
  '| Statistic | Value |',
  '|---|---:|',
  '| Mean | 0.300 |',
  '',
  '## 4. Frequently asked questions',
  '',
  '### Does a score mean an event will happen?',
  '',
  'No. It is a model output, not a calibrated event probability.',
].join('\n');

describe('ReportTemplate', () => {
  it('creates a contents list from report headings and adds missing analysis and FAQ sections', () => {
    const headings = buildReportContents('## Snapshot summary\n\n### Coverage\n', null, '2026-11-05', 'old-run');
    expect(headings).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: 'Snapshot summary', id: 'snapshot-summary' }),
      expect.objectContaining({ text: 'Coverage', id: 'coverage' }),
      expect.objectContaining({ text: 'Mathematical and statistical analysis', id: 'statistical-analysis' }),
      expect.objectContaining({ text: 'Frequently asked questions', id: 'report-faq' }),
    ]));
  });

  it('keeps duplicate heading anchors unique and ignores directives inside fenced code', () => {
    const blocks = parseReportBlocks([
      '## Coverage',
      '',
      '## Coverage',
      '',
      '```text',
      '{{chart:tier-distribution}}',
      '```',
    ].join('\n'));
    const headings = blocks.flatMap((block) => block.kind === 'directive' ? [] : block.headings);
    expect(headings.map((heading) => heading.id)).toEqual(['coverage', 'coverage-1']);
    expect(blocks.some((block) => block.kind === 'directive')).toBe(false);
  });

  it('retains committed report tables and does not substitute a newer snapshot for an archived run', () => {
    render(
      <ReportTemplate
        markdown={reportMarkdown}
        snapshot={snapshot}
        reportDate="2026-11-05"
        reportRunId="older-run"
      />,
    );

    expect(screen.getAllByText(/not rendered because the archived source snapshot/i).length).toBeGreaterThan(0);
    expect(screen.getByText('WATCH')).toBeInTheDocument();
    expect(screen.getByText('0.300')).toBeInTheDocument();
    expect(screen.queryByTestId('recharts-BarChart')).not.toBeInTheDocument();
  });

  it('renders snapshot-bound charts only for the matching report date and run ID', () => {
    render(
      <ReportTemplate
        markdown={reportMarkdown}
        snapshot={snapshot}
        reportDate="2026-11-06"
        reportRunId="run-2026-11-06"
      />,
    );

    expect(screen.getAllByTestId('recharts-BarChart').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/run-2026-11-06 · generated 2026-11-06T23:07:39.823Z/).length).toBeGreaterThan(0);
    expect(screen.getByText('0.300')).toBeInTheDocument();
  });

  it('sorts top-advisory rows and exposes the current sort accessibly', () => {
    const markdown = '## Top rows\n\n{{table:top-advisories}}';
    render(
      <ReportTemplate
        markdown={markdown}
        snapshot={snapshot}
        reportDate="2026-11-06"
        reportRunId="run-2026-11-06"
      />,
    );

    const scoreHeader = screen.getByRole('button', { name: /severity score/i });
    expect(scoreHeader.closest('th')).toHaveAttribute('aria-sort', 'descending');
    fireEvent.click(scoreHeader);
    expect(screen.getByRole('button', { name: /severity score/i }).closest('th')).toHaveAttribute('aria-sort', 'ascending');
  });
});
