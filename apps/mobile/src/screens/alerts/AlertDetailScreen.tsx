/**
 * Alert Detail screen.
 *
 * Per plan §5 (Alert Details):
 *   1. Sticky header (back handled by native-stack; share top-trailing).
 *   2. Hero severity block (full-width, ~160pt).
 *   3. Official-instructions card FIRST (red-tinted, above map/secondary data).
 *   4. Primary CTA strip: Call 999 · 1090 · BMD · FFWC — 48dp chips.
 *   5. Affected area & timing card.
 *   6. Mini-map static preview (placeholder in Phase 3; Map tab transition in Phase 5).
 *   7. What this means (context paragraph).
 *   8. Source attribution, policy version, duty officer.
 *   9. Footer disclaimer.
 */

import React, { useCallback } from 'react';
import { Alert as RNAlert, Platform, Share, ScrollView } from 'react-native';
import { safeOpenUrl } from '../../lib/security/openUrl';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen } from '../../components/Screen';
import { Box, VStack, HStack, Divider } from '../../design-system/primitives';
import { Text, Title1, Title2, Title3, Body, BodyBold, Caption, Metadata } from '../../design-system/Text';
import { Card } from '../../design-system/Card';
import { Chip } from '../../design-system/Chip';
import { EmergencyCTARow, DisclaimerFooter } from '../../components/alerts/EmergencyCTA';
import { useAlertById } from '../../hooks/useAlerts';
import { useSeverityVisual, formatAge, formatTargetDate, confidenceLabel } from '../../lib/severity';
import { getExtrasFor, type AlertExtras } from '../../lib/mockAlerts';
import { OFFICIAL_DISCLAIMER } from '@hazardnet/core';
import { Button } from '../../design-system/Button';
import { useHaptics } from '../../hooks/useHaptics';
import { SEVERITY_EDGE_WIDTH } from '../../theme/nativeTokens';

type RouteParams = { id: string };

export function AlertDetailScreen() {
  const route = useRoute();
  const nav = useNavigation();
  const { id } = route.params as RouteParams;
  const { alert, extras, isLoading } = useAlertById(id);
  const { trigger } = useHaptics();

  const onShare = useCallback(async () => {
    if (!alert) return;
    try {
      await Share.share({
        message:
          `${alert.level}: ${alert.hazard_type} — ${alert.district_name}\n` +
          `${(getExtrasFor(alert.id) as AlertExtras | null)?.headline ?? ''}\n\n` +
          `From HazardNet. ${OFFICIAL_DISCLAIMER}`,
      });
    } catch {
      // share failed; ignore
    }
  }, [alert]);

  React.useEffect(() => {
    try {
      nav.setOptions({
        title: alert ? `${alert.district_name} · ${alert.hazard_type}` : 'Alert',
        headerRight: () => (
          <Button
            variant="ghost"
            size="sm"
            label="Share"
            onPress={onShare}
            accessibilityLabel="Share this alert"
          />
        ),
      });
    } catch {}
  }, [nav, alert, onShare]);

  if (isLoading || !alert) {
    return (
      <Screen>
        <Box px={16} py={16}>
          <Text role="callout" color="textMuted">Loading…</Text>
        </Box>
      </Screen>
    );
  }

  const sev = useSeverityVisual(alert.level);
  const confLabel = confidenceLabel(alert.confidence);

  return (
    <Screen scroll edges={['left', 'right', 'bottom']}>
      {/* HERO SEVERITY BLOCK */}
      <Box
        px={16}
        py={20}
        bg={sev.bg}
        style={{ borderLeftWidth: 0, borderBottomWidth: 1, borderBottomColor: sev.edge }}
      >
        <VStack space={10}>
          <HStack space={8} align="center">
            <Chip label={sev.label} severity={alert.level === 'NO_ALERT' ? 'allClear' : (alert.level.toLowerCase() as 'severe'|'warning'|'watch'|'info')} />
            <Metadata color="textSecondary">{Math.round(alert.severity_score * 100)}% severity · {confLabel}</Metadata>
          </HStack>
          <Title1>{extras?.headline ?? `${alert.hazard_type} for ${alert.district_name}`}</Title1>
          <Body color="textSecondary">
            Updated {formatAge(alert.published_at ?? alert.prediction_date)} · {formatTargetDate(alert.target_date)}
          </Body>
        </VStack>
      </Box>

      <Box px={16} py={16}>
        <VStack space={16}>

          {/* OFFICIAL INSTRUCTIONS — FIRST */}
          <Card edge={alert.level === 'NO_ALERT' ? 'allClear' : (alert.level.toLowerCase() as 'severe'|'warning'|'watch')} raised>
            <VStack space={10}>
              <Title3>Official instructions</Title3>
              <VStack space={6}>
                {(extras?.instructions ?? ['Follow official guidance from BMD/FFWC/DDM.']).map((step, i) => (
                  <HStack key={i} space={8} align="flex-start">
                    <BodyBold color={sev.color}>{i + 1}.</BodyBold>
                    <Box flex={1}><Body>{step}</Body></Box>
                  </HStack>
                ))}
              </VStack>
              {/* Primary CTA strip — thumb zone, always visible */}
              <Box pt={8}>
                <EmergencyCTARow compact />
              </Box>
            </VStack>
          </Card>

          {/* Affected area & timing */}
          <Card raised>
            <VStack space={10}>
              <Title3>Affected area & timing</Title3>
              <Divider />
              <InfoRow k="District" v={alert.district_name} />
              <InfoRow k="Hazard" v={alert.hazard_type} />
              <InfoRow k="Horizon" v={alert.horizon} />
              <InfoRow k="Issued" v={formatAge(alert.published_at ?? alert.prediction_date)} />
              <InfoRow k="Expected impact" v={formatTargetDate(alert.target_date)} />
              {extras?.affectedUpazilas?.length ? (
                <InfoRow k="Upazilas" v={extras.affectedUpazilas.join(', ')} />
              ) : null}
            </VStack>
          </Card>

          {/* Mini-map static preview (placeholder in Phase 3) */}
          <Card raised>
            <VStack space={8}>
              <Title3>Affected area</Title3>
              <Box
                h={160}
                align="center"
                justify="center"
                bg="surfaceTint"
                style={{ borderWidth: 1, borderColor: sev.edge, borderLeftWidth: SEVERITY_EDGE_WIDTH }}
              >
                <VStack space={4} align="center">
                  <Metadata color="textMuted">MAP PREVIEW</Metadata>
                  <Body>{alert.district_name}</Body>
                  <Caption color="textMuted">Interactive map lands in Phase 5.</Caption>
                </VStack>
              </Box>
            </VStack>
          </Card>

          {/* Context paragraph */}
          <Card>
            <VStack space={6}>
              <Title3>What this means</Title3>
              <Body>{extras?.summary ?? `${alert.hazard_type} conditions for ${alert.district_name}.`}</Body>
            </VStack>
          </Card>

          {/* Source attribution */}
          <Card>
            <VStack space={8}>
              <Title3>Sources</Title3>
              <Divider />
              {extras?.sources?.map((s, i) => (
                <SourceRow key={i} name={s.name} url={s.url} phone={s.phone} />
              )) ?? null}
              {extras?.dutyOfficer ? <Caption color="textSecondary">Duty officer: {extras.dutyOfficer}</Caption> : <Caption color="textSecondary">Auto-published under alert policy v1.0; human review pending.</Caption>}
              <Metadata color="textMuted">Policy version: {alert.prediction_date ? 'alert-policy/1.0.0' : ''}</Metadata>
            </VStack>
          </Card>
        </VStack>
      </Box>

      <DisclaimerFooter />
    </Screen>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <HStack space={12} align="flex-start" justify="space-between">
      <Caption color="textMuted" style={{ minWidth: 100 }}>{k}</Caption>
      <Box flex={1}><Body align="right" style={{ textAlign: 'right' }}>{v}</Body></Box>
    </HStack>
  );
}

function SourceRow({ name, url, phone }: { name: string; url?: string; phone?: string }) {
  return (
    <HStack space={8} align="center" justify="space-between">
      <Body>{name}</Body>
      {phone ? (
        <Button variant="danger" size="sm" label={`Call ${phone}`} onPress={() => { safeOpenUrl(`tel:${phone}`, 'alert-call').catch(() => {}); }} />
      ) : url ? (
        <Button variant="ghost" size="sm" label="Open →" onPress={() => { safeOpenUrl(url, 'alert-source').catch(() => RNAlert.alert('Cannot open', url)); }} />
      ) : null}
    </HStack>
  );
}
