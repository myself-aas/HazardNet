import { sendSignInLinkToEmail, signInWithEmailLink, isSignInWithEmailLink, type User } from 'firebase/auth';
import { auth } from '../services/firebase';
export const EMAIL_LINK_KEY = 'hazardnet.emailLink';
const exchanges = new Map<string, Promise<User>>();
export const isEmailLink = (url: string) => isSignInWithEmailLink(auth, url);
export async function sendEmailLink(email: string) {
  const address = email.trim();
  await sendSignInLinkToEmail(auth, address, {
    url: `${window.location.origin}/auth/callback?next=%2Fset-password`,
    handleCodeInApp: true,
  });
  // Email is deliberately not included in the callback URL (session-injection protection).
  try { localStorage.setItem(EMAIL_LINK_KEY, address); } catch { /* cross-device form will ask */ }
}
export function completeEmailLink(email: string, url: string): Promise<User> {
  const key = `${email.trim()}\n${url}`;
  let exchange = exchanges.get(key);
  if (!exchange) {
    exchange = signInWithEmailLink(auth, email.trim(), url).then((credential) => {
      try { localStorage.removeItem(EMAIL_LINK_KEY); } catch { /* storage optional */ }
      return credential.user;
    });
    exchanges.set(key, exchange);
    // Share concurrent React StrictMode exchanges, then release sensitive link data.
    void exchange.finally(() => exchanges.delete(key)).catch(() => {});
  }
  return exchange;
}
