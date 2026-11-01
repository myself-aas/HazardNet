/** @jest-environment jsdom */
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DailyOutlookEntry } from '../DailyOutlookEntry';
import { loadDistrictDaily, type DistrictDailyResult } from '../../lib/dailyAdvisories';
import { resetLanguageForTests, setLanguage } from '../../lib/i18n';

jest.mock('../../lib/dailyAdvisories', () => ({
  ...jest.requireActual('../../lib/dailyAdvisories'),
  loadDistrictDaily: jest.fn(),
}));

const mockLoad = loadDistrictDaily as jest.MockedFunction<typeof loadDistrictDaily>;
const base: DistrictDailyResult = {
  status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null,
};
const renderEntry = (districtId?: string) => render(<MemoryRouter>
  <DailyOutlookEntry districtId={districtId} />
</MemoryRouter>);

beforeEach(() => {
  mockLoad.mockReset();
  resetLanguageForTests('en');
});
afterEach(() => setLanguage('en'));

test('links to district selection without guessing a visitor location or fetching an unpublished run', () => {
  renderEntry();
  expect(screen.getByText('Choose a district to check its day-by-day outlook.')).toBeTruthy();
  expect(screen.getByText(/Ongoing research under development.*when available.*daily model run/i)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open the day-by-day district outlook' }).getAttribute('href'))
    .toBe('/districts');
  expect(mockLoad).not.toHaveBeenCalled();
});

test('reads only the public district result, naming its cutoff without mixing in map risk or issued alerts', async () => {
  mockLoad.mockResolvedValue({ ...base, status: 'fresh', source: 'api',
    run: { id: 'synthetic-run', generatedAt: '2026-11-01T10:00:00Z',
      dataCutoff: '2026-11-01T08:00:00Z', expiresAt: '2026-11-02T20:00:00Z', modelVersion: 'test' },
    advisories: [{} as DistrictDailyResult['advisories'][number]],
  });
  renderEntry('kurigram');
  await waitFor(() => expect(screen.getByText(/Published outlook.*Data cutoff/i)).toBeTruthy());
  expect(mockLoad).toHaveBeenCalledWith('Kurigram', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.getByRole('link', { name: /Open the day-by-day district outlook: Kurigram/i })
    .getAttribute('href')).toBe('/forecast/district/kurigram');
  expect(screen.getByText(/separate from map baselines/)).toBeTruthy();
  expect(screen.queryByText(/low risk|severity score|official warning issued/i)).toBeNull();
});

test('leaves an unavailable district unknown, not safe, when the API and public file fail', async () => {
  mockLoad.mockResolvedValue(base);
  renderEntry('kurigram');
  expect(await screen.findByText(/Unknown does not mean safe/)).toBeTruthy();
  expect(screen.getByRole('link', { name: /Kurigram/ }).getAttribute('href'))
    .toBe('/forecast/district/kurigram');
});

test('keeps the stale state separate in Bangla and does not invent a current hazard', async () => {
  setLanguage('bn');
  mockLoad.mockResolvedValue({ ...base, status: 'stale', source: 'snapshot' });
  renderEntry('kurigram');
  expect(await screen.findByText(/হালনাগাদের ৩৬ ঘণ্টার সীমা পেরিয়েছে/)).toBeTruthy();
  expect(screen.getByText(/চলমান গবেষণা প্রকল্প.*দৈনিক মডেল রানের ফল/)).toBeTruthy();
  expect(screen.getByRole('link', { name: /জেলার দিনভিত্তিক পূর্বাভাস খুলুন/ })).toBeTruthy();
  expect(screen.queryByText('Published outlook')).toBeNull();
});

test('abort prevents a late district response from replacing a different district', async () => {
  let finish!: (result: DistrictDailyResult) => void;
  mockLoad.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  mockLoad.mockResolvedValueOnce(base);
  const view = renderEntry('kurigram');
  view.rerender(<MemoryRouter><DailyOutlookEntry districtId="dhaka" /></MemoryRouter>);
  await act(async () => finish({ ...base, status: 'fresh' }));
  expect(await screen.findByRole('link', { name: /Open the day-by-day district outlook: Dhaka/ }))
    .toHaveAttribute('href', '/forecast/district/dhaka');
  expect(screen.getByText(/Unknown does not mean safe/)).toBeTruthy();
});
