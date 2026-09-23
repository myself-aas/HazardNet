import { Linking, Alert as RNAlert } from 'react-native';
import { isSafeUrl } from './sanitize';
import { track } from '../telemetry';

/** Open an external URL only if it passes the URL whitelist. */
export async function safeOpenUrl(url: string, label?: string): Promise<boolean> {
  if (!isSafeUrl(url)) {
    track({ name: 'security.url_blocked', props: { label: label ?? 'unknown' } });
    if (__DEV__) {
      console.warn('[security] Blocked openURL for non-whitelisted scheme:', url);
    }
    return false;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      RNAlert.alert('Cannot open', url);
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    track({ name: 'error', props: { where: 'openUrl' } });
    return false;
  }
}
