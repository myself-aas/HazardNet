/**
 * React Native for Windows — JavaScript entry point.
 *
 * How the pieces fit together:
 *  - The MSBuild bundling step (react-native-windows PropertySheets/Bundle.props)
 *    picks up `index.windows.js` when it exists, producing
 *    `windows/HazardNet/Bundle/index.windows.bundle` before the C++ build.
 *  - The native host (`windows/HazardNet/MainPage.xaml`,
 *    `ComponentName="HazardNet"`) asks AppRegistry for the component registered
 *    under that exact name.
 *
 * Keep the component name below in sync with the `ComponentName` attribute in
 * `windows/HazardNet/MainPage.xaml`.
 */
import { AppRegistry } from 'react-native';
import App from './App.windows';

AppRegistry.registerComponent('HazardNet', () => App);
