/**
 * Motion Interpolate — Web-compatible bridge to Remotion interactivity best practices
 *
 * Strictly follows https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/studio/interactivity-best-practices.mdx
 * - Keep CSS styles inline (plain object, no spreading, no constants, no math)
 * - Animate using interpolate() inline with hardcoded ranges + Easing
 * - Use scale / translate / rotate (never transform)
 * - Keep composition metadata inline (see Root.tsx)
 * - Effects inline, not computed
 *
 * For Remotion Studio: use `interpolate` from 'remotion' directly with `frame` from `useCurrentFrame()`.
 * For Web (framer-motion): use `interpolateWeb` with a frame-like value from `useWebFrame()`.
 *
 * Performance: GPU-only properties (scale, translate, opacity), will-change where needed,
 * respects prefers-reduced-motion via useReducedMotion. LazyMotion + domAnimation in App.tsx.
 */

import { interpolate as remotionInterpolate, Easing } from 'remotion';

export { remotionInterpolate as interpolate, Easing };

/**
 * Web frame hook — provides a Remotion-like `frame` for interpolate() in the webapp.
 * Uses requestAnimationFrame, respects reduced-motion (returns 0 when reduced).
 * Input range may use `fps` and `durationInFrames` destructured from useWebVideoConfig().
 */
import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export const useWebFrame = (fps = 30): number => {
  const shouldReduceMotion = useReducedMotion();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) {
      setFrame(0);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = (now - start) / 1000;
      setFrame(Math.floor(elapsed * fps));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, shouldReduceMotion]);

  return shouldReduceMotion ? 0 : frame;
};

export const useWebVideoConfig = () => {
  // Inline metadata pattern — keep width/height/fps/durationInFrames inline where used.
  // This hook provides defaults for web interpolate input ranges.
  return {
    fps: 30,
    durationInFrames: 150,
    width: 1920,
    height: 1080,
  } as const;
};

/**
 * Shorthand for web: interpolate with frame from useWebFrame.
 * Usage must remain inline per best practices — do NOT extract to variable.
 * Example (correct):
 *   const frame = useWebFrame();
 *   const { fps } = useWebVideoConfig();
 *   <div style={{ scale: interpolate(frame, [0, fps], [0, 1], { easing: Easing.spring({damping:200}), extrapolateLeft:'clamp', extrapolateRight:'clamp' }) }}/>
 *
 * Do NOT:
 *   const scale = interpolate(frame, [0, fps], [0, 1]); // ❌ extracted
 *   <div style={{ scale }} />
 */
export const interpolateWeb = remotionInterpolate;
