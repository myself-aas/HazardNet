/**
 * Manual Jest mock for `react-native` used by node/jsdom test environments.
 *
 * The mobile App.tsx imports react-native primitives (SafeAreaView, View, Text,
 * StyleSheet, etc.) which the default Babel config cannot parse — react-native's
 * source uses Flow's `import typeof X from ...` syntax. Tests that only exercise
 * pure JS exports from apps/mobile (like getAppState() and the manifest checks in
 * __tests__/phase2MobileShell.test.js) don't need a real RN runtime; they just
 * need `import { ... } from 'react-native'` to resolve without error.
 *
 * This stub returns no-op components and a minimal StyleSheet that returns
 * identity styles. It is NOT intended for component-rendering tests — those run
 * via @testing-library/react-native under a separate jest config in Phase 2.
 */

const noop = () => null;
const id = (x) => x;

module.exports = {
  // Common components — render to null; we don't assert on RN output from node tests.
  SafeAreaView: noop,
  ScrollView: noop,
  View: noop,
  Text: noop,
  StatusBar: noop,
  Pressable: noop,
  TouchableOpacity: noop,
  TouchableWithoutFeedback: noop,
  Image: noop,
  TextInput: noop,
  FlatList: noop,
  ActivityIndicator: noop,
  Modal: noop,

  // Hooks — return sensible defaults so hook-call sites don't throw.
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, id],
  useEffect: () => undefined,
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
  useContext: () => ({}),
  useReducer: (reducer, initial) => [initial, id],
  useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 2 }),

  // StyleSheet — identity; callers get back the object they passed in.
  StyleSheet: {
    create: (styles) => styles,
    flatten: id,
    hairlineWidth: 1,
    absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  },

  // Platform
  Platform: {
    OS: 'ios',
    select: (obj) => obj.ios ?? obj.default,
    Version: 17,
  },

  // AppState, Appearance, etc. — no-op stubs.
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Appearance: { getColorScheme: () => 'light', addChangeListener: () => ({ remove: () => {} }) },
  Linking: {
    openURL: async () => {},
    canOpenURL: async () => true,
    addEventListener: () => ({ remove: () => {} }),
  },
  Alert: { alert: () => {} },

  // Other react-native entry points that might be imported transitively.
  NativeModules: {},
  NativeEventEmitter: class { addListener() { return { remove: () => {} }; } removeAllListeners() {} },
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  PixelRatio: { get: () => 2, getFontScale: () => 1, roundToNearestPixel: id },

  // Easing / Animated stub (not used in Phase 0; present so imports resolve).
  Animated: {
    Value: class { constructor(v) { this._v = v; } setValue() {} },
    ValueXY: class {},
    View: noop,
    Text: noop,
    Image: noop,
    ScrollView: noop,
    timing: () => ({ start: (cb) => cb && cb({ finished: true }) }),
    spring: () => ({ start: (cb) => cb && cb({ finished: true }) }),
    decay: () => ({ start: (cb) => cb && cb({ finished: true }) }),
    loop: (a) => a,
    sequence: (a) => a,
    parallel: (a) => a,
    event: () => {},
    add: (a, b) => ({ a, b }),
    multiply: (a, b) => ({ a, b }),
    createAnimatedComponent: (C) => C,
  },
};
