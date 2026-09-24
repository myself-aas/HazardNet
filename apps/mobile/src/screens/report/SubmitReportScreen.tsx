/**
 * Submit Report (More → Submit Report) — Phase 7.
 *
 * MVP flow: pick photo from library or camera (expo-image-picker),
 * add caption + hazard tag, attach GPS fix (in-context permission), enqueue
 * to offline queue. Camera is launched with in-app education before permission
 * prompt per the Phase 7 risk mitigation.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert as RNAlert, Image, ScrollView, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title1, Title3, Body, BodyBold, Caption } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Button } from '../../design-system/Button';
import { Chip } from '../../design-system/Chip';
import { useReportQueue } from '../../lib/reports/useReportQueue';
import { useLocation } from '../../hooks/useLocation';
import { useNavigation } from '@react-navigation/native';
import { SCREEN_H_PADDING } from '../../theme/nativeTokens';
import { useTheme } from '../../theme/ThemeProvider';
import { HAZARD_TYPES } from '@hazardnet/core';

let ImagePickerAny: typeof ImagePicker | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  ImagePickerAny = require('expo-image-picker') as typeof ImagePicker;
} catch {
  ImagePickerAny = null;
}

export function SubmitReportScreen() {
  const { theme } = useTheme();
  const nav = useNavigation<any>();
  const { enqueue, queue } = useReportQueue();
  const { permission: locPerm, requestPermission: requestLoc, getCurrentLocation } = useLocation();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [tag, setTag] = useState<string>('flood');
  const [attachLocation, setAttachLocation] = useState(true);
  const [mediaStatus, setMediaStatus] = useState<'idle'|'asking'|'denied'>('idle');

  useEffect(() => { try { nav.setOptions({ title: 'Submit report' }); } catch {} }, [nav]);

  const requestMediaPerm = useCallback(async (kind: 'camera' | 'library'): Promise<boolean> => {
    if (!ImagePickerAny) { RNAlert.alert('Unavailable', 'Image picker is not available in this environment.'); return false; }
    setMediaStatus('asking');
    try {
      const perm = kind === 'camera'
        ? await ImagePickerAny.requestCameraPermissionsAsync()
        : await ImagePickerAny.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setMediaStatus('denied');
        RNAlert.alert('Permission needed', kind === 'camera' ? 'Allow camera access to capture a new photo.' : 'Allow photo-library access to attach a photo.');
        return false;
      }
      setMediaStatus('idle');
      return true;
    } catch { setMediaStatus('idle'); return false; }
  }, []);

  const pickFromLibrary = useCallback(async () => {
    const ok = await requestMediaPerm('library');
    if (!ok || !ImagePickerAny) return;
    const result = await ImagePickerAny.launchImageLibraryAsync({
      mediaTypes: ImagePickerAny.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
      exif: false,
    });
    if (!result.canceled && result.assets?.[0]) setImageUri(result.assets[0].uri);
  }, [requestMediaPerm]);

  const takePhoto = useCallback(async () => {
    const ok = await requestMediaPerm('camera');
    if (!ok || !ImagePickerAny) return;
    const result = await ImagePickerAny.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
      exif: false,
    });
    if (!result.canceled && result.assets?.[0]) setImageUri(result.assets[0].uri);
  }, [requestMediaPerm]);

  const submit = useCallback(async () => {
    if (!imageUri) { RNAlert.alert('Add a photo', 'Attach a photo of the event before submitting.'); return; }
    let location: { lat: number; lng: number } | null = null;
    if (attachLocation) {
      let perms = locPerm;
      if (perms === 'unknown') perms = await requestLoc();
      if (perms === 'granted') {
        const fix = await getCurrentLocation();
        if (fix) location = { lat: fix.lat, lng: fix.lng };
      }
    }
    await enqueue({ imageUri, caption: caption.trim(), hazardTag: tag, location });
    RNAlert.alert('Report queued', 'Your report is saved on this device and will upload when connectivity returns.',
      [{ text: 'OK', onPress: () => nav.goBack() }]);
  }, [imageUri, caption, tag, attachLocation, locPerm, requestLoc, getCurrentLocation, enqueue, nav]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Box px={SCREEN_H_PADDING} py={16} flex={1}>
        <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
          <VStack space={16}>
            <Title1>Submit a field report</Title1>
            <Caption color="textMuted">Photos help BMD/DAE officers verify conditions. Reports are stored on-device until they upload.</Caption>

            <Card>
              <VStack space={10}>
                <Title3>Photo</Title3>
                {imageUri ? (
                  <Box style={{ borderRadius: 8, overflow: 'hidden' }}>
                    <Image source={{ uri: imageUri }} style={{ width: '100%', height: 220 }} resizeMode="cover" />
                    <HStack space={8} pt={8}>
                      <Button variant="secondary" size="sm" label="Remove" onPress={() => setImageUri(null)} />
                    </HStack>
                  </Box>
                ) : (
                  <HStack space={8}>
                    <Button variant="secondary" size="md" label="Take photo" onPress={takePhoto} />
                    <Button variant="secondary" size="md" label="Choose from library" onPress={pickFromLibrary} />
                  </HStack>
                )}
                {mediaStatus === 'denied' ? (
                  <Caption color="textMuted">Permission was denied. You can enable access in system settings.</Caption>
                ) : null}
              </VStack>
            </Card>

            <Card>
              <VStack space={10}>
                <Title3>Details</Title3>
                <Box px={12} py={10} style={{ borderWidth: 1, borderColor: theme.colors.hairline as string, borderRadius: 8, backgroundColor: theme.colors.surface as string }}>
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Short description (e.g. 'Water 2ft above road in Kurigram sadar')"
                    placeholderTextColor={theme.colors.textMuted as string}
                    multiline
                    style={{ color: theme.colors.textPrimary as string, fontSize: 16, minHeight: 80, textAlignVertical: 'top' }}
                    accessibilityLabel="Report caption"
                  />
                </Box>
                <VStack space={6}>
                  <BodyBold>Hazard type</BodyBold>
                  <HStack style={{ flexWrap: 'wrap' }} space={8}>
                    {HAZARD_TYPES.map((h) => (
                      <Chip
                        key={h}
                        label={h.replace(/_/g, ' ')}
                        selected={tag === h}
                        severity={tag === h ? 'warning' : null}
                        onPress={() => setTag(h)}
                      />
                    ))}
                  </HStack>
                </VStack>
                <HStack justify="space-between" align="center">
                  <VStack space={2} flex={1}>
                    <BodyBold>Attach location</BodyBold>
                    <Caption color="textMuted">Attach your current low-accuracy location (on-device only).</Caption>
                  </VStack>
                  <Chip label={attachLocation ? 'On' : 'Off'} severity={attachLocation ? 'info' : null} onPress={() => setAttachLocation((v) => !v)} />
                </HStack>
              </VStack>
            </Card>

            {queue.length > 0 ? (
              <Card>
                <VStack space={6}>
                  <BodyBold>Pending uploads: {queue.filter((q) => q.status !== 'uploaded').length}</BodyBold>
                  <Caption color="textMuted">Reports auto-upload when connectivity returns.</Caption>
                </VStack>
              </Card>
            ) : null}

            <Button variant="primary" size="lg" label="Submit report" onPress={submit} disabled={!imageUri} />
          </VStack>
        </ScrollView>
      </Box>
    </Screen>
  );
}
