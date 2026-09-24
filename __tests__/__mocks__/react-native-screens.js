const React = require('react');
module.exports = {
  enableScreens: () => {},
  Screen: ({ children }) => React.createElement('div', null, children),
  NativeScreen: ({ children }) => React.createElement('div', null, children),
  ScreenStack: ({ children }) => React.createElement('div', null, children),
  ScreenStackHeaderConfig: () => null,
};
