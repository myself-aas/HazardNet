/**
 * @jest-environment jsdom
 *
 * Low-bandwidth mode (Phase 5). Every rule that decides to drop satellite tiles and
 * animations is pinned, plus the two things that would be worse than no rule at all:
 * a user override that does not win, and signals we cannot read being treated as "slow".
 */

import {
  BANDWIDTH_STORAGE_KEY, decideBandwidthMode, explainBandwidthReason, readDeviceSignals,
} from '../bandwidth';

describe('decideBandwidthMode', () => {
  it('lets an explicit user choice win over every signal', () => {
    const signals = { saveData: true, effectiveType: '2g', deviceMemory: 1, online: false };
    expect(decideBandwidthMode(signals, false)).toMatchObject({ lowBandwidth: false, reason: 'user-disabled' });
    expect(decideBandwidthMode({}, true)).toMatchObject({ lowBandwidth: true, reason: 'user-enabled' });
  });

  it('honours Data Saver', () => {
    expect(decideBandwidthMode({ saveData: true }))
      .toMatchObject({ lowBandwidth: true, reason: 'save-data' });
  });

  it('drops to the vector path when offline', () => {
    expect(decideBandwidthMode({ online: false }))
      .toMatchObject({ lowBandwidth: true, reason: 'offline' });
  });

  it.each(['slow-2g', '2g', '2G'])('treats %s as too slow for raster tiles', (effectiveType) => {
    expect(decideBandwidthMode({ effectiveType }))
      .toMatchObject({ lowBandwidth: true, reason: 'slow-connection' });
  });

  it('leaves a 4G connection in full mode', () => {
    expect(decideBandwidthMode({ effectiveType: '4g' }))
      .toMatchObject({ lowBandwidth: false, reason: 'default' });
  });

  it('uses the vector map on a 2 GB device', () => {
    expect(decideBandwidthMode({ deviceMemory: 2 }))
      .toMatchObject({ lowBandwidth: true, reason: 'low-memory' });
    expect(decideBandwidthMode({ deviceMemory: 8 }).lowBandwidth).toBe(false);
  });

  it('uses the vector map on four cores or fewer, unless the user asked for motion', () => {
    expect(decideBandwidthMode({ hardwareConcurrency: 4 }))
      .toMatchObject({ lowBandwidth: true, reason: 'few-cores' });
    expect(decideBandwidthMode({ hardwareConcurrency: 2, prefersReducedMotion: false }).lowBandwidth)
      .toBe(false);
    expect(decideBandwidthMode({ hardwareConcurrency: 8 }).lowBandwidth).toBe(false);
  });

  it('never guesses from a signal it could not read', () => {
    expect(decideBandwidthMode({})).toMatchObject({ lowBandwidth: false, reason: 'default' });
    expect(decideBandwidthMode({ deviceMemory: 0, hardwareConcurrency: 0, online: null })
      .lowBandwidth).toBe(false);
  });

  it('skips the zero-value edge cases rather than treating "unknown" as "slow"', () => {
    expect(decideBandwidthMode({ deviceMemory: 0 }).reason).toBe('default');
    expect(decideBandwidthMode({ hardwareConcurrency: 0 }).reason).toBe('default');
  });
});

describe('readDeviceSignals', () => {
  it('reads what the browser exposes and nulls what it does not', () => {
    const signals = readDeviceSignals({
      connection: { saveData: true, effectiveType: '3g' },
      deviceMemory: 4,
      hardwareConcurrency: 8,
      onLine: false,
    } as never, { prefersReducedMotion: true });
    expect(signals).toEqual({
      saveData: true, effectiveType: '3g', deviceMemory: 4,
      hardwareConcurrency: 8, online: false, prefersReducedMotion: true,
    });
  });

  it('survives a navigator without the optional APIs (Firefox, older Safari)', () => {
    expect(readDeviceSignals({} as never)).toEqual({
      saveData: null, effectiveType: null, deviceMemory: null,
      hardwareConcurrency: null, online: null, prefersReducedMotion: null,
    });
    expect(readDeviceSignals(undefined).saveData).toBeNull();
  });
});

describe('explainBandwidthReason', () => {
  it('explains the decision in the active language', () => {
    const decision = decideBandwidthMode({ saveData: true });
    expect(explainBandwidthReason(decision, 'en')).toMatch(/Data Saver/);
    expect(explainBandwidthReason(decision, 'bn')).toMatch(/[\u0980-\u09FF]/);
  });
});

describe('storage key', () => {
  it('is the key the hook persists to', () => {
    expect(BANDWIDTH_STORAGE_KEY).toBe('hazardnet-low-bandwidth');
  });
});
