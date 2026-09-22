/**
 * Material 3 Expressive Floating Control Bar Component for HazardNet Mobile & RN Windows
 */

import React from 'react';
import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS } from '@hazardnet/design-system';

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
  const targetHeight = M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp; // 48dp minimum
  const pillRadius = M3_EXPRESSIVE_TOKENS.containerShape.pill; // 9999

  const containerStyle = {
    backgroundColor: HDS_TOKENS.colors.glassLight,
    borderRadius: M3_EXPRESSIVE_TOKENS.containerShape.fullExpressive,
    borderColor: HDS_TOKENS.colors.glassBorderLight,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  };

  const inputStyle = {
    minHeight: targetHeight,
    paddingHorizontal: 16,
    borderRadius: M3_EXPRESSIVE_TOKENS.containerShape.control,
    backgroundColor: M3_EXPRESSIVE_TOKENS.containers.surfaceContainerHigh,
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
