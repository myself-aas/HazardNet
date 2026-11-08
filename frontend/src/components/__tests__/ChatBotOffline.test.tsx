/**
 * The floating AI Advisor widget and the /assistant page share one on-device
 * path, so the two surfaces cannot disagree about what an offline answer is.
 *
 * Before this fallback existed the widget dead-ended: with no network it showed
 * "There was an error communicating with the AI. Please try again later." even
 * though the knowledge base ships in the bundle and could answer. These tests
 * pin the fallback, and assert the turn is labelled "Answered via on-device" so
 * a reader is never shown a local answer dressed up as a live one.
 *
 * The disclosure strings asserted here are the ones onDeviceAssistant.ts emits;
 * they were read from that module rather than written from memory.
 */
import '@testing-library/jest-dom';
/// <reference types="jest" />
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatBot from '../ChatBot';

const DEAD_END = 'There was an error communicating with the AI';
const DISCLOSURE = /HazardNet could not be reached/i;

describe('ChatBot on-device fallback', () => {
  let originalFetch: unknown;
  let onlineSpy: jest.SpyInstance;

  const openWidgetAndAsk = async (question: string) => {
    render(<ChatBot />);
    const launcher = await screen.findByLabelText(/open ai advisor chat/i);
    const textarea = document.getElementById('chat-bar-input') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea, { target: { value: question } });
    fireEvent.submit(launcher.closest('form') as HTMLFormElement);
  };

  beforeEach(() => {
    // jsdom does not implement scrollIntoView, which the widget calls on every
    // message. Without this the render throws before any assertion runs.
    Element.prototype.scrollIntoView = jest.fn();

    // Every endpoint the widget touches is irrelevant here; make them all fail
    // loudly rather than silently resolve. jsdom ships no `fetch`, so it has to
    // be defined rather than spied on.
    originalFetch = (global as { fetch?: unknown }).fetch;
    (global as { fetch?: unknown }).fetch = jest.fn(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    // Silence geolocation: jsdom has no implementation and the widget treats a
    // missing one as optional.
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  });

  afterEach(() => {
    (global as { fetch?: unknown }).fetch = originalFetch;
    onlineSpy?.mockRestore();
    jest.restoreAllMocks();
  });

  it('answers from the bundled corpus when the browser is offline, instead of dead-ending', async () => {
    onlineSpy = jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await openWidgetAndAsk('What should I do in the first 48 hours after a flash flood?');

    expect(await screen.findByText(DISCLOSURE)).toBeInTheDocument();
    // The disclosure must say the answer is not current, not merely local.
    expect(
      screen.getByText(/does not tell you what is in force right now/i),
    ).toBeInTheDocument();
    // ...and the old dead end must be gone.
    expect(screen.queryByText(new RegExp(DEAD_END))).not.toBeInTheDocument();
  });

  it('labels the offline turn "Answered via on-device"', async () => {
    onlineSpy = jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await openWidgetAndAsk('Which agency issues cyclone warnings in Bangladesh?');

    expect(await screen.findByText(/answered via on-device/i)).toBeInTheDocument();
  });

  it('falls back to the bundled corpus when the server is unreachable while online', async () => {
    onlineSpy = jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    // fetch already rejects for every call (beforeEach), which is exactly the
    // "server is down" case.

    await openWidgetAndAsk('What are the national disaster helplines?');

    expect(await screen.findByText(DISCLOSURE)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(DEAD_END))).not.toBeInTheDocument();
  });

  it('cites real corpus documents rather than inventing guidance', async () => {
    onlineSpy = jest.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    await openWidgetAndAsk('What should I do in the first 48 hours after a flash flood?');
    await screen.findByText(DISCLOSURE);

    // These are titles and authorities quoted verbatim out of the corpus;
    // nothing else in the widget can produce them.
    await waitFor(() => {
      const text = document.body.textContent || '';
      expect(text).toMatch(/First 48 hours: the action that matters most for each hazard/);
      expect(text).toMatch(/harvest-early decision/);
      expect(text).toMatch(/Department of Agricultural Extension/);
    });
  });
});
