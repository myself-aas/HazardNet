import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatusVerdict } from '../StatusVerdict';
import { setLanguage } from '../../../lib/i18n';

/**
 * The verdict's whole job is to answer one question without overstating what is known, so
 * these tests are about the three states and the line between them.
 */

const renderVerdict = (props: Partial<React.ComponentProps<typeof StatusVerdict>> = {}) =>
  render(
    <MemoryRouter>
      <StatusVerdict
        published={0}
        assessed={74}
        withheld={74}
        loading={false}
        unread={false}
        generatedAt="2026-09-17T21:08:14.217Z"
        {...props}
      />
    </MemoryRouter>,
  );

afterEach(() => act(() => setLanguage('en')));

describe('StatusVerdict · three answers, no fourth', () => {
  it('answers "quiet" when nothing is published, and shows the arithmetic behind it', () => {
    renderVerdict();
    const verdict = screen.getByTestId('status-verdict');
    expect(verdict).toHaveAttribute('data-state', 'quiet');
    expect(screen.getByTestId('verdict-body')).toHaveTextContent(
      /Nothing is published above the watch threshold/i,
    );
    // "Nothing published" and "nothing looked at" must not read the same.
    expect(screen.getByTestId('verdict-detail')).toHaveTextContent(/74 district forecasts assessed/);
    expect(screen.getByTestId('verdict-detail')).toHaveTextContent(/74 held for review/);
  });

  it('never claims every district is safe in the quiet state', () => {
    renderVerdict();
    const verdict = screen.getByTestId('status-verdict');
    expect(verdict.textContent).not.toMatch(/all districts are safe|no hazard|every district is safe/i);
  });

  it('answers "active" with the count and the worst level', () => {
    renderVerdict({ published: 2, worstLevel: 'SEVERE' });
    const verdict = screen.getByTestId('status-verdict');
    expect(verdict).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('verdict-body')).toHaveTextContent(/2 district advisories are published/i);
    // The level is carried by a word as well as by the badge colour.
    expect(screen.getByText('Severe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see the advisories/i })).toHaveAttribute('href', '/alerts');
  });

  it('answers "unknown" when the artifact could not be read, and does not imply safety', () => {
    renderVerdict({ unread: true, assessed: null, withheld: null });
    const verdict = screen.getByTestId('status-verdict');
    expect(verdict).toHaveAttribute('data-state', 'unknown');
    expect(screen.getByTestId('verdict-body')).toHaveTextContent(/could not be read/i);
    expect(screen.getByTestId('verdict-body')).toHaveTextContent(/unknown on this load, not confirmed safe/i);
    expect(screen.getByRole('link', { name: /why, and what to do/i })).toHaveAttribute('href', '/status');
  });

  it('mid-read it does not assert an answer, and shows no timestamp to imply one', () => {
    renderVerdict({ loading: true, assessed: null, withheld: null });
    const verdict = screen.getByTestId('status-verdict');
    expect(verdict).toHaveAttribute('data-state', 'reading');
    expect(screen.queryByTestId('verdict-body')).not.toHaveTextContent(/nothing is published/i);
    expect(screen.queryByTestId('verdict-detail')).not.toBeInTheDocument();
  });

  it('an unread file shows no timestamp either, which would look like a reading', () => {
    renderVerdict({ unread: true, assessed: null, withheld: null });
    expect(screen.queryByTestId('verdict-detail')).not.toBeInTheDocument();
  });

  it('does not open a second live region, because the strip it lives in is the announcer', () => {
    renderVerdict();
    const verdict = screen.getByTestId('status-verdict');
    expect(verdict).not.toHaveAttribute('role', 'status');
    expect(verdict).not.toHaveAttribute('aria-live');
    // Exactly one status region exists in this render: the host, when there is one.
    expect(screen.queryAllByRole('status')).toHaveLength(0);
  });
});

describe('StatusVerdict · Bangla', () => {
  it('answers in Bengali when the page is in Bengali', () => {
    act(() => setLanguage('bn'));
    renderVerdict();
    expect(screen.getByTestId('verdict-body')).toHaveTextContent(
      'সতর্ক দৃষ্টির সীমার উপরে কোনো সতর্কবার্তা প্রকাশিত হয়নি।',
    );
  });

  it('says "unknown, not safe" in Bengali too, which is the sentence that matters most', () => {
    act(() => setLanguage('bn'));
    renderVerdict({ unread: true, assessed: null, withheld: null });
    expect(screen.getByTestId('verdict-body')).toHaveTextContent('পড়া যায়নি');
    expect(screen.getByTestId('verdict-body')).toHaveTextContent('নিশ্চিত নিরাপদ নয়');
  });
});
