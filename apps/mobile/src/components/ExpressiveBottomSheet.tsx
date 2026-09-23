/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Phase 0 descriptor stubs; return plain objects for unit tests, not JSX.
/**
 * Material 3 Expressive Drag Sheet Component for HazardNet Mobile & RN Windows
 */

import React from 'react';
import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS } from '@hazardnet/design-system';

export interface ExpressiveBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export const ExpressiveBottomSheet: React.FC<ExpressiveBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
}) => {
  const topRadius = M3_EXPRESSIVE_TOKENS.containerShape.fullExpressive; // 28dp
  const handleTouchArea = M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp; // 48dp minimum hit target
  const springConfig = M3_EXPRESSIVE_TOKENS.expressiveSprings.emphasized;

  const sheetStyle = {
    borderTopLeftRadius: topRadius,
    borderTopRightRadius: topRadius,
    backgroundColor: HDS_TOKENS.colors.surfaceWhite,
    borderTopWidth: 1,
    borderColor: 'rgba(23, 23, 27, 0.12)',
    paddingTop: 12,
    paddingBottom: 24,
  };

  return {
    type: 'BottomSheet',
    props: {
      isOpen,
      onClose,
      title,
      subtitle,
      topRadius,
      handleTouchArea,
      springConfig,
      sheetStyle,
      children,
    },
  };
};
