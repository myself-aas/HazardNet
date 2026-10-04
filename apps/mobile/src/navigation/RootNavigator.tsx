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
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import type { IconName } from '@hazardnet/design-system';
import { useSettingsStore } from '../state/settingsStore';
import { NavigationContainer, DefaultTheme, DarkTheme, NavigationState } from '@react-navigation/native';
import { track } from '../lib/telemetry';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeProvider';
import { useLocale } from '../hooks/useLocale';
import { TodayScreen } from '../screens/today/TodayScreen';
import { AlertsScreen } from '../screens/alerts/AlertsScreen';
import { AlertDetailScreen } from '../screens/alerts/AlertDetailScreen';
import { MapScreen } from '../screens/map/MapScreen';
import { SavedScreen } from '../screens/saved/SavedScreen';
import { SavedPlaceDetailScreen } from '../screens/saved/SavedPlaceDetailScreen';
import { MoreScreen } from '../screens/more/MoreScreen';
import { DataStatusScreen } from '../screens/more/DataStatusScreen';
import { AdvisoriesScreen } from '../screens/advisories/AdvisoriesScreen';
import { AdvisoryDetailScreen } from '../screens/advisories/AdvisoryDetailScreen';
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
  AdvisoryDetail: { id: string };
};

export type TabParamList = {
  Today: undefined;
  Alerts: undefined;
  Map: undefined;
  Saved: undefined;
  More: undefined;
};

const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Today: 'Sun',
  Alerts: 'Bell',
  Map: 'MapPin',
  Saved: 'Bookmark',
  More: 'SlidersHorizontal',
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
  const { t } = useLocale();
  return (
    <TodayStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <TodayStack.Screen name="TodayHome" component={TodayScreen} options={{ title: t('tab.today'), headerLargeTitle: true }} />
      <TodayStack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: 'Alert' }} />
    </TodayStack.Navigator>
  );
}

function AlertsStackScreen() {
  const { t } = useLocale();
  return (
    <AlertsStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <AlertsStack.Screen name="AlertsHome" component={AlertsScreen} options={{ title: t('alerts.title'), headerLargeTitle: true, headerSearchBarOptions: undefined }} />
      <AlertsStack.Screen name="AlertDetail" component={AlertDetailScreen} options={{ title: 'Alert' }} />
    </AlertsStack.Navigator>
  );
}

function SavedStackScreen() {
  const { t } = useLocale();
  return (
    <SavedStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <SavedStack.Screen name="SavedHome" component={SavedScreen} options={{ title: t('saved.title'), headerLargeTitle: true }} />
      <SavedStack.Screen name="SavedPlaceDetail" component={SavedPlaceDetailScreen} options={{ title: 'Place' }} />
    </SavedStack.Navigator>
  );
}

function MoreStackScreen() {
  const { t } = useLocale();
  return (
    <MoreStack.Navigator screenOptions={{ headerLargeTitle: Platform.OS === 'ios', headerShadowVisible: false }}>
      <MoreStack.Screen name="MoreHome" component={MoreScreen} options={{ title: t('tab.more'), headerLargeTitle: true }} />
      <MoreStack.Screen name="DataStatus" component={DataStatusScreen} options={{ title: t('data.title') }} />
      <MoreStack.Screen name="Advisories" component={AdvisoriesScreen} options={{ title: 'Advisories', headerLargeTitle: true }} />
      <MoreStack.Screen name="AdvisoryDetail" component={AdvisoryDetailScreen} options={{ title: 'Advisory' }} />
      <MoreStack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: t('notif.title') }} />
      <MoreStack.Screen name="Accessibility" component={AccessibilitySettingsScreen} options={{ title: t('a11y.title') }} />
      <MoreStack.Screen name="SubmitReport" component={SubmitReportScreen} options={{ title: t('report.title') }} />
      <MoreStack.Screen name="Article" component={ArticleScreen} options={{ title: 'Article' }} />
    </MoreStack.Navigator>
  );
}

function Tabs() {
  const { theme } = useTheme();
  const { t } = useLocale();
  const largeText = useSettingsStore((state) => state.largeText);
  const boldText = useSettingsStore((state) => state.boldText);
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === 'ios'
    ? TAB_BAR_HEIGHT_IOS + insets.bottom
    : TAB_BAR_HEIGHT_ANDROID + Math.max(0, insets.bottom - 10);
  const tabBarBottomPadding = Platform.OS === 'ios' ? insets.bottom : Math.max(10, insets.bottom);
  return (
    <Tab.Navigator
      initialRouteName="Today"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.interactive,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarActiveBackgroundColor: theme.colors.background as string,
        tabBarInactiveBackgroundColor: theme.colors.background as string,
        tabBarStyle: {
          backgroundColor: theme.colors.background as string,
          borderTopColor: theme.colors.hairline as string,
          borderTopWidth: StyleSheetHairline(),
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: tabBarBottomPadding,
        },
        tabBarItemStyle: { minHeight: 44 },
        tabBarLabelStyle: {
          fontSize: theme.type.caption.size * (largeText ? 1.2 : 1),
          fontWeight: boldText ? '700' : '600',
          fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
        },
        tabBarIcon: ({ color, size }) => (
          <TabBarIcon routeName={route.name} color={color} size={size} />
        ),
        tabBarLabelPosition: 'below-icon',
      })}
    >
      <Tab.Screen name="Today" component={TodayStackScreen} options={{ tabBarLabel: t('tab.today'), tabBarAccessibilityLabel: t('tab.today') }} />
      <Tab.Screen name="Alerts" component={AlertsStackScreen} options={{ tabBarLabel: t('tab.alerts'), tabBarAccessibilityLabel: t('tab.alerts') }} />
      <Tab.Screen name="Map" component={MapScreen} options={{ tabBarLabel: t('tab.map'), tabBarAccessibilityLabel: t('tab.map') }} />
      <Tab.Screen name="Saved" component={SavedStackScreen} options={{ tabBarLabel: t('tab.saved'), tabBarAccessibilityLabel: t('tab.saved') }} />
      <Tab.Screen name="More" component={MoreStackScreen} options={{ tabBarLabel: t('tab.more'), tabBarAccessibilityLabel: t('tab.more') }} />
    </Tab.Navigator>
  );
}

function StyleSheetHairline() {
  return StyleSheet.hairlineWidth;
}

/** Tab bar icons use the same generated Lucide paths as the web shell. */
function TabBarIcon({ routeName, color, size }: { routeName: keyof TabParamList; color: string; size: number }) {
  return <Icon name={TAB_ICONS[routeName]} color={color} size={size} />;
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
      primary: theme.colors.interactive,
      notification: theme.colors.severe,
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
