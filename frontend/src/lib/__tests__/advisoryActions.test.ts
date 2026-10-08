import { actionKeysFor, hasHazardHint, ACTION_HAZARD_CLASSES } from '../advisoryActions';
import { translate } from '../i18n';

/**
 * The advice layer is a lookup, so the tests are about coverage and about the two ways the
 * lookup could lie: a hazard class with no hint, and a tier with no instruction.
 */

describe('actionKeysFor', () => {
  it('gives every tier an instruction', () => {
    for (const tier of ['NORMAL', 'WATCH', 'WARNING', 'SEVERE'] as const) {
      const { tierKey } = actionKeysFor(tier, null);
      expect(translate('en', tierKey)).not.toBe(tierKey);
      expect(translate('bn', tierKey)).not.toBe(tierKey);
    }
  });

  it('gives every model hazard class a protective action, in both languages', () => {
    for (const hazard of ACTION_HAZARD_CLASSES) {
      const { hazardKey } = actionKeysFor('WARNING', hazard);
      expect(hazardKey).toBe(`advisory.hint.${hazard}`);
      expect(translate('en', hazardKey as string)).not.toBe(hazardKey);
      expect(translate('bn', hazardKey as string)).not.toBe(hazardKey);
    }
  });

  it('falls back to NORMAL rather than to no advice at all', () => {
    expect(actionKeysFor(null, 'Flood').tierKey).toBe('advisory.action.NORMAL');
  });

  it('returns no hint key for a class the model cannot emit', () => {
    expect(actionKeysFor('WATCH', 'Locust Swarm').hazardKey).toBe('advisory.hint.Locust Swarm');
    expect(hasHazardHint('Locust Swarm')).toBe(false);
    expect(hasHazardHint('Flash Flood')).toBe(true);
    expect(hasHazardHint(null)).toBe(false);
  });

  it('never promises an outcome', () => {
    // The copy is protective actions only: no claim that acting saves a crop or a life.
    for (const key of [
      'advisory.action.NORMAL',
      'advisory.action.WATCH',
      'advisory.action.WARNING',
      'advisory.action.SEVERE',
      ...ACTION_HAZARD_CLASSES.map((h) => `advisory.hint.${h}`),
    ]) {
      const text = translate('en', key);
      expect(text).not.toMatch(/guarantee|will save|protects your|ensure/i);
    }
  });
});
