/**
 * Icon — the native half of the one icon family.
 *
 * Web draws its icons with `lucide-react`; this shell draws the *same glyphs* from
 * `ICON_PATHS` in `@hazardnet/design-system`, which `scripts/generate-icons.mjs` emits from the
 * installed lucide package. So an icon means the same thing on both platforms, there is no second
 * visual weight, and the app gains no icon dependency (`react-native-svg` was already here for the
 * choropleth).
 *
 * What this replaces: the More tab's rows used emoji as icons (`📷`, `◐`, `🔔`, `◉`, `ⓘ`). Emoji
 * cannot be tinted with the theme, render differently on every OEM, and are silent as icons to
 * screen readers — they were the one part of the icon story that could not survive the port
 * (audit P1-8).
 *
 * Sizing and stroke come from the registry, not from this file: `ICON_SIZES` is the same scale the
 * web uses, and `ICON_STROKE` is what `svg.lucide { stroke-width }` sets in `apple.css`.
 */

import React from 'react';
import { Path, Circle, Line, Rect, Polyline, Polygon, Ellipse, Svg } from 'react-native-svg';
import { ICON_PATHS, ICON_SIZES, ICON_STROKE, ICON_VIEW_BOX, type IconName } from '@hazardnet/design-system';

type IconSize = keyof typeof ICON_SIZES;

export interface IconProps {
  name: IconName;
  /** A named step from the shared scale, or an explicit number of dp. */
  size?: IconSize | number;
  /** Defaults to the surrounding text colour, the same contract `currentColor` gives on web. */
  color?: string;
  /** Set when the icon is the only content of a control; the row itself is usually the label. */
  accessibilityLabel?: string;
  testID?: string;
}

function shape([tag, attrs]: readonly [string, Readonly<Record<string, string | number>>], index: number) {
  // `strokeLinecap`/`strokeLinejoin` and the rest of lucide's presentation attributes come from the
  // parent `<Svg>`: setting them per shape would multiply the same three values across every glyph.
  const key = `${tag}-${index}`;
  switch (tag) {
    case 'path':
      return <Path key={key} d={String(attrs.d)} />;
    case 'circle':
      return <Circle key={key} cx={attrs.cx as number} cy={attrs.cy as number} r={attrs.r as number} />;
    case 'line':
      return (
        <Line
          key={key}
          x1={attrs.x1 as number}
          y1={attrs.y1 as number}
          x2={attrs.x2 as number}
          y2={attrs.y2 as number}
        />
      );
    case 'rect':
      return (
        <Rect
          key={key}
          x={attrs.x as number}
          y={attrs.y as number}
          width={attrs.width as number}
          height={attrs.height as number}
          rx={attrs.rx as number | undefined}
          ry={attrs.ry as number | undefined}
        />
      );
    case 'polyline':
      return <Polyline key={key} points={String(attrs.points)} />;
    case 'polygon':
      return <Polygon key={key} points={String(attrs.points)} />;
    case 'ellipse':
      return <Ellipse key={key} cx={attrs.cx as number} cy={attrs.cy as number} rx={attrs.rx as number} ry={attrs.ry as number} />;
    default:
      // The generator only emits tags this switch knows; a new one must be handled here rather
      // than silently dropped.
      throw new Error(`Icon: no native renderer for <${tag}> - extend apps/mobile/src/components/Icon.tsx`);
  }
}

export function Icon({ name, size = 'nav', color = 'currentColor', accessibilityLabel, testID }: IconProps) {
  const px = typeof size === 'number' ? size : ICON_SIZES[size];
  const glyph = ICON_PATHS[name];
  if (!glyph) throw new Error(`Icon: "${name}" is not in the icon registry`);

  return (
    <Svg
      width={px}
      height={px}
      viewBox={ICON_VIEW_BOX}
      fill="none"
      stroke={color}
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
      testID={testID}
    >
      {glyph.map(shape)}
    </Svg>
  );
}

export default Icon;
