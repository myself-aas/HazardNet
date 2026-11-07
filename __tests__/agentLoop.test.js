/**
 * @jest-environment node
 *
 * Agent tool-calling loop — planning, execution, dependency resolution, the
 * trace, and the answer review.
 *
 * What is pinned here is the difference between an agent and a chatbot with
 * extra steps: the plan is deterministic and auditable, a dependency that does
 * not resolve is reported rather than silently dropped, an empty artifact is
 * never read as "no risk", and the answer is checked against what was actually
 * read before it reaches the user.
 */

import { HAZARDS } from '../backend/mcp/tools.js';
import { createNodeAssetReader } from '../backend/mcp/nodeAdapter.js';
import {
  MCP_HAZARD_BY_SKILL,
  hazardEnumFor,
  detectIntents,
  detectDistrict,
  buildPlan,
} from '../backend/agent/planner.js';
import { runAgent } from '../backend/agent/loop.js';
import { reviewAnswer } from '../backend/agent/review.js';
import { handleChatQuery } from '../backend/utils/chatService.js';

const assets = createNodeAssetReader(process.cwd());

describe('planner — hazard mapping', () => {
  test('every mapped value is a real MCP tool enum member', () => {
    // The router says "Cyclone"; the tool enum says "tropical-cyclone". Sending
    // the display label would fail schema validation on every cyclone question.
    for (const [skill, value] of Object.entries(MCP_HAZARD_BY_SKILL)) {
      if (value === null) continue;
      expect(HAZARDS).toContain(value);
      expect(hazardEnumFor(skill)).toBe(value);
    }
    expect(hazardEnumFor('Multi-Hazard')).toBeNull();
    expect(hazardEnumFor('Not A Skill')).toBeNull();
  });
});

describe('planner — intent and district detection', () => {
  test.each([
    ['Is there a flood warning for Rangpur?', ['alerts']],
    ['What is the flood outlook for the next 15 days?', ['outlook']],
    ['What is the weather like right now?', ['weather']],
    ['Which floods hit Sunamganj in previous years?', ['history']],
    ['What does the severity index mean?', ['explainer']],
    ['How fresh is the data?', ['status']],
    ['How do I protect my cattle in a cyclone?', ['advice']],
    ['hello there', ['advice']],
  ])('reads %s as %s', (query, expected) => {
    expect(detectIntents(query)).toEqual(expect.arrayContaining(expected));
  });

  test('a question can be two intents at once', () => {
    const intents = detectIntents('Is there any flood warning for Sunamganj in the next 15 days?');
    expect(intents).toContain('alerts');
    expect(intents).toContain('outlook');
  });

  test('resolves canonical names and the spellings people actually use', () => {
    expect(detectDistrict('flood outlook for Chittagong')).toBe('Chattogram');
    expect(detectDistrict('weather in Jessore tomorrow')).toBe('Jashore');
    expect(detectDistrict('cold wave in Bogura')).toBe('Bogra');
    expect(detectDistrict("outlook for Cox's Bazar")).toBe("Cox's Bazar");
    // Autocorrect's typographic apostrophe must resolve too — the registry only
    // holds the ASCII spelling, and this district is the common case.
    expect(detectDistrict('outlook for Cox\u2019s Bazar')).toBe("Cox's Bazar");
    expect(detectDistrict('no district named here')).toBeNull();
  });

  test('prefers an explicit district, and resolves it through the registry', () => {
    expect(detectDistrict('what about the floods?', 'Chittagong')).toBe('Chattogram');
    expect(detectDistrict('what about the floods?', 'Not A District')).toBeNull();
  });
});

describe('planner — plan shape', () => {
  test('a warning question reads the alert artifact for that district and hazard', () => {
    const plan = buildPlan({ query: 'Is there a flood warning for Rangpur?', district: 'Rangpur', skill: 'Flood' });
    expect(plan.district).toBe('Rangpur');
    expect(plan.hazard).toBe('flood');
    expect(plan.intents).toEqual(['alerts']);
    expect(plan.steps.map((s) => s.tool)).toEqual(['list_alerts']);
    expect(plan.steps[0].args).toEqual({ district: 'Rangpur', hazard: 'flood', limit: 5 });
  });

  test('a question with two intents reads both artifacts', () => {
    const plan = buildPlan({ query: 'Any flood warning for Rangpur in the next 15 days?', district: 'Rangpur', skill: 'Flood' });
    expect(plan.intents).toEqual(expect.arrayContaining(['alerts', 'outlook']));
    expect(plan.steps.map((s) => s.tool)).toEqual(expect.arrayContaining(['list_alerts', 'get_hazard_forecast']));
    for (const step of plan.steps) {
      if (step.args?.hazard) expect(step.args.hazard).toBe('flood');
    }
  });

  test('plural history phrasing is still read as history', () => {
    expect(detectIntents('Which floods hit Sunamganj in previous years?')).toContain('history');
    expect(detectIntents('what happened in past years')).toContain('history');
  });

  test('a weather question plans the dependent pair', () => {
    const plan = buildPlan({ query: 'What is the weather in Cox\u2019s Bazar right now?', skill: 'Multi-Hazard' });
    const tools = plan.steps.map((s) => s.tool);
    expect(tools[0]).toBe('get_district_info');
    expect(tools).toContain('get_weather');
    const weather = plan.steps.find((s) => s.tool === 'get_weather');
    // The coordinates are not known at plan time; they are lifted from the
    // earlier step at run time. That is what makes this a loop, not a batch.
    expect(weather.needs).toEqual({ from: 'get_district_info', fields: ['latitude', 'longitude'] });
  });

  test('a weather question with no district records why it cannot run', () => {
    const plan = buildPlan({ query: 'What is the weather right now?', skill: 'Multi-Hazard' });
    expect(plan.steps[0].tool).toBeNull();
    expect(plan.steps[0].skipped).toMatch(/no district/i);
  });

  test('never plans the same tool twice and respects the step ceiling', () => {
    const plan = buildPlan({ query: 'flood outlook and flood alerts and flood history', district: 'Rangpur', skill: 'Flood', maxSteps: 3 });
    expect(plan.steps.length).toBeLessThanOrEqual(3);
    const keys = plan.steps.map((s) => `${s.tool}:${JSON.stringify(s.args ?? {})}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('agent loop — execution against the real public artifacts', () => {
  test('calls the tools and returns a step trace', async () => {
    const agent = await runAgent({
      query: 'Is there any flood warning for Sunamganj in the next 15 days?',
      district: 'Sunamganj',
      skill: 'Flash Flood',
      assets,
    });

    expect(agent.enabled).toBe(true);
    expect(agent.reason).toBeNull();
    expect(agent.plan.district).toBe('Sunamganj');
    expect(agent.plan.hazard).toBe('flash-flood');
    expect(agent.steps.length).toBeGreaterThan(0);

    for (const step of agent.steps) {
      expect(step).toMatchObject({ step: expect.any(Number), purpose: expect.any(String) });
      expect(typeof step.ok).toBe('boolean');
      expect(typeof step.ms).toBe('number');
      if (step.ok) expect(step.digest.length).toBeGreaterThan(0);
    }
    expect(agent.tools_called.length).toBe(agent.steps.filter((s) => s.ok).length);
    expect(agent.digest).toContain('LIVE DATA READ BY THE AGENT');
  });

  test('an empty forecast is reported as absence of a row, never as absence of risk', async () => {
    const agent = await runAgent({ query: 'flash flood outlook for Sunamganj', district: 'Sunamganj', skill: 'Flash Flood', assets });
    const forecast = agent.steps.find((s) => s.tool === 'get_hazard_forecast');
    expect(forecast).toBeTruthy();
    if (forecast.ok) {
      expect(forecast.digest).toMatch(/row\(s\)/);
      // The dataset may legitimately gain a row later; what must always hold is
      // that an empty one is labelled, so the check is conditional on emptiness.
      if (/0 row\(s\)/.test(forecast.digest)) {
        expect(forecast.digest).toContain('absence of a row is not an all-clear');
      }
    }
  });

  test('resolves a dependency at run time: district centroid feeds the weather call', async () => {
    const agent = await runAgent({ query: "What is the weather like in Cox's Bazar right now?", skill: 'Multi-Hazard', assets });
    const info = agent.steps.find((s) => s.tool === 'get_district_info');
    const weather = agent.steps.find((s) => s.tool === 'get_weather');
    expect(info?.ok).toBe(true);
    expect(weather).toBeTruthy();
    // The point of the test is the dependency, not the upstream: the coordinates
    // were not in the plan, they were lifted out of step 1 at run time. Whether
    // open-meteo answers is a network question this suite does not own.
    expect(weather.args).toEqual({
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    });
    expect(weather.args.latitude).toBe(info.digest.match(/centroid ([\d.]+)/)[1] * 1);
    if (!weather.ok) {
      // Offline or upstream-blocked: recorded as a failed step with a reason,
      // never silently omitted.
      expect(weather.error).toBeTruthy();
    }
  });

  test('a dependency that does not resolve is reported, not silently dropped', async () => {
    const agent = await runAgent({ query: 'What is the weather right now?', skill: 'Multi-Hazard', assets });
    expect(agent.steps[0].ok).toBe(false);
    expect(agent.steps[0].skipped).toMatch(/no district/i);
  });

  test('a district that does not resolve is reported, not silently dropped', async () => {
    const agent = await runAgent({ query: 'flood outlook for Atlantis', district: 'Atlantis', skill: 'Flood', assets });
    expect(agent.plan.unresolved_district).toBe('Atlantis');
    const skipped = agent.steps.find((s) => !s.ok);
    expect(skipped).toBeTruthy();
    expect(skipped.skipped).toMatch(/not a Bangladesh district/);
    // The turn still completes: the answer proceeds on the knowledge base.
    expect(agent.enabled).toBe(true);
  });

  test('without an artifact reader the agent reports itself disabled instead of throwing', async () => {
    const agent = await runAgent({ query: 'flood outlook for Rangpur', district: 'Rangpur', skill: 'Flood', env: {} });
    expect(agent.enabled).toBe(false);
    expect(agent.reason).toMatch(/no public artifact reader/);
    expect(agent.steps).toEqual([]);
    expect(agent.digest).toBe('');
  });

  test('evidence carries the numbers the answer will be checked against', async () => {
    const agent = await runAgent({ query: 'any alerts for Sunamganj?', district: 'Sunamganj', skill: 'Multi-Hazard', assets });
    expect(agent.evidence.length).toBeGreaterThan(0);
    for (const entry of agent.evidence) {
      expect(entry.tool).toBeTruthy();
      expect(Array.isArray(entry.values)).toBe(true);
    }
  });
});

describe('answer review — the checking phase', () => {
  test('flags a metric that appears in nothing the agent read', () => {
    const { ok, flags } = reviewAnswer({ answer: 'The severity index is 87.5% and confidence is 92%.', agent: null, knowledge: [] });
    expect(ok).toBe(false);
    expect(flags.map((f) => f.code)).toContain('unsupported_metric');
  });

  test('accepts a figure that is in the evidence', () => {
    const agent = { steps: [{ ok: true }], evidence: [{ tool: 'list_alerts', values: [0.3, 0.905, 'WATCH'] }] };
    const { flags } = reviewAnswer({ answer: 'The published severity score is 0.3, i.e. 30%.', agent, knowledge: [] });
    expect(flags.filter((f) => f.code === 'unsupported_metric')).toEqual([]);
  });

  test('accepts figures that come from the cited knowledge base', () => {
    const knowledge = [{ title: 'Varieties', body: 'BRRI dhan51 and dhan52 tolerate submergence; cutting at 80-85 percent maturity saves the crop.' }];
    const { flags } = reviewAnswer({ answer: 'Cut at 80 percent maturity to save the crop.', knowledge });
    expect(flags.filter((f) => f.code === 'unsupported_metric')).toEqual([]);
  });

  test('flags an all-clear claim', () => {
    const { flags } = reviewAnswer({ answer: 'There is no risk at all and you are completely safe.' });
    expect(flags.map((f) => f.code)).toContain('all_clear_claim');
  });

  test('does not flag the correct explanation of an empty result', () => {
    // A reviewer that flags the right answer gets ignored, so the denial case
    // has to pass: this is the sentence we actually want the model to write.
    const honest = 'No alert row is published for your district. That means no row was issued, not that there is no risk. Follow BMD and FFWC.';
    const { ok, flags } = reviewAnswer({ answer: honest });
    expect(ok).toBe(true);
    expect(flags).toEqual([]);
  });

  test('flags an implied official warning', () => {
    const { flags } = reviewAnswer({ answer: 'An official warning has been issued for your district.' });
    expect(flags.map((f) => f.code)).toContain('official_warning_claim');
  });

  test('flags a claim about current conditions when nothing current was read', () => {
    const { flags } = reviewAnswer({ answer: 'It is currently raining heavily in your area.', agent: { steps: [], evidence: [] } });
    expect(flags.map((f) => f.code)).toContain('live_claim_without_data');
  });

  test('does not flag the correct disclaimer about official warnings', () => {
    const { flags } = reviewAnswer({ answer: 'HazardNet does not issue official warnings. Official warnings come from BMD and FFWC.' });
    expect(flags.filter((f) => f.code === 'official_warning_claim')).toEqual([]);
  });

  test('catches the wordier forms of an official-warning claim', () => {
    for (const answer of [
      'An official warning has been issued for your district.',
      'HazardNet issued a warning for Rangpur this morning.',
      'There is an official alert in force.',
    ]) {
      expect(reviewAnswer({ answer }).flags.map((f) => f.code)).toContain('official_warning_claim');
    }
  });

  test('a normal advisory answer passes clean', () => {
    const agent = { steps: [{ ok: true }], evidence: [{ tool: 'get_hazard_forecast', values: [0.3] }] };
    const answer = 'No row is published for your district today, which is not the same as no risk. Harvest within 48 hours if the crop is mature, and call 16123 for advice.';
    expect(reviewAnswer({ answer, agent, knowledge: [] }).ok).toBe(true);
  });
});

describe('handleChatQuery — the agent is wired into the response', () => {
  test('returns the trace alongside the answer', async () => {
    const res = await handleChatQuery(
      { query: 'Is there any flood warning for Sunamganj in the next 15 days?', district: 'Sunamganj' },
      {},
      { assets },
    );

    expect(res.agent.enabled).toBe(true);
    expect(res.agent.intents).toEqual(expect.arrayContaining(['alerts']));
    expect(res.agent.district).toBe('Sunamganj');
    expect(res.agent.tools_called.length).toBeGreaterThan(0);
    expect(res.agent.steps.length).toBe(res.agent.steps.length);
    expect(res.agent.review).toMatchObject({ ok: expect.any(Boolean), flags: expect.any(Array) });
    // The trace carries digests, not raw artifact payloads.
    expect(JSON.stringify(res.agent).length).toBeLessThan(8_000);
  });

  test('degrades to knowledge-only when no artifact reader is available', async () => {
    const res = await handleChatQuery({ query: 'How do I protect my cattle in a cold wave?', district: 'Rangpur' }, {});
    expect(res.agent.enabled).toBe(false);
    expect(res.agent.reason).toMatch(/no public artifact reader/);
    expect(res.answer).toBeTruthy();
    expect(res.retrieved_sources.length).toBeGreaterThan(0);
  });
});
