/**
 * React Native for Windows (RNW) Entry Point
 */

import React, { useState } from 'react';
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

  return {
    appName: 'HazardNet Windows Desktop',
    selectedDistrict,
    setSelectedDistrict,
  };
}
