/**
 * Web Interactive primitives — Remotion interactivity best practices for the webapp
 *
 * Implements the same contract as `remotion`'s `Interactive` but for the web runtime:
 * - Every element requires a descriptive `name` prop (Studio timeline)
 * - All CSS styles are inline plain objects (no constants, no spreading, no math)
 * - Animations use `interpolate(frame, ...)` inline with hardcoded ranges
 * - Use `scale` / `translate` / `rotate` (never `transform`)
 * - Respects `useReducedMotion` — no animation when reduced, GPU-only props
 *
 * For Remotion Studio compositions, import from 'remotion' directly.
 * For webapp UI, import from here — it wraps framer-motion while enforcing the contract.
 *
 * Performance: LazyMotion domAnimation already in App.tsx, will-change only on
 * animating elements, 60fps via rAF, no layout thrash (only compositor props).
 */

import React, { forwardRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { HTMLMotionProps } from 'framer-motion';

type InteractiveBaseProps = {
  name: string;
};

type InteractiveDivProps = InteractiveBaseProps &
  Omit<HTMLMotionProps<'div'>, 'style'> & {
    style?: React.CSSProperties & {
      scale?: number | string;
      translate?: string;
      rotate?: string;
    };
  };

type InteractiveSpanProps = InteractiveBaseProps &
  Omit<HTMLMotionProps<'span'>, 'style'> & {
    style?: React.CSSProperties & {
      scale?: number | string;
      translate?: string;
      rotate?: string;
    };
  };

type InteractiveSectionProps = InteractiveBaseProps &
  Omit<HTMLMotionProps<'section'>, 'style'> & {
    style?: React.CSSProperties & {
      scale?: number | string;
      translate?: string;
      rotate?: string;
    };
  };

type InteractiveHeaderProps = InteractiveBaseProps &
  Omit<HTMLMotionProps<'header'>, 'style'> & {
    style?: React.CSSProperties & {
      scale?: number | string;
      translate?: string;
      rotate?: string;
    };
  };

const useInteractiveMotionProps = () => {
  const shouldReduceMotion = useReducedMotion();
  return shouldReduceMotion;
};

// Base div — enforces name, inline style, GPU props
export const InteractiveDiv = forwardRef<HTMLDivElement, InteractiveDivProps>(
  ({ name, style, children, ...rest }, ref) => {
    const shouldReduceMotion = useInteractiveMotionProps();
    // Performance: only animating elements get willChange, and only compositor props
    const needsWillChange =
      style &&
      (style.scale !== undefined ||
        style.translate !== undefined ||
        style.rotate !== undefined ||
        (style as { opacity?: number }).opacity !== undefined);

    return (
      <motion.div
        ref={ref}
        data-interactive-name={name}
        style={
          {
            // Inline styles only — caller must pass plain object, no spreading
            ...style,
            // Never use transform — caller must use scale/translate/rotate
            // Performance hint
            ...(needsWillChange && !shouldReduceMotion
              ? { willChange: 'transform, opacity' as const }
              : {}),
          } as React.CSSProperties
        }
        {...rest}
        // Reduce motion: disable motion props
        {...(shouldReduceMotion ? { initial: false as const, animate: false as const, exit: undefined } : {})}
      >
        {children}
      </motion.div>
    );
  },
);
InteractiveDiv.displayName = 'Interactive.Div';

export const InteractiveSpan = forwardRef<HTMLSpanElement, InteractiveSpanProps>(
  ({ name, style, children, ...rest }, ref) => {
    const shouldReduceMotion = useInteractiveMotionProps();
    return (
      <motion.span
        ref={ref}
        data-interactive-name={name}
        style={style as React.CSSProperties}
        {...rest}
        {...(shouldReduceMotion ? { initial: false as const, animate: false as const } : {})}
      >
        {children}
      </motion.span>
    );
  },
);
InteractiveSpan.displayName = 'Interactive.Span';

export const InteractiveSection = forwardRef<HTMLElement, InteractiveSectionProps>(
  ({ name, style, children, ...rest }, ref) => {
    const shouldReduceMotion = useInteractiveMotionProps();
    return (
      <motion.section
        ref={ref as React.Ref<HTMLDivElement>}
        data-interactive-name={name}
        style={style as React.CSSProperties}
        {...rest}
        {...(shouldReduceMotion ? { initial: false as const, animate: false as const } : {})}
      >
        {children}
      </motion.section>
    );
  },
);
InteractiveSection.displayName = 'Interactive.Section';

export const InteractiveHeader = forwardRef<HTMLElement, InteractiveHeaderProps>(
  ({ name, style, children, ...rest }, ref) => {
    const shouldReduceMotion = useInteractiveMotionProps();
    return (
      <motion.header
        ref={ref as React.Ref<HTMLDivElement>}
        data-interactive-name={name}
        style={style as React.CSSProperties}
        {...rest}
        {...(shouldReduceMotion ? { initial: false as const, animate: false as const } : {})}
      >
        {children}
      </motion.header>
    );
  },
);
InteractiveHeader.displayName = 'Interactive.Header';

// Namespace like remotion
export const Interactive = {
  Div: InteractiveDiv,
  Span: InteractiveSpan,
  Section: InteractiveSection,
  Header: InteractiveHeader,
  // For custom components, re-export remotion patterns
  baseSchema: {
    // Mirrors remotion Interactive.baseSchema for Studio compatibility
    // Web runtime ignores these, but schema is required in withSchema
    durationInFrames: { type: 'number', default: undefined, min: 1, step: 1, hiddenFromList: true },
    from: { type: 'number', default: 0, step: 1, hiddenFromList: true },
    trimBefore: { type: 'number', default: 0, min: 0, step: 1, hiddenFromList: true },
    freeze: { type: 'number', default: null, step: 1, hiddenFromList: true },
    hidden: { type: 'boolean', default: false },
    name: { type: 'string', default: '' },
    showInTimeline: { type: 'boolean', default: true },
  },
  transformSchema: {
    'style.translate': { type: 'translate', step: 1, default: '0px 0px', description: 'Offset' },
    'style.scale': { type: 'scale', max: 100, step: 0.01, default: 1, description: 'Scale', defaultKeyframeOutput: 'perceptual-scale' },
    'style.rotate': { type: 'rotation-css', step: 1, default: '0deg', description: 'Rotation' },
    'style.opacity': { type: 'number', min: 0, max: 1, step: 0.01, default: 1, description: 'Opacity' },
  },
} as const;
