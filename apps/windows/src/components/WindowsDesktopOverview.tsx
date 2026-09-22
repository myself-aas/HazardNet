/**
 * React Native for Windows (RNW) WinUI 3 Master-Detail Desktop View
 */

import React from 'react';
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

  return {
    type: 'WindowsDesktopOverview',
    props: {
      selectedDistrict,
      onSelectDistrict,
      desktopPadding,
      masterPaneWidth,
      targetHitArea,
      keyboardShortcuts,
      horizons: FORECAST_HORIZONS,
      handlePrint,
      handleNotification,
    },
  };
};
