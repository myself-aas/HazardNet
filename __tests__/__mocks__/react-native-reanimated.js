const React = require('react');
const noop = () => {};
const sharedValue = (v) => ({ value: v });

module.exports = {
  default: {
    createAnimatedComponent: (c) => c,
    Value: class { constructor(v) { this.v = v; } },
    event: noop,
    addWhitelistedUIProps: noop,
    addWhitelistedNativeProps: noop,
  },
  useSharedValue: sharedValue,
  useAnimatedStyle: (fn) => fn(),
  useAnimatedReaction: noop,
  useDerivedValue: (fn) => ({ value: fn() }),
  withTiming: (v) => v,
  withSpring: (v) => v,
  withSequence: (...a) => a[a.length - 1],
  withRepeat: (v) => v,
  withDecay: noop,
  cancelAnimation: noop,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  Easing: { in: (x) => x, out: (x) => x, inOut: (x) => x, quad: x => x, cubic: x => x },
  FadeIn: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  SlideInRight: { duration: () => ({}) },
  SlideOutLeft: { duration: () => ({}) },
};
