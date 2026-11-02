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
  const isExtreme = index === 1;
  return {
    advisoryId: `1-${date}-flood`, districtId: 1, district: 'Kurigram', division: 'Rangpur',
    forecastDay: index + 1, targetDate: date, hazard: 'Flood',
    tier: isExtreme ? 'EXTREME' : 'WATCH',
    severityScore: isExtreme ? 0.92 : 0.45,
    requiresReview: isExtreme,
    reasonCode: 'district_outlook',
    actionIds: ['check_drains', 'keep_feed_dry', 'check_official_updates'],
    peak: isExtreme ? 'unique' : 'none',
    qualityNotes: ['official_update_unverified'],
    weather: { precipitationMm: 28.4, temperatureMinC: 23.1, temperatureMaxC: 31.6, windKmh: 42.5 },
    metrics: { confidence: 0.91, modelSeverity: 0.9, physicsSeverity: 0.84, finalSeverity: 0.92, probTop1: 0.91, top2Hazard: 'Flash Flood' },
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

it('renders all 15 continuous days by default with severity index, peak severe date highlight, 64-district selector, weather values and forecast metrics', async () => {
  mockLoad.mockResolvedValue(outcome());
  mount();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('heading', { name: 'Kurigram district outlook' })).toBeTruthy();
  expect(screen.getByRole('note').textContent).toMatch(/ongoing research project under development/i);
  expect(screen.getByRole('note').textContent).toMatch(/outputs of a published HazardNet daily model run/i);
  expect(screen.getAllByText(/not an official warning service/i).length).toBeGreaterThan(0);

  // All 64 districts available in the quick switcher
  const districtSelect = document.getElementById('daily-district-select') as HTMLSelectElement | null;
  expect(districtSelect).toBeTruthy();
  expect(districtSelect?.querySelectorAll('option')).toHaveLength(64);

  // Continuous 15-day trajectory strip + peak severe date banner
  const trajectory = screen.getByTestId('continuous-15day-trajectory');
  expect(trajectory.querySelectorAll('[data-forecast-day]')).toHaveLength(15);
  expect(trajectory.querySelectorAll('[data-peak="true"]')).toHaveLength(1);
  expect(screen.getByTestId('peak-severe-banner').textContent).toMatch(/92\/100/);

  // All 15 continuous daily articles rendered immediately by default
  const days = document.getElementById('daily-outlook-days');
  expect(days).toBeTruthy();
  expect(screen.getAllByRole('article')).toHaveLength(15);
  expect(days?.querySelectorAll('li[data-peak="true"]')).toHaveLength(1);
  expect(within(screen.getAllByRole('article')[0]).getByText('Watch')).toBeTruthy();
  expect(within(screen.getAllByRole('article')[1]).getByText('Extreme')).toBeTruthy();
  expect(within(screen.getAllByRole('article')[1]).getByText(/Severity index: 92\/100 \(0\.92\)/)).toBeTruthy();
  expect(within(screen.getAllByRole('article')[1]).getByText(/Severity score: 92% \(0\.92\)/)).toBeTruthy();
  expect(within(screen.getAllByRole('article')[1]).getByText(/Unreviewed research output above the watch threshold/i)).toBeTruthy();
  expect(within(screen.getAllByRole('article')[0]).getByText('28.4 mm')).toBeTruthy();
  expect(within(screen.getAllByRole('article')[0]).getByText('42.5 km/h')).toBeTruthy();
  expect(screen.getAllByText('Check field drainage and keep an exit route clear.')).toHaveLength(15);
  expect(screen.queryByText(/model score|fusion reason/i)).toBeNull();

  // Interactive Day 1–15 / Peak Severe Days picker filters timeline and restores all 15 days
  const trajectoryPicker = screen.getByTestId('trajectory-day-picker') as HTMLSelectElement;
  expect(trajectoryPicker.value).toBe('all');
  const dayFilterSelect = document.getElementById('daily-day-filter') as HTMLSelectElement;
  expect(dayFilterSelect.value).toBe('all');
  fireEvent.change(dayFilterSelect, { target: { value: 'peak' } });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  fireEvent.change(dayFilterSelect, { target: { value: '5' } });
  expect(screen.getAllByRole('article')).toHaveLength(1);
  fireEvent.change(dayFilterSelect, { target: { value: 'all' } });
  expect(screen.getAllByRole('article')).toHaveLength(15);

  fireEvent.click(within(screen.getAllByRole('article')[1]).getByText('Why this outlook?'));
  expect(within(screen.getAllByRole('article')[1]).getAllByText('91%').length).toBeGreaterThan(0);
  expect(within(screen.getAllByRole('article')[1]).getByText('Flash Flood')).toBeTruthy();
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
  expect(screen.getAllByRole('article')).toHaveLength(15);
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
