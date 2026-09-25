/**
 * React Native for Windows (RNW) WinUI 3 Master-Detail Desktop View
 * Fixed to return valid JSX and use React Native primitives.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS } from '@hazardnet/design-system';
import { FORECAST_HORIZONS, severityBin } from '@hazardnet/core';

export interface WindowsDesktopOverviewProps {
  selectedDistrict?: string;
  onSelectDistrict?: (district: string) => void;
  onEmergencyPrint?: () => void;
  onTriggerWindowsNotification?: (title: string, body: string) => void;
}

export const WindowsDesktopOverview: React.FC<WindowsDesktopOverviewProps> = ({
  selectedDistrict = 'Kurigram',
  onSelectDistrict,
  onEmergencyPrint,
  onTriggerWindowsNotification,
}) => {
  const desktopPadding = 24;
  const masterPaneWidth = 320;
  const targetHitArea = M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp; // 48dp

  const keyboardShortcuts = [
    { key: 'Ctrl+F', action: 'Search districts' },
    { key: 'Ctrl+P', action: 'Generate WinUI 3 A4 Emergency Directive PDF' },
    { key: 'Esc', action: 'Clear selected district' },
  ];

  const handlePrint = () => {
    onEmergencyPrint?.();
  };

  const handleNotification = () => {
    onTriggerWindowsNotification?.(
      'HazardNet Emergency Alert',
      `Critical Severity Spike in ${selectedDistrict}. Immediate crop protection required.`
    );
  };

  // Demo severity example (would come from real forecast data)
  const demoScore = 0.72;
  const bin = severityBin(demoScore);

  return (
    <View style={[styles.container, { padding: desktopPadding }]}>
      <View style={styles.masterDetail}>
        {/* Master Pane */}
        <View style={[styles.masterPane, { width: masterPaneWidth }]}>
          <Text style={styles.paneTitle}>Districts</Text>
          <View style={styles.districtCard}>
            <Text style={styles.districtLabel}>Selected</Text>
            <Text style={styles.districtValue}>{selectedDistrict}</Text>
            <Text style={styles.districtMeta}>Touch target ≥ {targetHitArea}dp (Material 3)</Text>
          </View>

          <View style={styles.shortcutSection}>
            <Text style={styles.sectionTitle}>Keyboard Shortcuts</Text>
            {keyboardShortcuts.map((ks) => (
              <View key={ks.key} style={styles.shortcutRow}>
                <View style={styles.kbdBadge}>
                  <Text style={styles.kbdText}>{ks.key}</Text>
                </View>
                <Text style={styles.shortcutAction}>{ks.action}</Text>
              </View>
            ))}
          </View>

          <View style={styles.horizonSection}>
            <Text style={styles.sectionTitle}>Forecast Horizons</Text>
            <View style={styles.horizonRow}>
              {FORECAST_HORIZONS.map((h) => (
                <View key={h} style={styles.horizonChip}>
                  <Text style={styles.horizonChipText}>{h.replace('_', ' ')}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Detail Pane */}
        <View style={styles.detailPane}>
          <Text style={styles.paneTitle}>Overview — {selectedDistrict}</Text>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Severity Preview</Text>
            <Text style={styles.cardMeta}>Demo score {demoScore} → {bin}</Text>
            <View
              style={[
                styles.severityBadge,
                {
                  backgroundColor:
                    bin === 'High'
                      ? HDS_TOKENS.colors.severity.high.surface
                      : bin === 'Moderate'
                      ? HDS_TOKENS.colors.severity.moderate.surface
                      : HDS_TOKENS.colors.severity.low.surface,
                  borderColor:
                    bin === 'High'
                      ? HDS_TOKENS.colors.severity.high.border
                      : bin === 'Moderate'
                      ? HDS_TOKENS.colors.severity.moderate.border
                      : HDS_TOKENS.colors.severity.low.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.severityText,
                  {
                    color:
                      bin === 'High'
                        ? HDS_TOKENS.colors.severity.high.color
                        : bin === 'Moderate'
                        ? HDS_TOKENS.colors.severity.moderate.color
                        : HDS_TOKENS.colors.severity.low.color,
                  },
                ]}
              >
                {bin}
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handlePrint} accessibilityRole="button">
              <Text style={styles.primaryButtonText}>Emergency Print (Ctrl+P)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleNotification} accessibilityRole="button">
              <Text style={styles.secondaryButtonText}>Trigger Test Notification</Text>
            </TouchableOpacity>
            {onSelectDistrict ? (
              <TouchableOpacity
                style={[styles.button, styles.ghostButton]}
                onPress={() => onSelectDistrict('Dhaka')}
                accessibilityRole="button"
              >
                <Text style={styles.ghostButtonText}>Switch to Dhaka (demo)</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>WinUI 3 Desktop Notes</Text>
            <Text style={styles.infoText}>
              This is the React Native for Windows entry point. The native host is in
              windows/HazardNet/MainPage.xaml (ComponentName="HazardNet") and loads the JS
              bundle index.windows.bundle produced by MSBuild. For Release x64, Hermes bytecode
              is embedded and the .appx is renamed to .msix for double-click install.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HDS_TOKENS.colors.surfaceCanvas,
  },
  masterDetail: {
    flexDirection: 'row',
    flex: 1,
    gap: 24,
  },
  masterPane: {
    backgroundColor: HDS_TOKENS.colors.surfaceWhite,
    borderRadius: HDS_TOKENS.radii.card,
    padding: 16,
    // @ts-ignore
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  detailPane: {
    flex: 1,
    backgroundColor: HDS_TOKENS.colors.surfaceWhite,
    borderRadius: HDS_TOKENS.radii.card,
    padding: 20,
    // @ts-ignore
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  paneTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: HDS_TOKENS.colors.inkPrimary,
    marginBottom: 12,
  },
  districtCard: {
    padding: 12,
    backgroundColor: HDS_TOKENS.colors.surfaceCanvas,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: HDS_TOKENS.colors.glassBorderLight,
  },
  districtLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    color: HDS_TOKENS.colors.inkMuted,
    marginBottom: 2,
  },
  districtValue: {
    fontSize: 18,
    fontWeight: '700',
    color: HDS_TOKENS.colors.inkPrimary,
  },
  districtMeta: {
    fontSize: 10,
    color: HDS_TOKENS.colors.inkMuted,
    marginTop: 4,
  },
  shortcutSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: HDS_TOKENS.colors.inkSoft,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  kbdBadge: {
    backgroundColor: HDS_TOKENS.colors.surfaceSunken,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    minWidth: 56,
    alignItems: 'center',
  },
  kbdText: {
    fontSize: 10,
    fontWeight: '600',
    color: HDS_TOKENS.colors.inkPrimary,
    fontFamily: HDS_TOKENS.typography.families.mono,
  },
  shortcutAction: {
    fontSize: 12,
    color: HDS_TOKENS.colors.inkSoft,
    flex: 1,
  },
  horizonSection: {
    marginBottom: 8,
  },
  horizonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  horizonChip: {
    backgroundColor: HDS_TOKENS.colors.surfaceSunken,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  horizonChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: HDS_TOKENS.colors.inkSoft,
  },
  card: {
    backgroundColor: HDS_TOKENS.colors.surfaceCanvas,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: HDS_TOKENS.colors.glassBorderLight,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: HDS_TOKENS.colors.inkPrimary,
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 12,
    color: HDS_TOKENS.colors.inkMuted,
    marginBottom: 8,
  },
  severityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  actions: {
    gap: 10,
    marginBottom: 20,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  primaryButton: {
    backgroundColor: HDS_TOKENS.colors.primaryRed,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  secondaryButton: {
    backgroundColor: HDS_TOKENS.colors.nasaBlue,
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  ghostButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: HDS_TOKENS.colors.glassBorderLight,
  },
  ghostButtonText: {
    color: HDS_TOKENS.colors.inkSoft,
    fontWeight: '600',
    fontSize: 13,
  },
  infoBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: HDS_TOKENS.colors.inkSoft,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 11,
    color: HDS_TOKENS.colors.inkMuted,
    lineHeight: 16,
  },
});
