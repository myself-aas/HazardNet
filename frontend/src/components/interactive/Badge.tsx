/**
 * Interactive Badge — example of make-component-interactive best practices
 *
 * Strictly follows https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/studio/make-component-interactive.mdx
 * - Create a schema with Interactive.baseSchema + Interactive.transformSchema
 * - Include descriptive name, forward controls, use outlineRef with <Sequence layout="none">
 * - Props are inline and editable in Studio
 *
 * For webapp: same component works without Studio (controls forwarded, layout none).
 * For Studio: wrap any custom component this way to make props editable.
 */

import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { Interactive, Sequence, type InteractiveBaseProps, type InteractiveTransformProps, type InteractivitySchema, type SequenceControls } from 'remotion';

export type BadgeProps = InteractiveBaseProps &
  InteractiveTransformProps & {
    readonly children?: React.ReactNode;
    readonly color?: string;
    readonly padding?: number;
  };

export const badgeSchema = {
  ...Interactive.baseSchema,
  color: {
    type: 'color',
    default: '#0b84ff',
    description: 'Badge color',
  },
  padding: {
    type: 'number',
    min: 0,
    step: 1,
    default: 16,
    description: 'Padding',
    hiddenFromList: false,
  },
  ...Interactive.transformSchema,
} as const satisfies InteractivitySchema;

const BadgeInner = forwardRef<
  HTMLDivElement,
  BadgeProps & {
    readonly controls: SequenceControls | undefined;
  }
>(({ children, color = '#0b84ff', padding = 16, style, name, controls, ...sequenceProps }, ref) => {
  const outlineRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => outlineRef.current as HTMLDivElement, [] );

  return (
    <Sequence layout="none" {...sequenceProps} name={name ?? '<Badge>'} controls={controls} outlineRef={outlineRef}>
      <div
        ref={outlineRef}
        style={{
          display: 'inline-flex',
          borderRadius: 999,
          backgroundColor: color,
          color: 'white',
          fontWeight: 700,
          padding,
          // Inline only — no spreading, no constants, no math
          ...style,
        }}
      >
        {children}
      </div>
    </Sequence>
  );
});
BadgeInner.displayName = 'BadgeInner';

export const Badge = Interactive.withSchema({
  Component: BadgeInner,
  componentName: '<Badge>',
  schema: badgeSchema,
  supportsEffects: false,
});
