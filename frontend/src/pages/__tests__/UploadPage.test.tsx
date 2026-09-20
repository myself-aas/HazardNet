import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import UploadPage from '../UploadPage';
import { VALID_STORED_FORECAST } from '../../lib/__tests__/fixtures/storedForecast';
import { resetLanguageForTests } from '../../lib/i18n';

expect.extend(toHaveNoViolations);

const originalFetch = global.fetch;

function renderLookup(path = '/upload') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetLanguageForTests('en');
  global.fetch = originalFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('initial page explains how to begin and has no nested main', () => {
  const view = renderLookup();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('District forecast lookup');
  expect(screen.getByTestId('stored-forecast-idle')).toHaveTextContent('Choose a district and horizon');
  expect(view.container.querySelectorAll('main')).toHaveLength(0);
  expect(screen.getByLabelText('District')).toBeInTheDocument();
  expect(screen.getByLabelText('Horizon')).toBeInTheDocument();
});

test('URL district and horizon load without waiting for another submit', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ...VALID_STORED_FORECAST,
      inference: { served_from: 'stored-forecast', model_version: null },
    }),
  }) as unknown as typeof fetch;

  renderLookup('/upload?district=dhaka&horizon=7_days');
  expect(await screen.findByTestId('stored-forecast-ready')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/predict',
    expect.objectContaining({ body: JSON.stringify({ districtId: 'dhaka', horizon: '7_days' }) }),
  );
});

test('successful load shows dated stored forecast, not a live claim', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ...VALID_STORED_FORECAST,
      inference: { served_from: 'stored-forecast', model_version: null },
    }),
  }) as unknown as typeof fetch;

  renderLookup();
  fireEvent.click(screen.getByRole('button', { name: /load stored forecast/i }));
  expect(await screen.findByTestId('stored-forecast-ready')).toBeInTheDocument();
  expect(screen.getByText(/As of 20 September 2026/)).toBeInTheDocument();
  expect(screen.queryByText(/live firestore/i)).not.toBeInTheDocument();
});

test('HTTP 404 is no stored coverage', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch;
  renderLookup();
  fireEvent.click(screen.getByRole('button', { name: /load stored forecast/i }));
  expect(await screen.findByTestId('stored-forecast-uncovered')).toHaveTextContent('No stored coverage');
});

test('HTTP 500 is an error with retry, not uncovered', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;
  renderLookup();
  fireEvent.click(screen.getByRole('button', { name: /load stored forecast/i }));
  expect(await screen.findByTestId('stored-forecast-error', {}, { timeout: 4000 })).toHaveTextContent(
    'Stored forecast could not be loaded',
  );
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  expect(screen.queryByTestId('stored-forecast-uncovered')).not.toBeInTheDocument();
});

test('changing district clears the previous result before a new request', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ...VALID_STORED_FORECAST,
      inference: { served_from: 'stored-forecast', model_version: null },
    }),
  }) as unknown as typeof fetch;

  renderLookup();
  fireEvent.click(screen.getByRole('button', { name: /load stored forecast/i }));
  expect(await screen.findByTestId('stored-forecast-ready')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('District'), { target: { value: 'kurigram' } });
  expect(screen.getByTestId('stored-forecast-idle')).toBeInTheDocument();
  expect(screen.queryByTestId('stored-forecast-ready')).not.toBeInTheDocument();
});

test('Bengali idle copy is complete', () => {
  resetLanguageForTests('bn');
  renderLookup();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('জেলার পূর্বাভাস খুঁজুন');
  expect(screen.getByTestId('stored-forecast-idle')).toHaveTextContent('একটি জেলা ও সময়সীমা বেছে নিন');
});

test('has no axe violations on the idle lookup', async () => {
  const view = renderLookup();
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  expect(await axe(view.container)).toHaveNoViolations();
});

test('has no axe violations on the idle lookup in Bengali', async () => {
  resetLanguageForTests('bn');
  const view = renderLookup();
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument());
  expect(await axe(view.container)).toHaveNoViolations();
});
