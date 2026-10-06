/**
 * Spoken advisories — text-to-speech for people who cannot read the card.
 *
 * Framework-free on purpose: the web app calls `speak()`, and the same module works
 * unchanged in a plain script, a service worker or the native shell's webview. There is
 * no React in here and no state; a caller that needs to show a "speaking" affordance
 * passes `onEnd`.
 *
 * Three rules, and each exists because the other version of it misleads someone:
 *
 *   1. **Silence is a valid answer, a crash is not.** Every entry point feature-detects
 *      and returns `false` rather than throwing. A device without `speechSynthesis`
 *      (most cheap Android browsers, all `jsdom` tests) must degrade to the written card,
 *      not to a broken button. This module never calls `alert()`.
 *   2. **The voice is chosen with the text's language, not the device's.** `utterance.lang`
 *      is set from the caller's language, and a `bn-BD` voice is preferred when one is
 *      installed. A Bengali sentence spoken by an English voice is not an accessibility
 *      feature; it is noise.
 *   3. **One utterance at a time.** Speaking a second advisory cancels the first, so the
 *      list cannot talk over itself when a reader taps two cards in a row.
 *
 * On-device vs remote: the Web Speech API uses whatever the platform provides, which on
 * Android is usually an on-device engine and on iOS is on-device for `bn-BD`. Nothing here
 * sends text to a server, which is the point — a district name and a hazard type are a
 * location and a risk, and they should not leave the device to be read aloud.
 */

import { languageTag, type Language } from './i18n';

/** The slice of the Web Speech API this module uses, so it can be typed without `dom.speech`. */
interface SpeechSynthesisLike {
  speak: (utterance: unknown) => void;
  cancel: () => void;
  getVoices?: () => Array<{ lang?: string }>;
}

interface UtteranceLike {
  lang: string;
  rate: number;
  pitch: number;
  text: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

type UtteranceCtor = new (text: string) => UtteranceLike;

function synthesis(): SpeechSynthesisLike | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as { speechSynthesis?: SpeechSynthesisLike }).speechSynthesis;
  return value && typeof value.speak === 'function' ? value : null;
}

function Utterance(): UtteranceCtor | null {
  if (typeof window === 'undefined') return null;
  const value = (window as unknown as { SpeechSynthesisUtterance?: UtteranceCtor })
    .SpeechSynthesisUtterance;
  return typeof value === 'function' ? value : null;
}

/** Can this device read an advisory aloud? Checked before rendering a Listen control. */
export function speechSupported(): boolean {
  return synthesis() !== null && Utterance() !== null;
}

/**
 * The BCP-47 tag to speak in. Shares `languageTag` with `<html lang>` on purpose: the
 * text on screen and the text in the reader's ear must be the same language, and a second
 * mapping is a second place for them to disagree.
 */
export function spokenLanguageFor(language: Language): string {
  return languageTag(language);
}

/**
 * Rate. Slightly under the platform default, because these sentences carry a place name
 * and a hazard name and the listener is often on a phone in the open.
 *
 * Pitch stays at the platform default: a lowered pitch reads as "manly voice" on some
 * engines and distorts Bengali tone markers on others, and there is nothing to gain.
 */
export const SPEECH_RATE = 0.9;

/** True when a voice for this language is actually installed (best effort; may be empty early). */
export function hasVoiceFor(language: Language): boolean {
  const available = synthesis()?.getVoices?.() ?? [];
  if (available.length === 0) return true; // Some engines populate the list only after first use.
  const tag = spokenLanguageFor(language).toLowerCase();
  const prefix = tag.split('-')[0];
  return available.some((voice) => (voice.lang ?? '').toLowerCase().startsWith(prefix));
}

export interface SpeakOptions {
  language: Language;
  /** Called when the utterance finishes or fails — a caller's "stop" affordance hangs off this. */
  onEnd?: () => void;
  rate?: number;
}

/**
 * Read `text` aloud. Returns `false` when the device cannot, having done nothing.
 *
 * The caller is responsible for translating `text` first: this module speaks what it is
 * given, so a Bengali reader hears Bengali digits (`formatNumber`) and a Bengali hazard
 * name, because those were substituted upstream.
 */
export function speak(text: string, options: SpeakOptions): boolean {
  const engine = synthesis();
  const Ctor = Utterance();
  const body = text.trim();
  if (!engine || !Ctor || body.length === 0) return false;

  cancelSpeech();

  const utterance = new Ctor(body);
  utterance.lang = spokenLanguageFor(options.language);
  utterance.rate = options.rate ?? SPEECH_RATE;
  utterance.pitch = 1;

  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    options.onEnd?.();
  };
  utterance.onend = done;
  utterance.onerror = done;

  engine.speak(utterance);
  return true;
}

/** Stop anything currently being spoken. Safe to call when nothing is speaking. */
export function cancelSpeech(): void {
  const engine = synthesis();
  if (!engine) return;
  try {
    engine.cancel();
  } catch {
    // Some engines throw if cancelled before the first utterance; nothing to recover.
  }
}
