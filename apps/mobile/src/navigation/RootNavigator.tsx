/**
 * Root navigator — bottom tabs + native-stack per tab.
 *
 * Maps directly to the tab hierarchy in docs/MOBILE_AUDIT_AND_REDESIGN.md §4.
 * Platform-adaptive: 49pt iOS tab bar, 80dp Android Material bottom nav.
 *
 * Deep links (Phase 6) will hook into the linking config below. Route
 * structure is already shaped to match hazardnet://alerts/:id deep links.
 */

import React, { useRef } from 'react';
import { Platform, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, NavigationState } from '@react-navigation/native';
import { track } from '../lib/telemetry';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { TodayScreen } from '../screens/today/TodayScreen';
import { AlertsScreen } from '../screens/alerts/AlertsScreen';
import { AlertDetailScreen } from '../screens/alerts/AlertDetailScreen';
import { MapScreen } from '../screens/map/MapScreen';
import { SavedScreen } from '../screens/saved/SavedScreen';
import { SavedPlaceDetailScreen } from '../screens/saved/SavedPlaceDetailScreen';
import { MoreScreen } from '../screens/more/MoreScreen';
import { DataStatusScreen } from '../screens/more/DataStatusScreen';
import { NotificationPreferencesScreen } from '../screens/settings/NotificationPreferencesScreen';
import { AccessibilitySettingsScreen } from '../screens/settings/AccessibilitySettingsScreen';
import { SubmitReportScreen } from '../screens/report/SubmitReportScreen';
import { ArticleScreen } from '../screens/articles/ArticleScreen';
import { NotificationsProvider } from '../components/notifications/NotificationsProvider';
import { TAB_BAR_HEIGHT_IOS, TAB_BAR_HEIGHT_ANDROID } from '../theme/nativeTokens';

export type RootStackParamList = {
  Tabs: undefined;
  AlertDetail: { id: string };
  PlaceDetail: { placeId: string };
  SavedPlaceDetail: { id: string };
};

export type TabParamList = {
  Today: undefined;
  Alerts: undefined;
  Map: undefined;
  Saved: undefined;
  More: undefined;
};

// Individual tab stacks so AlertDetail can be pushed from both Today and Alerts
// while preserving the tab bar at the bottom (mobile-navigation.md rule).
const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const AlertsStack = createNativeStackNavigator<any>();
const TodayStack = createNativeStackNavigator<any>();
const MoreStack = createNativeStackNavigator<any>();
const SavedStack = createNativeStackNavigator<any>();

function TodayStackScreen() {
  return (
    <TodayStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <TodayStack.Screen name="TodayHome" component={TodayScreen} options={{ title: 'Today', headerLargeTitle: true }} />
      <TodayStack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: 'Alert' }} />
    </TodayStack.Navigator>
  );
}

function AlertsStackScreen() {
  return (
    <AlertsStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <AlertsStack.Screen name="AlertsHome" component={AlertsScreen} options={{ title: 'Alerts', headerLargeTitle: true, headerSearchBarOptions: undefined }} />
      <AlertsStack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: 'Alert' }} />
    </AlertsStack.Navigator>
  );
}

function SavedStackScreen() {
  return (
    <SavedStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <SavedStack.Screen name="SavedHome" component={SavedScreen} options={{ title: 'Saved', headerLargeTitle: true }} />
      <SavedStack.Screen name="SavedPlaceDetail" component={SavedPlaceDetailScreen} options={{ title: 'Place' }} />
    </SavedStack.Navigator>
  );
}

function MoreStackScreen() {
  return (
    <MoreStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ title: 'More', headerLargeTitle: true }} />
      <MoreStack.Screen name="DataStatus" component={DataStatusScreen} options={{ title: 'Data status' }} />
      <MoreStack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: 'Notifications' }} />
      <MoreStack.Screen name="Accessibility" component={AccessibilitySettingsScreen} options={{ title: 'Accessibility' }} />
      <MoreStack.Screen name="SubmitReport" component={SubmitReportScreen} options={{ title: 'Submit report' }} />
      <MoreStack.Screen name="Article" component={ArticleScreen} options={{ title: 'Article' }} />
    </MoreStack.Navigator>
  );
}

function Tabs() {
  const { theme } = useTheme();
  const tabBarHeight = Platform.OS === 'ios' ? TAB_BAR_HEIGHT_IOS : TAB_BAR_HEIGHT_ANDROID;
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primaryAction as string,
        tabBarInactiveTintColor: theme.colors.textMuted as string,
        tabBarActiveBackgroundColor: theme.colors.background as string,
        tabBarInactiveBackgroundColor: theme.colors.background as string,
        tabBarStyle: {
          backgroundColor: theme.colors.background as string,
          borderTopColor: theme.colors.hairline as string,
          borderTopWidth: StyleSheetHairline(),
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 0 : 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          fontFamily: Platform.select({ ios: 'SF Pro Text', android: 'Roboto' }),
        },
        tabBarIcon: ({ color, size, focused }) => (
          <TabBarIcon routeName={route.name} color={color} size={size} focused={focused} />
        ),
        tabBarLabelPosition: 'below-icon',
      })}
    >
      <Tab.Screen name="Today" component={TodayStackScreen} options={{ tabBarLabel: 'Today', tabBarAccessibilityLabel: 'Today tab' }} />
      <Tab.Screen name="Alerts" component={AlertsStackScreen} options={{ tabBarLabel: 'Alerts', tabBarAccessibilityLabel: 'Alerts tab' }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ tabBarLabel: 'Map', tabBarAccessibilityLabel: 'Map tab' }} />
      <Tab.Screen name="Saved" component={SavedStackScreen} options={{ tabBarLabel: 'Saved', tabBarAccessibilityLabel: 'Saved places tab' }} />
      <Tab.Screen name="More" component={MoreStackScreen} options={{ tabBarLabel: 'More', tabBarAccessibilityLabel: 'More tab' }} />
    </Tab.Navigator>
  );
}

function StyleSheetHairline() {
  return StyleSheet.hairlineWidth;
}

/** Minimal glyph-based tab bar icon. Phase 3+ replaces with SF/Material Symbols. */
function TabBarIcon({ routeName, color, size, focused }: { routeName: keyof TabParamList; color: string; size: number; focused: boolean }) {
  const glyph =
    routeName === 'Today' ? '◉'
    : routeName === 'Alerts' ? '!'
    : routeName === 'Map' ? '◎'
    : routeName === 'Saved' ? '★'
    : '≡';
  return <Text style={{ color, fontSize: size, fontWeight: focused ? '700' : '400', lineHeight: size + 2 }}>{glyph}</Text>;
}

function getActiveRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index];
  if (route.state) return getActiveRouteName(route.state as NavigationState);
  return route.name;
}

export function RootNavigator() {
  const { theme, resolvedMode } = useTheme();
  const routeNameRef = useRef<string | undefined>();
  const navTheme = {
    ...(resolvedMode === 'light' ? DefaultTheme : DarkTheme),
    colors: {
      ...(resolvedMode === 'light' ? DefaultTheme.colors : DarkTheme.colors),
      background: theme.colors.background as string,
      card: theme.colors.background as string,
      text: theme.colors.textPrimary as string,
      border: theme.colors.hairline as string,
      primary: theme.colors.primaryAction as string,
      notification: theme.colors.severe as string,
    },
  };

  return (
    <NavigationContainer
      theme={navTheme}
      onReady={() => { track({ name: 'app.open' }); }}
      onStateChange={(state) => {
        const name = getActiveRouteName(state);
        if (name && name !== routeNameRef.current) {
          routeNameRef.current = name;
          track({ name: 'screen.view', props: { screen: name } });
        }
      }}
    >
      <NotificationsProvider>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={Tabs} />
        </Stack.Navigator>
      </NotificationsProvider>
    </NavigationContainer>
  );
}
