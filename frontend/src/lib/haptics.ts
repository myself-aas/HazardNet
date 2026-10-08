/**
 * Haptics wrapper for Web Vibration API.
 * Provides physical feedback for interactions.
 */

export const triggerHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    const patterns = {
      light: [10],
      medium: [30],
      heavy: [60],
    };
    navigator.vibrate(patterns[type]);
  }
};
