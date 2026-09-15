import { LegacyDistrictRedirect } from '../../components/LegacyDistrictRedirect';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DistrictDetailPage } from '../DistrictDetailPage';
import { useForecasts } from '../../hooks/useForecasts';
import { Contact } from '../Contact';
import { DistrictComparison } from '../../components/DistrictComparison';
import { AccessibleDialog } from '../../components/ui/AccessibleDialog';
import { downloadDraft } from '../../lib/hazardUx';
jest.mock('../../hooks/useForecasts', () => ({ useForecasts: jest.fn() }));
jest.mock('../../lib/hazardUx', () => ({ ...jest.requireActual('../../lib/hazardUx'), downloadDraft: jest.fn() }));
const row = { district_id: 1, district_name: 'Gazipur', horizon: '15_days', hazard_type: 'Flood', severity_score: .72, confidence: .8, prediction_date: '2026-09-15', target_date: '2026-09-30', source_kind: 'snapshot' };
const refetch = jest.fn();
function mount(path = '/forecast/district/gazipur?horizon=15_days') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/forecast/district/:id" element={<DistrictDetailPage />} /><Route path="/district/:id" element={<LegacyDistrictRedirect />} /></Routes></MemoryRouter>);
}
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); (useForecasts as jest.Mock).mockReturnValue({ data: [row], isPending: false, refetch }); });
it('retains period in summary, guidance and sharing; displays honest offline status', () => {
  mount(); expect(useForecasts).toHaveBeenCalledWith('15_days');
  expect(screen.getByText(/Offline reference copy/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'What to do' })).toHaveAttribute('href', '/advisories/crops?district=Gazipur&horizon=15_days');
  expect((screen.getByLabelText('Report link') as HTMLInputElement).value).toContain('/forecast/district/gazipur?horizon=15_days');
});
it('never exposes a fake operational dispatch or generated shelter figures', () => {
  mount(); expect(screen.queryByRole('button', { name: /broadcast/i })).not.toBeInTheDocument();
  expect(screen.getByText(/Emergency dispatch is unavailable/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Download unsent draft/i }));
  expect(downloadDraft).toHaveBeenCalledWith(expect.stringContaining('UNSENT DRAFT'));
  expect(screen.queryByText(/99\.8%|38\.4ms|OFFICIAL DISASTER/)).not.toBeInTheDocument();
});
it('persists watchlist by ID and does not seed unchosen districts', () => {
  const view = mount(); expect(screen.getByRole('button', { name: 'Save district' })).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Save district' }));
  expect(JSON.parse(localStorage.getItem('shonchay_saved_districts')!)).toEqual(['gazipur']);
  view.unmount(); mount(); expect(screen.getByRole('button', { name: 'Remove saved district' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Remove saved district' }));
  expect(JSON.parse(localStorage.getItem('shonchay_saved_districts')!)).toEqual([]);
});
it('keeps invalid districts invalid rather than substituting a different district', () => { mount('/forecast/district/not-a-district'); expect(screen.getByRole('heading', { name: 'District not found' })).toBeInTheDocument(); });
it('redirects old QR routes while preserving the period', () => { mount('/district/gazipur?horizon=15_days'); expect(screen.getByRole('heading', { name: 'Gazipur district forecast' })).toBeInTheDocument(); expect(useForecasts).toHaveBeenCalledWith('15_days'); });
it('only announces copy completion after success and offers manual recovery on denial', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) } });
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Copy report link' }));
  await screen.findByText('Could not copy. Select and copy the link below.');
  expect(screen.queryByText('Link copied.')).not.toBeInTheDocument();
  (navigator.clipboard.writeText as jest.Mock).mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Copy report link' })); await screen.findByText('Link copied.');
});
it('refreshes without losing context', () => { mount(); fireEvent.click(screen.getByRole('button', { name: 'Refresh forecast' })); expect(refetch).toHaveBeenCalled(); expect(screen.getByRole('combobox')).toHaveValue('15_days'); });
it('contact downloads an unsent draft and preserves entered observations', () => {
  const { container } = render(<MemoryRouter><Contact /></MemoryRouter>);
  const textarea = container.querySelector('textarea')!;
  fireEvent.change(textarea, { target: { value: 'Observed rising water near the school.' } });
  fireEvent.submit(container.querySelector('form')!);
  expect(downloadDraft).toHaveBeenCalledWith(expect.stringContaining('Observed rising water'));
  expect(textarea).toHaveValue('Observed rising water near the school.');
  expect(screen.getByText(/Nothing was submitted or logged/)).toBeInTheDocument();
});
it('comparison restores explicit URL selections and allows replacing a slot', () => {
  render(<MemoryRouter initialEntries={['/forecast/compare?compare1=gazipur&compare2=dhaka&horizon=15_days']}><DistrictComparison /></MemoryRouter>);
  expect(screen.getByLabelText('District 1')).toHaveValue('gazipur');
  fireEvent.change(screen.getByLabelText('District 2'), { target: { value: 'sylhet' } });
  expect(screen.getByLabelText('District 2')).toHaveValue('sylhet');
});
it('opens a named native dialog and restores the opener on dismissal', async () => {
  HTMLDialogElement.prototype.showModal = jest.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function (this: HTMLDialogElement) { this.removeAttribute('open'); });
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  const onClose = jest.fn(); const view = render(<AccessibleDialog title="Draft" onClose={onClose}><input aria-label="Example field" /></AccessibleDialog>);
  expect(screen.getByRole('dialog', { name: 'Draft' })).toHaveAttribute('open');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(onClose).toHaveBeenCalled(); view.unmount(); await waitFor(() => expect(opener).toHaveFocus()); opener.remove();
});
