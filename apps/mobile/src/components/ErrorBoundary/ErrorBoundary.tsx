/**
 * App-level error boundary.
 *
 * If a render error takes down a subtree, we never show a white screen — we
 * show a red screen with "something went wrong" and always offer emergency
 * call CTAs (tel: links work regardless of JS errors).
 *
 * Per plan state 12 ("appError"): "You can still call emergency services."
 */

import React from 'react';
import { Platform } from 'react-native';
import { safeOpenUrl } from '../../lib/security/openUrl';
import { EMERGENCY_CONTACTS } from '@hazardnet/core';
import { Screen } from '../Screen';
import { Box, VStack, HStack } from '../../design-system/primitives';
import { Title2, Body, Caption } from '../../design-system/Text';
import { Button } from '../../design-system/Button';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Sentry capture lands in Phase 8. For now, log so developers can see.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info);
    }
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <Screen scroll={false} bg="background" edges={['top', 'bottom', 'left', 'right']}>
          <Box flex={1} px={24} justify="center">
            <VStack space={16}>
              <Title2>Something went wrong</Title2>
              <Body color="textSecondary">
                HazardNet hit an unexpected error. You can restart the app, and emergency
                numbers still work.
              </Body>
              <HStack space={10}>
                {EMERGENCY_CONTACTS.slice(0, 2).map((c, i) => (
                  <Button
                    key={c.number}
                    variant="danger"
                    label={`Call ${c.number}`}
                    size="sm"
                    onPress={() => safeOpenUrl(`tel:${c.number}`, 'emergency').catch(() => {})}
                  />
                ))}
              </HStack>
              <Button variant="secondary" label="Restart app" onPress={this.reset} />
              {__DEV__ && this.state.error ? (
                <Caption color="textMuted">{String(this.state.error.message || this.state.error)}</Caption>
              ) : null}
            </VStack>
          </Box>
        </Screen>
      );
    }
    return this.props.children;
  }
}
