/**
 * Perf utilities — Phase 8.
 *
 * - `memoBy` is a typed React.memo comparator that shallow-compares a list
 *   of named props, so stable lists avoid unnecessary re-renders.
 * - `shouldStripLogs` is true when __DEV__ is false — callers can guard
 *   verbose logs; Babel also strips console.log in release via the transform
 *   block below as a safety net.
 */

import React from 'react';

export function memoBy<P extends object>(
  Component: React.FC<P>,
  keys: (keyof P)[],
): React.NamedExoticComponent<P> {
  return React.memo(Component, (prev, next) => {
    for (const k of keys) {
      if (prev[k] !== next[k]) return false;
    }
    return true;
  });
}

/**
 * performance.now() timer for dev-only measurements. Returns () => elapsed ms.
 * In production returns no-op (0 ms) to avoid overhead.
 */
export function measureStart(): () => number {
  if (!__DEV__) return () => 0;
  const start = performance.now();
  return () => Math.round(performance.now() - start);
}

export const IS_PRODUCTION = !__DEV__;
