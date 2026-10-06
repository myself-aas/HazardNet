import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPLE_SEVERITY } from '@hazardnet/design-system';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrafficLightAlertCard } from '../TrafficLightAlertCard';
import { setLanguage } from '../../../lib/i18n';
import { SPEECH_RATE } from '../../../lib/tts';
import type { ForecastRow } from '../../../lib/forecasts';

/**
 * The traffic-light card's contract.
 *
 * The assertions that matter are the ones about not misleading a reader: an unread forecast
 * must not render as a green NORMAL, a tier must never be carried by colour alone, and the
 * spoken sentence must be in the language on screen.
 */

const row = (overrides: Partial<ForecastRow> = {}): ForecastRow => ({
  district_id: 1,
  district_name: 'Sunamganj',
  horizon: '7_days',
  hazard_type: 'Flash Flood',
  severity_score: 0.62,
  confidence: 0.93,
  target_date: '2026-10-10',
  prediction_date: '2026-10-03',
  ...overrides,
});

/** The card links to `/advisories` for the agency protocols, so it needs a router. */
const renderCard = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

afterEach(() => {
  act(() => setLanguage('en'));
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
  delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
});

describe('TrafficLightAlertCard · the interpretation contract', () => {
  it('leads with the tier, not the severity decimal', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WARNING' })} />);
    expect(screen.getByTestId('traffic-light-card')).toHaveAttribute('data-tier', 'WARNING');
    expect(screen.getByText('Warning')).toBeInTheDocument();
    // The percentage is metadata; it is present but not the headline.
    expect(screen.getByText('93%')).toBeInTheDocument();
    expect(screen.queryByText(/0\.62/)).not.toBeInTheDocument();
  });

  it('names the hazard in words and gives it an icon, never colour alone', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'SEVERE' })} />);
    expect(screen.getByText('Flash Flood')).toBeInTheDocument();
    // A glyph, not a swatch: the tier word and the icon both carry the meaning.
    expect(screen.getByTestId('traffic-light-card').querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Severe')).toBeInTheDocument();
  });

  it('takes the accent from the published tier token, not from a colour chosen here', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'SEVERE' })} />);
    const style = screen.getByTestId('traffic-light-card').getAttribute('style') ?? '';
    // The same value `AlertLevelLegend` paints its swatches with, so a tier is one colour
    // everywhere it appears. The token is a hex constant; what matters is that the component
    // does not choose its own.
    expect(style).toContain(APPLE_SEVERITY.veryHigh.text);
  });

  it('holds no colour literal of its own', () => {
    const source = readFileSync(
      join(__dirname, '..', 'TrafficLightAlertCard.tsx'),
      'utf8',
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(code).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it('reads confidence as a bin, with the number as its support', () => {
    renderCard(
      <TrafficLightAlertCard
        districtName="Sunamganj"
        row={row({ advisory_tier: 'WATCH', confidence: 0.72 })}
      />,
    );
    expect(screen.getByText('Possible')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
  });
});

describe('TrafficLightAlertCard · a baseline is a reading, an unread file is not', () => {
  it('renders NORMAL with the run timestamp when the artifact was read and is quiet', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="baseline" asOf="2026-10-05T06:00:00Z" />);
    const card = screen.getByTestId('traffic-light-card');
    expect(card).toHaveAttribute('data-state', 'baseline');
    expect(card).toHaveAttribute('data-tier', 'NORMAL');
    expect(screen.getByTestId('advisory-baseline')).toHaveTextContent('No hazard above baseline');
    expect(screen.getByTestId('advisory-baseline').textContent).toMatch(/2026/);
  });

  it('never claims a tier when the artifact could not be read', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="unread" />);
    const card = screen.getByTestId('traffic-light-card');
    expect(card).toHaveAttribute('data-state', 'unread');
    // The green NORMAL badge is the failure mode this guards: silence read as safety.
    expect(card).not.toHaveAttribute('data-tier');
    expect(screen.queryByText('Normal')).not.toBeInTheDocument();
    expect(screen.getByTestId('advisory-unread')).toHaveTextContent(/could not be read/i);
  });

  it('defaults to unread when handed no row and no state, not to baseline', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" />);
    expect(screen.getByTestId('traffic-light-card')).toHaveAttribute('data-state', 'unread');
  });

  it('marks the accent as an absence when unread, so the two states differ on sight', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="unread" />);
    const style = screen.getByTestId('traffic-light-card').getAttribute('style') ?? '';
    expect(style).toContain('dashed');
  });
});

describe('TrafficLightAlertCard · Bangla first, English available', () => {
  it('leads with the Bengali district name and keeps the English one visible', () => {
    act(() => setLanguage('bn'));
    renderCard(
      <TrafficLightAlertCard
        districtName="Sunamganj"
        districtNameBn="সুনামগঞ্জ"
        row={row({ advisory_tier: 'WARNING' })}
      />,
    );
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading).toHaveTextContent('সুনামগঞ্জ');
    expect(heading.querySelector('[lang="bn"]')).toHaveTextContent('সুনামগঞ্জ');
    expect(heading.querySelector('[lang="en"]')).toHaveTextContent('Sunamganj');
  });

  it('translates the hazard and keeps the CSV class name beside it', () => {
    act(() => setLanguage('bn'));
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WARNING' })} />);
    expect(screen.getByText('আকস্মিক বন্যা')).toBeInTheDocument();
    expect(screen.getByText('(Flash Flood)')).toBeInTheDocument();
  });

  it('renders the tier in Bengali as well', () => {
    act(() => setLanguage('bn'));
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'SEVERE' })} />);
    expect(screen.getByText('গুরুতর')).toBeInTheDocument();
  });
});

describe('TrafficLightAlertCard · provenance the reader is allowed to see', () => {
  it('says when the tier was derived on the device', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row()} />);
    expect(screen.getByText(/derived on this device/i)).toBeInTheDocument();
  });

  it('does not say it when the pipeline published the tier', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WATCH' })} />);
    expect(screen.queryByText(/derived on this device/i)).not.toBeInTheDocument();
  });

  it('shows the physics badge only when a physics check actually moved the call', () => {
    const { unmount } = renderCard(
      <TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WATCH', physics_override: true })} />,
    );
    expect(screen.getByText('Physics-grounded')).toBeInTheDocument();
    unmount();
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WATCH' })} />);
    expect(screen.queryByText('Physics-grounded')).not.toBeInTheDocument();
  });
});

describe('TrafficLightAlertCard · the spoken advisory', () => {
  /** Minimal stand-in for the two Web Speech API globals. */
  function stubSpeech() {
    const spoken: Array<{ text: string; lang: string; rate: number }> = [];
    (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function (
      this: { text: string; lang: string; rate: number },
      text: string,
    ) {
      this.text = text;
      this.lang = '';
      this.rate = 0;
    } as unknown as typeof SpeechSynthesisUtterance;
    (window as unknown as Record<string, unknown>).speechSynthesis = {
      speak: (utterance: { text: string; lang: string; rate: number }) => spoken.push({ ...utterance }),
      cancel: () => {},
      getVoices: () => [],
    };
    return spoken;
  }

  it('offers no control at all when the device cannot speak', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WARNING' })} />);
    expect(screen.queryByRole('button', { name: /read this advisory aloud/i })).not.toBeInTheDocument();
  });

  it('speaks the card in the language on screen, at the published rate', () => {
    const spoken = stubSpeech();
    act(() => setLanguage('bn'));
    renderCard(
      <TrafficLightAlertCard
        districtName="Sunamganj"
        districtNameBn="সুনামগঞ্জ"
        row={row({ advisory_tier: 'SEVERE' })}
      />,
    );
    // The accessible name is the Bengali label; the English one would be a bug here.
    fireEvent.click(screen.getByRole('button', { name: 'এই সতর্কতা শুনুন' }));

    expect(spoken).toHaveLength(1);
    expect(spoken[0].lang).toBe('bn-BD');
    expect(spoken[0].rate).toBe(SPEECH_RATE);
    expect(spoken[0].text).toContain('সুনামগঞ্জ');
    expect(spoken[0].text).toContain('গুরুতর');
    expect(spoken[0].text).toContain('আকস্মিক বন্যা');
  });

  it('uses English in English, and still says the tier out loud', () => {
    const spoken = stubSpeech();
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WARNING' })} />);
    fireEvent.click(screen.getByRole('button', { name: /read this advisory aloud/i }));
    expect(spoken[0].lang).toBe('en');
    expect(spoken[0].text).toContain('Warning');
    expect(spoken[0].text).toContain('Next 7 days');
  });

  it('offers nothing to listen to on an unread card', () => {
    stubSpeech();
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="unread" />);
    expect(screen.queryByRole('button', { name: /advisory aloud/i })).not.toBeInTheDocument();
  });
});

describe('TrafficLightAlertCard · the advice layer', () => {
  it('tells the reader what to do, not only what the model thinks', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'SEVERE' })} />);
    const advice = screen.getByTestId('advisory-advice');
    // The tier's own instruction and the hazard's protective action, in that order.
    expect(advice).toHaveTextContent(/Act now/i);
    expect(advice).toHaveTextContent(/high ground/i);
  });

  it('scales the instruction with the tier', () => {
    const { unmount } = renderCard(
      <TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WATCH' })} />,
    );
    expect(screen.getByTestId('advisory-advice')).toHaveTextContent(/Stay aware/i);
    unmount();
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="baseline" />);
    expect(screen.getByTestId('advisory-advice')).toHaveTextContent(/Normal farm work/i);
  });

  it('hands off to the agency protocols rather than restating them', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'WARNING' })} />);
    expect(screen.getByRole('link', { name: /full protocol/i })).toHaveAttribute('href', '/advisories');
  });

  it('still gives advice on a baseline card, where "carry on" is the decision', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="baseline" />);
    expect(screen.getByTestId('advisory-advice')).toBeInTheDocument();
  });

  it('offers no advice on an unread card, where there is nothing to act on', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="unread" />);
    expect(screen.queryByTestId('advisory-advice')).not.toBeInTheDocument();
  });

  it('speaks the advice as well, for a listener who is not reading', () => {
    const spoken: string[] = [];
    (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = function (
      this: { text: string; lang: string; rate: number },
      text: string,
    ) {
      this.text = text;
      this.lang = '';
      this.rate = 0;
    } as unknown as typeof SpeechSynthesisUtterance;
    (window as unknown as Record<string, unknown>).speechSynthesis = {
      speak: (utterance: { text: string }) => spoken.push(utterance.text),
      cancel: () => {},
      getVoices: () => [],
    };

    renderCard(<TrafficLightAlertCard districtName="Sunamganj" row={row({ advisory_tier: 'SEVERE' })} />);
    fireEvent.click(screen.getByRole('button', { name: /read this advisory aloud/i }));

    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toContain('Advice:');
    expect(spoken[0]).toContain('high ground');
    // cleanup so the stub cannot leak into the next file's tests
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
  });
});

describe('TrafficLightAlertCard · a tier is not an alert', () => {
  it('says so when the row is above the ceiling and still needs a duty officer', () => {
    // WARNING and SEVERE require a named reviewer before they are issued
    // (`AUTO_PUBLISH_CEILING = 'WATCH'`). A reader who cannot tell "the model says severe" from
    // "an official warning has been issued" will act on the wrong one.
    renderCard(
      <TrafficLightAlertCard
        districtName="Sunamganj"
        row={row({ advisory_tier: 'SEVERE', requires_review: true })}
      />,
    );
    expect(screen.getByTestId('advisory-review')).toHaveTextContent(/not yet an official alert/i);
  });

  it('does not claim a review is pending for a tier the pipeline may publish unreviewed', () => {
    renderCard(
      <TrafficLightAlertCard
        districtName="Sunamganj"
        row={row({ advisory_tier: 'WATCH', requires_review: false })}
      />,
    );
    expect(screen.queryByTestId('advisory-review')).not.toBeInTheDocument();
  });

  it('shows nothing about review on an unread card, where there is no row', () => {
    renderCard(<TrafficLightAlertCard districtName="Sunamganj" state="unread" />);
    expect(screen.queryByTestId('advisory-review')).not.toBeInTheDocument();
  });
});
