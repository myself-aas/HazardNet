/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setLanguage } from '../../lib/i18n';
import { loadDistrictDaily, type DistrictDailyResult, type DailyAdvisory } from '../../lib/dailyAdvisories';
import { DistrictDailyPage } from '../DistrictDailyPage';

jest.mock('../../lib/dailyAdvisories', () => ({
  ...jest.requireActual('../../lib/dailyAdvisories'),
  loadDistrictDaily: jest.fn(),
}));
jest.mock('../DistrictDetailPage', () => ({
  DistrictDetailPage: () => 'Legacy published records',
}));

const mockLoad = loadDistrictDaily as jest.MockedFunction<typeof loadDistrictDaily>;
const run = {
  id: 'synthetic-test', generatedAt: '2026-11-01T17:00:00Z',
  dataCutoff: '2026-11-01T15:00:00Z', expiresAt: '2026-11-03T03:00:00Z',
  modelVersion: 'test-version',
};
const rows: DailyAdvisory[] = Array.from({ length: 15 }, (_, index) => {
  const date = new Date(Date.parse('2026-11-02T00:00:00Z') + index * 86_400_000).toISOString().slice(0, 10);
  return {
    advisoryId: `1-${date}-flood`, districtId: 1, district: 'Kurigram', division: 'Rangpur',
    forecastDay: index + 1, targetDate: date, hazard: 'Flood', tier: 'WATCH',
    reasonCode: 'district_outlook', actionIds: ['check_drains', 'keep_feed_dry', 'check_official_updates'],
    peak: 'tied', qualityNotes: ['official_update_unverified'], weather: {},
  };
});
const outcome = (changes: Partial<DistrictDailyResult> = {}): DistrictDailyResult => ({
  status: 'fresh', source: 'api', run, advisories: rows, fetchedAt: '2026-11-01T18:00:00Z', ...changes,
});

function mount(id = 'kurigram', query = '') {
  return render(<MemoryRouter initialEntries={[`/forecast/district/${id}${query}`]}>
    <Routes><Route path="/forecast/district/:id" element={<DistrictDailyPage />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T18:00:00Z'));
  setLanguage('en');
  mockLoad.mockReset();
});
afterEach(() => {
  setLanguage('en');
  jest.useRealTimers();
});

it('answers what, when, seriousness and safe actions in a seven-day default view', async () => {
  mockLoad.mockResolvedValue(outcome());
  mount();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('heading', { name: 'Kurigram district outlook' })).toBeTruthy();
  expect(screen.getByRole('note').textContent).toMatch(/ongoing research project under development/i);
  expect(screen.getByRole('note').textContent).toMatch(/outputs of a published HazardNet daily model run/i);
  expect(screen.getAllByText(/not an official warning service/i).length).toBeGreaterThan(0);
  const days = document.getElementById('daily-outlook-days');
  // List structure is semantic even when browser media queries are unavailable in jsdom.
  expect(screen.getAllByRole('article')).toHaveLength(7);
  expect(within(screen.getAllByRole('article')[0]).getByText('Watch')).toBeTruthy();
  expect(screen.getAllByText('Check field drainage and keep an exit route clear.')).toHaveLength(7);
  expect(screen.queryByText(/severity index|model score|fusion reason/i)).toBeNull();
  const toggle = screen.getByRole('button', { name: /Show all available days/i });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(screen.getAllByRole('article')).toHaveLength(15);
  expect(screen.getByRole('button', { name: /Show first 7 days/i }).getAttribute('aria-expanded')).toBe('true');
  expect(days).toBeTruthy();
  fireEvent.click(within(screen.getAllByRole('article')[0]).getByText('Why this outlook?'));
  expect(within(screen.getAllByRole('article')[0]).getByText(/No single highest-risk day/)).toBeTruthy();
});

it('says unavailable rather than inventing a quiet forecast or falling back to baseline scores', async () => {
  mockLoad.mockResolvedValue(outcome({ status: 'unavailable', source: 'none', run: null, advisories: [] }));
  mount();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/Unknown does not mean safe/)).toBeTruthy();
  expect(screen.getByText(/ongoing research project under development/i)).toBeTruthy();
  expect(screen.queryByRole('article')).toBeNull();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  expect(screen.getAllByText(/BMD and FFWC/).length).toBeGreaterThan(0);
});

it('labels an expired offline copy in Bangla and never calls it live', async () => {
  setLanguage('bn');
  mockLoad.mockResolvedValue(outcome({ status: 'offline', source: 'offline', fetchedAt: null,
    run: { ...run, expiresAt: '2026-11-01T17:00:00Z' } }));
  mount();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('এই যন্ত্রে রাখা অফলাইন কপি')).toBeTruthy();
  expect(screen.getByText(/চলমান গবেষণা প্রকল্প.*দৈনিক মডেল রানের ফল/)).toBeTruthy();
  expect(screen.getByText(/অফলাইন কপির হালনাগাদের সময়ও পেরিয়ে গেছে/)).toBeTruthy();
  expect(screen.getAllByText(/৯৯৯/).length).toBeGreaterThan(0);
  expect(screen.queryByText('Published outlook')).toBeNull();
  expect(screen.getAllByRole('article')).toHaveLength(7);
});

it('retains the already-public two-horizon records without treating a query as authorization', async () => {
  mount('kurigram', '?view=published-records');
  expect(await screen.findByText('Legacy published records')).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
});

it('does not ask for a forecast when the route names an unknown district', () => {
  mount('not-a-district');
  expect(mockLoad).not.toHaveBeenCalled();
  expect(screen.getByText(/This district was not found/)).toBeTruthy();
});
