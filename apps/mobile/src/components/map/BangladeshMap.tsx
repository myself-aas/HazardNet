/**
 * BangladeshMap — SVG-fallback map rendering the 8 divisions as
 * severity-tinted polygons, plus active-alert markers and a "you are here"
 * location dot.
 *
 * This is the Phase 5 offline fallback (and default in sandbox because
 * MapLibre native modules require gradle/pod builds). When MapLibre is
 * wired in Phase 5b, this component stays as the no-tile / offline /
 * error-state fallback per §5 (must never be blank).
 *
 * Touch targets: every polygon has a 44dp minimum hit area (invisible
 * Pressable overlay).
 */

import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path, G, Circle, Text as SvgText } from 'react-native-svg';
import { BANGLADESH_BBOX, DIVISIONS, type Division, divisionForDistrict } from '../../lib/geo/divisions';
import { makeProjector, rectPath, type Projector } from '../../lib/geo/projection';
import type { AlertItemType } from '@hazardnet/core';
import { useTheme } from '../../theme/ThemeProvider';
import { severityForAlert } from '../../lib/severity';

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  /** Tailwind-like hex color matching the alert severity. */
  color: string;
  label?: string;
  onPress?: () => void;
}

export interface BangladeshMapProps {
  width: number;
  height: number;
  alerts?: AlertItemType[];
  /** User's current location dot coords (if known and permitted). */
  userLocation?: { lat: number; lng: number } | null;
  onDivisionPress?: (division: Division) => void;
  onAlertPress?: (alertId: string) => void;
}

/** Division fill for un-alerted areas — neutral surface-tint from tokens. */
const NEUTRAL_FILL = '#e4e4e4';
const NEUTRAL_STROKE = '#bdbdbd';

function colorFor(alert: AlertItemType | undefined, theme: ReturnType<typeof useTheme>['theme']): string {
  if (!alert) return NEUTRAL_FILL;
  const edge = severityForAlert(alert);
  return edge === 'severe' ? (theme.colors.severe as string)
    : edge === 'warning' ? (theme.colors.warning as string)
    : edge === 'watch' ? (theme.colors.watch as string)
    : edge === 'allClear' ? (theme.colors.allClear as string)
    : (theme.colors.surfaceTint as string);
}

/**
 * Map each division to its highest active alert (if any). We key off
 * district name using the divisionForDistrict helper.
 */
function alertByDivision(alerts: AlertItemType[]): Map<string, AlertItemType> {
  const out = new Map<string, AlertItemType>();
  const rank = { SEVERE: 3, WARNING: 2, WATCH: 1, NO_ALERT: 0 } as const;
  for (const a of alerts) {
    const div = divisionForDistrict(a.district_name);
    if (!div) continue;
    const existing = out.get(div.id);
    if (!existing || rank[a.level] > rank[existing.level]) out.set(div.id, a);
  }
  return out;
}

export const BangladeshMap: React.FC<BangladeshMapProps> = ({
  width, height, alerts = [], userLocation = null, onDivisionPress, onAlertPress,
}) => {
  const { theme } = useTheme();
  const projector: Projector = useMemo(
    () => makeProjector({ bbox: BANGLADESH_BBOX, width, height, padding: 8 }),
    [width, height]
  );

  const divAlerts = useMemo(() => alertByDivision(alerts), [alerts]);

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <G>
          {DIVISIONS.map((d) => {
            const a = divAlerts.get(d.id);
            const [cx, cy] = projector.project(d.center[0], d.center[1]);
            return (
              <G key={d.id}>
                <Path
                  d={rectPath(projector, d.bbox)}
                  fill={colorFor(a, theme)}
                  stroke={a ? theme.colors.textPrimary : NEUTRAL_STROKE}
                  strokeWidth={a ? 1.5 : 1}
                  opacity={a ? 0.85 : 1}
                />
                <SvgText
                  x={cx}
                  y={cy}
                  fontSize={10}
                  fill={a ? theme.colors.textOnColor as string : theme.colors.textMuted as string}
                  textAnchor="middle"
                  fontWeight={a ? '700' : '500'}
                  accessibilityLabel={`${d.name}${a ? ' — ' + a.level : ''}`}
                >
                  {d.name}
                </SvgText>
              </G>
            );
          })}
        </G>
        {/* Location dot */}
        {userLocation ? (() => {
          const [x, y] = projector.project(userLocation.lng, userLocation.lat);
          return (
            <G>
              <Circle cx={x} cy={y} r={10} fill={theme.colors.primaryAction as string} opacity={0.25} />
              <Circle cx={x} cy={y} r={5} fill={theme.colors.primaryAction as string} stroke="#fff" strokeWidth={2} />
            </G>
          );
        })() : null}
        {/* Alert markers (centroid of alerted district's division) */}
        {alerts.slice(0, 12).map((a) => {
          const div = divisionForDistrict(a.district_name);
          if (!div) return null;
          const [x, y] = projector.project(div.center[0], div.center[1]);
          return (
            <Circle
              key={a.id}
              cx={x}
              cy={y - 14}
              r={4}
              fill={colorFor(a, theme)}
              stroke="#fff"
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>
      {/* Invisible pressable overlay per division for 44+dp tap targets. */}
      {DIVISIONS.map((d) => {
        const [w, s, e, n] = d.bbox;
        const [x1, y1] = projector.project(w, n);
        const [x2, y2] = projector.project(e, s);
        return (
          <Pressable
            key={'hit-' + d.id}
            accessibilityRole="button"
            accessibilityLabel={`${d.name} division`}
            onPress={() => onDivisionPress?.(d)}
            style={{
              position: 'absolute',
              left: Math.max(0, x1 - 4),
              top: Math.max(0, y1 - 4),
              width: Math.max(44, x2 - x1 + 8),
              height: Math.max(44, y2 - y1 + 8),
            }}
          />
        );
      })}
    </View>
  );
};
