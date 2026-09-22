/**
 * React Hook for HazardNet Global Design System Tokens
 */

import { useMemo } from 'react';
import { HDS_TOKENS, HDSTokenType, getSeverityTokenScore } from './tokens';
import { M3_EXPRESSIVE_TOKENS, M3ExpressiveTokenType } from './material3Expressive';

export function useTokens(): HDSTokenType {
  return useMemo(() => HDS_TOKENS, []);
}

export function useM3ExpressiveTokens(): M3ExpressiveTokenType {
  return useMemo(() => M3_EXPRESSIVE_TOKENS, []);
}

export { getSeverityTokenScore };
