const React = require('react');
module.exports = {
  SafeAreaProvider: ({ children }) => React.createElement('div', null, children),
  SafeAreaView: ({ children }) => React.createElement('div', null, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
};
