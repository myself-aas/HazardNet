/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Phase 0 descriptor stubs; return plain objects for unit tests, not JSX.
/**
 * Material 3 Expressive Floating Control Bar Component for HazardNet Mobile & RN Windows
 */

import React from 'react';
import { APPLE_NATIVE } from '@hazardnet/design-system';

export interface FilterChip {
  id: string;
  label: string;
  active?: boolean;
}

export interface ExpressiveFloatingControlBarProps {
  searchValue?: string;
  onSearchChange?: (text: string) => void;
  placeholder?: string;
  chips?: FilterChip[];
  onSelectChip?: (id: string) => void;
}

export const ExpressiveFloatingControlBar: React.FC<ExpressiveFloatingControlBarProps> = ({
  searchValue = '',
  onSearchChange,
  placeholder = 'Search district or hazard...',
  chips = [],
  onSelectChip,
}) => {
  const targetHeight = APPLE_NATIVE.touch.min; // 48dp minimum
  const pillRadius = APPLE_NATIVE.radii.pill; // 9999

  const containerStyle = {
    backgroundColor: APPLE_NATIVE.colors.glassLight,
    borderRadius: APPLE_NATIVE.radii.card,
    borderColor: APPLE_NATIVE.colors.glassBorderLight,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  };

  const inputStyle = {
    minHeight: targetHeight,
    paddingHorizontal: 16,
    borderRadius: APPLE_NATIVE.radii.control,
    backgroundColor: APPLE_NATIVE.colors.surfaceRaised,
  };

  return {
    type: 'FloatingControlBar',
    props: {
      searchValue,
      onSearchChange,
      placeholder,
      chips,
      onSelectChip,
      targetHeight,
      pillRadius,
      containerStyle,
      inputStyle,
    },
  };
};
