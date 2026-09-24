/**
 * Unit tests for notification preferences and channel mapping.
 */

import {
  NotificationSettingsSchema,
  DEFAULT_NOTIFICATION_SETTINGS,
  channelForLevel,
  NOTIFICATION_CHANNELS,
} from '../src/notifications';

describe('NotificationSettingsSchema defaults', () => {
  it('provides sensible defaults', () => {
    const parsed = NotificationSettingsSchema.parse({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.criticalAlertsEnabled).toBe(false);
    expect(parsed.soundEnabled).toBe(true);
    expect(parsed.hapticsEnabled).toBe(true);
    expect(parsed.showDetailsOnLockScreen).toBe(false);
    expect(parsed.maxNotificationsPerHour).toBe(10);
    expect(parsed.digestOnExit).toBe(true);
  });

  it('clamps maxNotificationsPerHour', () => {
    expect(() => NotificationSettingsSchema.parse({ maxNotificationsPerHour: 0 })).toThrow();
    expect(() => NotificationSettingsSchema.parse({ maxNotificationsPerHour: 100 })).toThrow();
    const ok = NotificationSettingsSchema.parse({ maxNotificationsPerHour: 1 });
    expect(ok.maxNotificationsPerHour).toBe(1);
  });
});

describe('channelForLevel', () => {
  it('maps each alert level to a channel id', () => {
    expect(channelForLevel('NO_ALERT')).toBe('info');
    expect(channelForLevel('WATCH')).toBe('watch');
    expect(channelForLevel('WARNING')).toBe('warning');
    expect(channelForLevel('SEVERE')).toBe('critical');
  });
});

describe('NOTIFICATION_CHANNELS', () => {
  it('declares four channels with proper importance', () => {
    expect(Object.keys(NOTIFICATION_CHANNELS)).toEqual(['critical', 'warning', 'watch', 'info']);
    expect(NOTIFICATION_CHANNELS.critical.importance).toBe('max');
    expect(NOTIFICATION_CHANNELS.info.importance).toBe('low');
  });
});

describe('DEFAULT_NOTIFICATION_SETTINGS', () => {
  it('round-trips through schema without changes', () => {
    const parsed = NotificationSettingsSchema.parse(DEFAULT_NOTIFICATION_SETTINGS);
    expect(parsed).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });
});
