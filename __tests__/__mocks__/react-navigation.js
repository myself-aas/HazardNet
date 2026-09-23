const React = require('react');

function makeNav() {
  return {
    navigate: () => {},
    goBack: () => {},
    dispatch: () => {},
    setParams: () => {},
    push: () => {},
    pop: () => {},
    popToTop: () => {},
    replace: () => {},
    reset: () => {},
    canGoBack: () => false,
    isFocused: () => true,
    addListener: () => () => {},
    removeListener: () => {},
    setOptions: () => {},
    navigateDeprecated: () => {},
    dangerouslyGetParent: () => null,
    dangerouslyGetState: () => ({ index: 0, routes: [] }),
  };
}

function makeNavContext() {
  return {
    Navigator: ({ children }) => React.createElement('div', { 'data-testid': 'navigator' }, children),
    Screen: () => null,
    Group: ({ children }) => React.createElement('div', null, children),
  };
}

module.exports = {
  NavigationContainer: ({ children }) => React.createElement('div', { 'data-testid': 'nav-container' }, children),
  useNavigation: () => makeNav(),
  useRoute: () => ({ name: 'Today', params: {} }),
  useNavigationState: () => ({}),
  useFocusEffect: () => {},
  useIsFocused: () => true,
  createBottomTabNavigator: () => makeNavContext(),
  createNativeStackNavigator: () => makeNavContext(),
  createStackNavigator: () => makeNavContext(),
  DefaultTheme: { colors: { background: '#fff', card: '#fff', text: '#000', border: '#ccc', primary: '#007aff', notification: '#ff3b30' } },
  DarkTheme: { colors: { background: '#000', card: '#000', text: '#fff', border: '#333', primary: '#0a84ff', notification: '#ff453a' } },
};
