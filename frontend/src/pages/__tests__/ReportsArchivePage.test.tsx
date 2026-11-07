import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReportsArchivePage from '../ReportsArchivePage';
import { fetchArchiveIndex, type ArchiveIndex } from '../../lib/reports';

jest.mock('../../lib/reports', () => {
  const actual = jest.requireActual('../../lib/reports');
  return { ...actual, fetchArchiveIndex: jest.fn() };
});

const archive: ArchiveIndex = {
  schema: 1,
  entries: [{
    date: '2026-11-06',
    file: '2026-11-06.md',
    runId: 'kaggle-v47-30b123dbb95c',
    generatedAt: '2026-11-06T23:07:39.823Z',
    datasetVersion: 47,
    modelVersion: '2.1.9+model.0bb5bdaf1789',
    rows: 960,
    districts: 64,
    forecastDays: 15,
    tiers: { WATCH: 960 },
    topAdvisory: {
      district: 'Bagerhat',
      hazard: 'Flash Flood',
      targetDate: '2026-11-08',
      tier: 'WATCH',
      severityScore: 0.3,
    },
  }],
};

describe('ReportsArchivePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchArchiveIndex as jest.Mock).mockResolvedValue(archive);
  });

  it('shows report provenance and explains deterministic tie handling', async () => {
    render(
      <MemoryRouter initialEntries={['/reports/archive']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/reports/archive" element={<ReportsArchivePage />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Published runs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2026-11-06' })).toHaveAttribute('href', '/reports/2026-11-06');
    expect(screen.getByText('kaggle-v47-30b123dbb95c')).toBeInTheDocument();
    expect(screen.getByText('Target date: 2026-11-08')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'One highest-scoring row' })).toBeInTheDocument();
    expect(screen.getByText(/When scores tie, one row is chosen by target date, district, then hazard/i)).toBeInTheDocument();
  });
});
