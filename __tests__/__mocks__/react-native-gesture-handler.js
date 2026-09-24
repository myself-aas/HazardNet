// Minimal mock for react-native-gesture-handler for jest/jsdom.
const React = require('react');
module.exports = {
  GestureHandlerRootView: ({ children }) => React.createElement('div', { 'data-testid': 'gesture-root' }, children),
  RectButton: ({ children }) => React.createElement('button', null, children),
  BaseButton: ({ children }) => React.createElement('button', null, children),
  Swipeable: ({ children }) => React.createElement('div', null, children),
  Directions: {},
  State: {},
  TapGestureHandler: ({ children }) => React.createElement('div', null, children),
  PanGestureHandler: ({ children }) => React.createElement('div', null, children),
  gestureHandlerRootHOC: (c) => c,
};
