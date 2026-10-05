/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Phase 0 descriptor stubs; return plain objects for unit tests, not JSX.
/**
 * Material 3 Expressive Drag Sheet Component for HazardNet Mobile & RN Windows
 */

import React from 'react';
import { APPLE_NATIVE } from '@hazardnet/design-system';

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
  const topRadius = APPLE_NATIVE.radii.card; // 28dp
  const handleTouchArea = APPLE_NATIVE.touch.min; // 48dp minimum hit target
  const springConfig = APPLE_NATIVE.motion.spring;

  const sheetStyle = {
    borderTopLeftRadius: topRadius,
    borderTopRightRadius: topRadius,
    backgroundColor: APPLE_NATIVE.colors.surfaceWhite,
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
