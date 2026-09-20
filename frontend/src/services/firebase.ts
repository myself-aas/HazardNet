// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { firebaseConfig as firebaseClientConfig, firestoreDatabaseId } from '../lib/config';
import { getAnalytics, isSupported as isAnalyticsSupported, Analytics } from "firebase/analytics";
import { 
  getAuth, 
  GoogleAuthProvider, 
  GithubAuthProvider, 
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { getDatabase, Database } from 'firebase/database';

// Suppress internal gRPC stream retry logs for unprovisioned or offline databases
try {
  setLogLevel('silent');
} catch {}
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
// NOTE: firestoreDatabaseId is NOT part of FirebaseOptions — it is handled separately
// for getFirestore(). Passing it to initializeApp would be ignored but we keep the
// config clean.
const firebaseConfig = { ...firebaseClientConfig };
void (firebaseConfig as any).measurementId;

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isAnalyticsSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    // Analytics ignored if unsupported in iframe or context
  });
}

/**
 * Resolve Firestore instance.
 * - If firestoreDatabaseId is null (meaning `(default)` or `default` or unset),
 *   use the default database via getFirestore(app).
 * - Otherwise use the named database.
 * This fixes the bug where `getFirestore(app, 'default')` would look for a
 * database literally named `default` which does not exist.
 */
function resolveFirestore() {
  const raw = firestoreDatabaseId;
  if (!raw) return getFirestore(app);
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === 'default' || trimmed === '(default)') {
    return getFirestore(app);
  }
  return getFirestore(app, trimmed);
}

export const db = resolveFirestore();
export const rtdb: Database = getDatabase(app, (firebaseConfig as any).databaseURL);
export const auth = getAuth(app);

// Ensure local persistence so sign-in survives page reloads and works in
// environments where session persistence might be cleared.
if (typeof window !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.warn('Could not set Firebase Auth persistence:', e);
  });
}

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
// Prefer select_account for Google so users can switch accounts.
try {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
} catch {}
try {
  githubProvider.addScope('read:user');
  githubProvider.addScope('user:email');
} catch {}

export { app };


/**
 * Attempt popup sign-in, falling back to redirect if popup is blocked.
 * This fixes the common "popup blocked" failure on mobile or strict browsers.
 */
async function signInWithPopupOrRedirect(provider: GoogleAuthProvider | GithubAuthProvider) {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error: any) {
    const code = String(error?.code ?? '').toLowerCase();
    const msg = String(error?.message ?? '').toLowerCase();
    if (code.includes('popup-blocked') || msg.includes('popup') && msg.includes('blocked')) {
      console.warn('Popup blocked, falling back to redirect:', error);
      await signInWithRedirect(auth, provider);
      // Redirect will navigate away; return null to indicate pending redirect
      return null as any;
    }
    throw error;
  }
}

export async function loginWithGoogle() {
  try {
    const user = await signInWithPopupOrRedirect(googleProvider);
    return user;
  } catch (error) {
    console.error('Firebase Auth Login Error:', error);
    throw error;
  }
}

export async function loginWithGithub() {
  try {
    const user = await signInWithPopupOrRedirect(githubProvider);
    return user;
  } catch (error) {
    console.error('Firebase GitHub Login Error:', error);
    throw error;
  }
}

export async function registerWithEmail(email: string, pass: string, name: string) {
  try {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    if (res.user && name) {
      try {
        await updateProfile(res.user, { displayName: name });
      } catch (e) {
        console.warn('Display name update failed:', e);
      }
    }
    return res.user;
  } catch (error) {
    console.error('Firebase Email Register Error:', error);
    throw error;
  }
}

export async function loginWithEmail(email: string, pass: string) {
  try {
    const res = await signInWithEmailAndPassword(auth, email, pass);
    return res.user;
  } catch (error) {
    console.error('Firebase Email Login Error:', error);
    throw error;
  }
}

export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Firebase Auth Logout Error:', error);
    throw error;
  }
}
export async function resetPassword(email: string) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Firebase Password Reset Error:', error);
    throw error;
  }
}

/** Helper to handle redirect result on app load (used by AuthCallbackPage fallback) */
export async function handleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (error) {
    console.warn('Redirect result error:', error);
    return null;
  }
}


export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on initial load (silent)
// async function testConnection() {
//   try {
//     await getDocFromServer(doc(db, 'test', 'connection'));
//   } catch (error) {
//     // Silent catch to prevent unnecessary warnings
//   }
// }
// testConnection();
