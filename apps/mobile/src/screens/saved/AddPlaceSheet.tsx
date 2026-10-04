/**
 * AddPlaceSheet — inline form for adding a saved place.
 * Kept as its own component so SavedScreen stays readable.
 */

import React from 'react';
import { TextInput } from 'react-native';
import { VStack, HStack, Box } from '../../design-system/primitives';
import { Title3, Caption } from '../../design-system/Text';
import { NATIVE_FONT_SCALE_MAX, NATIVE_RADIUS } from '../../theme/nativeTokens';
import { Button } from '../../design-system/Button';
import { Chip } from '../../design-system/Chip';
import { Card } from '../../design-system/Card';
import { useTheme } from '../../theme/ThemeProvider';
import { useSettingsStore } from '../../state/settingsStore';

export type AddMode = 'current' | 'manual';

export interface AddPlaceSheetProps {
  mode: AddMode;
  onModeChange: (m: AddMode) => void;
  manualName: string;
  onManualNameChange: (s: string) => void;
  onUseCurrent: () => void;
  onSaveManual: () => void;
  permission: 'unknown' | 'granted' | 'denied';
}

export const AddPlaceSheet: React.FC<AddPlaceSheetProps> = ({
  mode, onModeChange, manualName, onManualNameChange, onUseCurrent, onSaveManual, permission,
}) => {
  const { theme, bodyFont } = useTheme();
  const largeText = useSettingsStore((state) => state.largeText);
  return (
    <Card>
      <VStack space={10}>
        <Title3>Add a place</Title3>
        <HStack space={8}>
          <Chip label="Use my location" selected={mode === 'current'} severity={mode === 'current' ? 'info' : null}
            onPress={() => onModeChange('current')} />
          <Chip label="Enter manually" selected={mode === 'manual'} severity={mode === 'manual' ? 'info' : null}
            onPress={() => onModeChange('manual')} />
        </HStack>
        {mode === 'current' ? (
          <VStack space={8}>
            <Caption color="textSecondary">
              {permission === 'denied'
                ? 'Location permission is denied. Tap "Open settings" to grant access, or add a place manually.'
                : 'Tap below to save your current low-accuracy location. Data stays on this device.'}
            </Caption>
            <Button variant="primary" size="md" label={permission === 'denied' ? 'Open settings' : 'Save current location'} onPress={onUseCurrent} />
          </VStack>
        ) : (
          <VStack space={8}>
            <Caption color="textSecondary">Give this place a label. You can refine the location later.</Caption>
            <Box
              px={12}
              py={10}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.hairline as string,
                borderRadius: NATIVE_RADIUS.control,
                backgroundColor: theme.colors.surface as string,
              }}
            >
              <TextInput
                value={manualName}
                onChangeText={onManualNameChange}
                placeholder="e.g. Home, Parents in Kurigram"
                placeholderTextColor={theme.colors.textMuted as string}
                maxFontSizeMultiplier={NATIVE_FONT_SCALE_MAX}
                style={{ color: theme.colors.textPrimary, fontFamily: bodyFont, fontSize: theme.type.body.size * (largeText ? 1.2 : 1), padding: 0, margin: 0 }}
                accessibilityLabel="Place name"
              />
            </Box>
            <Button variant="primary" size="md" label="Save place" onPress={onSaveManual} disabled={!manualName.trim()} />
          </VStack>
        )}
      </VStack>
    </Card>
  );
};
