// @react-native-community/netinfo stub for jsdom tests.
let currentState = { isConnected: true, isInternetReachable: true, type: 'wifi', details: null };
const listeners = new Set();
module.exports = {
  default: {
    fetch: jest.fn(() => Promise.resolve(currentState)),
    addEventListener: jest.fn((_evt, cb) => { listeners.add(cb); return () => listeners.delete(cb); }),
    removeEventListener: jest.fn((_evt, cb) => { listeners.delete(cb); }),
  },
  __setState(s) {
    currentState = { ...currentState, ...s };
    listeners.forEach((l) => l(currentState));
  },
  __reset() {
    currentState = { isConnected: true, isInternetReachable: true, type: 'wifi', details: null };
    listeners.clear();
  },
};
