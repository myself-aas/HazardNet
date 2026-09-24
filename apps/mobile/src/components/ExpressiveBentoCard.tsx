/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck — Phase 0 descriptor stubs; return plain objects for unit tests, not JSX.
/**
 * Material 3 Expressive Bento Card Component for HazardNet Mobile & RN Windows
 */

import React from 'react';
import { HDS_TOKENS, M3_EXPRESSIVE_TOKENS, getSeverityTokenScore } from '@hazardnet/design-system';

export interface ExpressiveBentoCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  severityScore?: number;
  onPress?: () => void;
  expressiveShape?: keyof typeof M3_EXPRESSIVE_TOKENS.containerShape;
}

export const ExpressiveBentoCard: React.FC<ExpressiveBentoCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  severityScore,
  onPress,
  expressiveShape = 'semiExpressive',
}) => {
  const severityToken = severityScore !== undefined ? getSeverityTokenScore(severityScore) : null;
  const borderRadius = M3_EXPRESSIVE_TOKENS.containerShape[expressiveShape] ?? 16;
  const minHitHeight = M3_EXPRESSIVE_TOKENS.touchTargetFloor.googlePlayDp; // 48dp for Google Play

  const cardStyle = {
    borderRadius,
    minHeight: minHitHeight * 2,
    backgroundColor: severityToken ? severityToken.surface : M3_EXPRESSIVE_TOKENS.containers.surfaceContainerLow,
    borderColor: severityToken ? severityToken.border : 'rgba(23, 23, 27, 0.12)',
    borderWidth: 1,
    padding: 16,
    justifyContent: 'space-between' as const,
  };

  return {
    type: 'BentoCard',
    props: {
      title,
      value,
      unit,
      subtitle,
      severityScore,
      severityLabel: severityToken?.label,
      severityColor: severityToken?.color,
      borderRadius,
      minHitHeight,
      cardStyle,
      onPress,
    },
  };
};
