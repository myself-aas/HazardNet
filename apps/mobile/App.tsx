/**
 * HazardNet Mobile Root App Component (Expo React Native)
 *
 * Multi-Hazard AI Classification & Severity Quantification Platform
 */

import React, { useState } from 'react';
import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS } from '@hazardnet/design-system';
import { FORECAST_HORIZONS, severityBin } from '@hazardnet/core';

export function getAppState() {
  return {
    appName: 'HazardNet Mobile',
    version: HDS_TOKENS.brand.version,
    selectedHorizon: '7_days',
    sampleDistrictData: {
      district: 'Kurigram',
      hazard: 'Flash Flood',
      severityScore: 0.88,
      risk: severityBin(0.88),
      confidence: 0.92,
    },
    horizons: FORECAST_HORIZONS,
    expressiveTouchFloor: M3_EXPRESSIVE_TOKENS.touchTargetFloor,
  };
}

export default function App() {
  const [selectedHorizon, setSelectedHorizon] = useState<string>('7_days');
  const [searchQuery, setSearchChange] = useState<string>('');
  const [isSheetOpen, setSheetOpen] = useState<boolean>(false);

  return {
    appName: 'HazardNet Mobile',
    selectedHorizon,
    searchQuery,
    isSheetOpen,
  };
}
