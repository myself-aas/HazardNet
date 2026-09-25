/**
 * React Native for Windows (RNW) Entry Point
 * Fixed to return valid JSX for the Windows desktop build.
 */

import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, View, Text } from 'react-native';
import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS } from '@hazardnet/design-system';
import { WindowsDesktopOverview } from './src/components/WindowsDesktopOverview';

export function getWindowsAppState() {
  return {
    appName: 'HazardNet Windows Desktop',
    version: HDS_TOKENS.brand.version,
    platform: 'React Native for Windows (WinUI 3)',
    expressiveTouchFloor: M3_EXPRESSIVE_TOKENS.touchTargetFloor,
  };
}

export default function AppWindows() {
  const [selectedDistrict, setSelectedDistrict] = useState<string>('Kurigram');

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>HazardNet Windows</Text>
          <Text style={styles.headerSubtitle}>
            {HDS_TOKENS.brand.version} • {HDS_TOKENS.brand.platform}
          </Text>
          <Text style={styles.headerMeta}>React Native for Windows (WinUI 3) • Touch floor {M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp}dp</Text>
        </View>
        <WindowsDesktopOverview
          selectedDistrict={selectedDistrict}
          onSelectDistrict={setSelectedDistrict}
          onEmergencyPrint={() => {
            // Placeholder: In WinUI 3 this would trigger an A4 emergency directive PDF
            // via native printing APIs.
            console.log('[HazardNet Windows] Emergency print requested for', selectedDistrict);
          }}
          onTriggerWindowsNotification={(title, body) => {
            console.log(`[HazardNet Windows] Notification: ${title} - ${body}`);
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: HDS_TOKENS.colors.surfaceCanvas,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: HDS_TOKENS.colors.surfaceWhite,
    borderRadius: HDS_TOKENS.radii.card,
    // @ts-ignore - shadow props are web-compatible but RNW uses elevation
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: HDS_TOKENS.colors.inkPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: HDS_TOKENS.colors.inkMuted,
    marginBottom: 2,
  },
  headerMeta: {
    fontSize: 11,
    color: HDS_TOKENS.colors.inkMuted,
  },
});
