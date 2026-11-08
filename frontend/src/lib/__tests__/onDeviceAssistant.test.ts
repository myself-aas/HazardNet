/**
 * The on-device assistant (frontend/src/lib/onDeviceAssistant.ts).
 *
 * Covers: the response shape the page depends on, the disclosure that no live data
 * was read, that every planned tool call is reported as skipped rather than silently
 * dropped, that citations are only documents actually retrieved, that the mechanical
 * prose does not trip the reviewer, and the honest no-match path.
 *
 * This runs the real `@hazardnet/core` retrieval over the compiled 18-document
 * corpus, so it also pins that the frontend and the server share one implementation.
 */
import { answerOnDevice } from '../onDeviceAssistant';

describe('on-device assistant', () => {
  it('returns the same response shape the page renders for a server turn', async () => {
    const result = await answerOnDevice('What should I do in a flash flood?', 'Sunamganj');

    expect(typeof result.answer).toBe('string');
    expect(result.answer.length).toBeGreaterThan(0);
    expect(Array.isArray(result.retrieved_sources)).toBe(true);
    expect(result.provider_source).toBe('on-device');

    expect(result.agent).toMatchObject({ enabled: false, tools_called: [] });
    expect(typeof result.agent.goal).toBe('string');
    expect(Array.isArray(result.agent.intents)).toBe(true);
    expect(Array.isArray(result.agent.steps)).toBe(true);
    expect(result.agent.review).toHaveProperty('ok');
    expect(Array.isArray(result.agent.review.flags)).toBe(true);

    expect(result.retrieval).toEqual(
      expect.objectContaining({
        engine: expect.any(String),
        applied: expect.any(Boolean),
        reason: expect.any(String),
        candidates: expect.any(Number),
        cited: expect.any(Number),
        omitted: expect.any(Number),
      }),
    );
  });

  it('says plainly that it is on device and that no live data was read', async () => {
    const result = await answerOnDevice('Is there a flood warning for Sunamganj?');

    expect(result.answer).toMatch(/produced on your device/i);
    expect(result.answer).toMatch(/no live alert, outlook or weather data was read/i);
    expect(result.agent.enabled).toBe(false);
    expect(result.agent.reason).toMatch(/no network/i);
  });

  it('reports every planned tool call as skipped, with a reason', async () => {
    const result = await answerOnDevice('Is there a flood warning for Sunamganj?', 'Sunamganj');

    // The plan for an alerts question includes live reads; none of them can run here.
    expect(result.agent.steps.length).toBeGreaterThan(0);
    for (const step of result.agent.steps) {
      expect(step.ok).toBe(false);
      expect(step.skipped).toMatch(/on your device/i);
      expect(step.tool).toBeTruthy();
      expect(step.digest).toBeNull();
      expect(step.error).toBeNull();
    }
    // Nothing was called, so nothing may be claimed as called.
    expect(result.agent.tools_called).toEqual([]);
  });

  it('carries the district the reader typed into the plan', async () => {
    const result = await answerOnDevice('What should I do?', 'Chittagong');

    // Alias resolution is the server planner's, shared not copied.
    expect(result.agent.district).toBe('Chattogram');
    expect(result.answer).toMatch(/Chattogram/);
  });

  it('cites only documents it actually retrieved, and never more than it quotes', async () => {
    const result = await answerOnDevice('What should I do in the first 48 hours after a flash flood?');

    expect(result.retrieved_sources.length).toBeGreaterThan(0);
    expect(result.retrieved_sources.length).toBeLessThanOrEqual(4);
    expect(result.retrieval.cited).toBe(result.retrieved_sources.length);
    expect(result.retrieval.candidates).toBeGreaterThanOrEqual(result.retrieved_sources.length);
    expect(result.retrieval.omitted).toBe(result.retrieval.candidates - result.retrieved_sources.length);

    for (const source of result.retrieved_sources) {
      expect(source.id).toBeTruthy();
      expect(source.title).toBeTruthy();
      // Each cited document is named in the answer prose.
      expect(result.answer).toContain(source.title);
    }
  });

  it('does not invent an engine: it reports what retrieval says ran', async () => {
    const result = await answerOnDevice('cold wave protection for seedlings');

    // No embedding key on device, so the lexical engine is what actually ran.
    expect(result.retrieval.engine).toBe('bm25');
    expect(result.retrieval.applied).toBe(false);
    expect(result.retrieval.reason).toBeTruthy();
  });

  it('produces prose clean enough that the reviewer does not flag it', async () => {
    const result = await answerOnDevice('What should I do in the first 48 hours after a flash flood?');

    // The composition is mechanical (fixed disclosure plus quoted document fields), so
    // it must not trip the same reviewer the server runs. If this ever fails, the prose
    // has started asserting something the cited documents do not contain.
    expect(result.agent.review.ok).toBe(true);
    expect(result.agent.review.flags).toEqual([]);
  });

  it('says so when nothing matches, instead of inventing guidance', async () => {
    const result = await answerOnDevice('zzz qqq xxvkwd unrelated gibberish string');

    expect(result.retrieved_sources).toEqual([]);
    expect(result.retrieval.cited).toBe(0);
    expect(result.answer).toMatch(/nothing in the stored knowledge base matched/i);
    // Still discloses that no live data was read.
    expect(result.answer).toMatch(/no live alert, outlook or weather data was read/i);
  });

  it('retrieves in Bengali through the shared lexer', async () => {
    const result = await answerOnDevice('বন্যা হলে আমি কি করব');

    // The Indic-aware tokenizer is the same one the server uses; a regression there
    // returned zero hits for every Bengali query.
    expect(result.retrieved_sources.length).toBeGreaterThan(0);
  });

  it('keeps the emergency numbers in the answer when guidance was found', async () => {
    const result = await answerOnDevice('What should I do in the first 48 hours after a flash flood?');

    expect(result.answer).toContain('999');
    expect(result.answer).toContain('16123');
  });
});
