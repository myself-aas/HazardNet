/**
 * React Hook for HazardNet Global Design System Tokens
 */

import { useMemo } from 'react';
import { HDS_TOKENS, HDSTokenType, getSeverityTokenScore } from './tokens';

export function useTokens(): HDSTokenType {
  return useMemo(() => HDS_TOKENS, []);
}

export { getSeverityTokenScore };
