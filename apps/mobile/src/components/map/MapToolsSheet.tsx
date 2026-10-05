/**
 * MapToolsSheet — the map's controls, as labelled rows in a bottom sheet (backlog 8, native half).
 *
 * The web map labels its controls with `title=` tooltips and hover-only affordances. Neither
 * survives the port: React Native has no tooltip, and a phone has no hover. The web half of that
 * finding was closed by measurement (every icon-only control there also carries an `aria-label`),
 * but on native an `accessibilityLabel` is not a label either - it is invisible to a sighted user
 * who does not have a screen reader on. A glyph button (`◎`, `⌾`) tells a new user nothing.
 *
 * So the controls live where a thumb can reach them and each one says what it does:
 *
 *   - "Map layers" is the heading; every row is a labelled control with a one-line subtitle;
 *   - "Recenter on my location" states what the button will do *and* what the current state is
 *     (permission denied, locating, following), because that state used to be encoded in a glyph;
 *   - the layer rows are real switches over state the screen owns, not chips that look selectable
 *     and do nothing;
 *   - the note about what is not in this build is a row too, not a footnote nobody reads.
 *
 * It renders as a sheet rather than a popover menu: on a phone the bottom third is the reachable
 * band, and a sheet is also what the map's other surfaces (division alerts, location education)
 * already use, so the screen has one overlay language.
 */

import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Box, VStack, HStack, Divider } from '../../design-system/primitives';
import { Title3, Body, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Switch } from '../../design-system/Switch';
import { Icon } from '../Icon';
import { useTheme } from '../../theme/ThemeProvider';

export interface MapToolsSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Location control state, spelled out rather than encoded in a glyph. */
  locationState: 'idle' | 'locating' | 'following' | 'denied';
  onRecenter: () => void;
  showDivisions: boolean;
  onToggleDivisions: (value: boolean) => void;
  showAlerts: boolean;
  onToggleAlerts: (value: boolean) => void;
}

const LOCATION_COPY: Record<MapToolsSheetProps['locationState'], { label: string; detail: string }> = {
  idle: {
    label: 'Recenter on my location',
    detail: 'Asks for when-in-use permission, then follows your position while this screen is open.',
  },
  locating: { label: 'Finding your location', detail: 'Waiting for the first fix.' },
  following: { label: 'Following your location', detail: 'Tap to stop following and return to the country view.' },
  denied: {
    label: 'Location permission is off',
    detail: 'Open settings to allow location, or keep using the country view.',
  },
};

function ToolRow({
  icon,
  label,
  detail,
  onPress,
  trailing,
}: {
  icon: 'Crosshair' | 'Layers' | 'Bell' | 'Info';
  label: string;
  detail: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const { theme } = useTheme();
  const content = (
    <HStack space={12} align="center" justify="space-between">
      <HStack space={12} align="center" style={styles.flexOne}>
        <Icon name={icon} size="control" color={theme.colors.textSecondary} />
        <VStack space={2} style={styles.flexOne}>
          <Body>{label}</Body>
          <Caption color="textMuted">{detail}</Caption>
        </VStack>
      </HStack>
      {trailing ?? (onPress ? <Icon name="ChevronRight" size="meta" color={theme.colors.textMuted} /> : null)}
    </HStack>
  );
  if (!onPress) return <Box py={10}>{content}</Box>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export function MapToolsSheet({
  visible,
  onClose,
  locationState,
  onRecenter,
  showDivisions,
  onToggleDivisions,
  showAlerts,
  onToggleAlerts,
}: MapToolsSheetProps) {
  const { theme } = useTheme();
  if (!visible) return null;
  const location = LOCATION_COPY[locationState];

  return (
    <Card style={styles.sheet}>
      <VStack space={4}>
        <HStack space={12} align="center" justify="space-between">
          <Title3>Map layers</Title3>
          <Pressable accessibilityRole="button" accessibilityLabel="Close map layers" onPress={onClose} hitSlop={10}>
            <Icon name="X" size="control" color={theme.colors.textSecondary} />
          </Pressable>
        </HStack>

        <ToolRow
          icon="Crosshair"
          label={location.label}
          detail={location.detail}
          onPress={onRecenter}
        />
        <Divider />
        <ToolRow
          icon="Layers"
          label="Division boundaries"
          detail="The eight divisions, coloured by their highest active alert."
          trailing={
            <Switch
              value={showDivisions}
              onValueChange={onToggleDivisions}
              accessibilityLabel="Show division boundaries"
            />
          }
        />
        <Divider />
        <ToolRow
          icon="Bell"
          label="Alert markers"
          detail="Districts with an active alert, drawn on top of the division fill."
          trailing={
            <Switch
              value={showAlerts}
              onValueChange={onToggleAlerts}
              accessibilityLabel="Show alert markers"
            />
          }
        />
        <Divider />
        <ToolRow
          icon="Info"
          label="Not in this build"
          detail="District polygons, satellite tiles and an offline tile pack arrive with the MapLibre integration in 5b."
        />
        <Metadata color="textMuted">
          This screen redraws from the alert snapshot it already has, so it keeps working offline.
        </Metadata>
      </VStack>
    </Card>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
  },
  row: {
    paddingVertical: 10,
  },
  flexOne: { flex: 1 },
});
