// Jest setup for apps/mobile (react-native preset).

// Silence console.warn for Animated/useNativeDriver in tests.
const originalWarn = console.warn;
console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('Animated: `useNativeDriver`')) return;
  originalWarn(...args);
};

// Ensure Linking.addEventListener exists — @react-navigation needs it.
const mockLinkingImpl = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
  canOpenURL: jest.fn(() => Promise.resolve(true)),
  openURL: jest.fn(() => Promise.resolve()),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
};
jest.mock('react-native/Libraries/Linking/Linking', () => mockLinkingImpl, { virtual: true });
// Legacy react-native path
jest.mock('Linking', () => mockLinkingImpl, { virtual: true });

jest.mock('react-native/Libraries/Share/Share', () => ({
  share: jest.fn(() => Promise.resolve({ action: 'sharedAction' })),
}), { virtual: true });

// Appearance stub — tests default light.
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  getColorScheme: () => 'light',
  addChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}), { virtual: true });

// expo-haptics no-op.
jest.mock('expo-haptics', () => ({
  Haptics: {
    impactAsync: jest.fn(),
    notificationAsync: jest.fn(),
    selectionAsync: jest.fn(),
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  },
}), { virtual: true });

// Safe-area: set initialMetrics already handled; mock hook.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 47, left: 0, right: 0, bottom: 34 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

// NetInfo native module stub. addEventListener returns an unsubscribe fn (v6+).
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
  addEventListener: jest.fn(() => jest.fn()),
  removeEventListener: jest.fn(),
}));

// AsyncStorage in-memory stub (default export — matches `import AsyncStorage from ...`).
const __mem = new Map();
const __asyncStorage = {
  __INTERNAL_MEMORY__: __mem,
  getItem: jest.fn((k) => Promise.resolve(__mem.has(k) ? __mem.get(k) : null)),
  setItem: jest.fn((k, v) => { __mem.set(k, String(v)); return Promise.resolve(); }),
  removeItem: jest.fn((k) => { __mem.delete(k); return Promise.resolve(); }),
  multiGet: jest.fn((keys) => Promise.resolve(keys.map((k) => [k, __mem.has(k) ? __mem.get(k) : null]))),
  multiSet: jest.fn((pairs) => { pairs.forEach(([k, v]) => __mem.set(k, String(v))); return Promise.resolve(); }),
  multiRemove: jest.fn((keys) => { keys.forEach((k) => __mem.delete(k)); return Promise.resolve(); }),
  getAllKeys: jest.fn(() => Promise.resolve(Array.from(__mem.keys()))),
  clear: jest.fn(() => { __mem.clear(); return Promise.resolve(); }),
};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: __asyncStorage,
}));

// expo-system-ui stub.
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn() }), { virtual: true });

// expo-location stub.
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({ coords: { latitude: 23.8, longitude: 90.4, accuracy: 100 }, timestamp: Date.now() })),
  Accuracy: { Low: 2, Balanced: 3, High: 4, Best: 5, Lowest: 1 },
}));

// expo-notifications stub.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notif-id')),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, NONE: 0 },
}));

// expo-device / expo-constants stubs.
jest.mock('expo-device', () => ({ isDevice: false }), { virtual: true });
jest.mock('expo-constants', () => ({ default: { expoConfig: {}, manifest: {} } }), { virtual: true });

// expo-image-picker stub.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: 'Images' },
}), { virtual: true });

// expo-file-system stub.
jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://mock-cache/',
  documentDirectory: 'file://mock-docs/',
  downloadAsync: jest.fn(() => Promise.resolve({ uri: 'file://mock', status: 200 })),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  deleteAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
}), { virtual: true });

// expo-screen-orientation stub.
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
  OrientationLock: { PORTRAIT_UP: 1, PORTRAIT_DOWN: 2, LANDSCAPE: 3, LANDSCAPE_LEFT: 4, LANDSCAPE_RIGHT: 5, ALL: 6, ALL_BUT_UPSIDE_DOWN: 7 },
}), { virtual: true });

// expo-localization stub.
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', regionCode: 'US' }]),
}), { virtual: true });
