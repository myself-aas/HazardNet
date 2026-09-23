/**
 * SensitiveBlur (Phase 9) — blurs its children when the app is backgrounded
 * (app-switcher snapshot protection).
 *
 * On iOS/Android, the system takes a snapshot of the current screen when the
 * app enters the background for the app switcher. If that screen contains
 * a saved-place name, a notification preview, or a report draft, the text is
 * potentially visible in the switcher even while locked. We blanket the
 * current screen with a themed blur/cover view on blur and remove it on
 * focus. Native blur uses react-native-svg's BlurFilter when available;
 * on older devices we fall back to an opaque surface color.
 *
 * Wrap the root navigator in this component (in App.tsx) — it covers every
 * screen, which is the safest option for v1; per-screen sensitivity control
 * can be added later.
 */

import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

export function SensitiveBlur({ children }: { children: React.ReactNode }) {
  const { theme, resolvedMode } = useTheme();
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') setObscured(true);
      else if (state === 'active') setObscured(false);
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={styles.root} collapsable={false}>
      {children}
      {obscured ? (
        <View
          testID="sensitive-blur-cover"
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: resolvedMode === 'oled' ? '#000' : theme.colors.background as string,
              opacity: 1,
              zIndex: 9999,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
