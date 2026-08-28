/**
 * HazardNet client configuration — single source of truth (ARC-01 / SEC-07).
 *
 * All service identifiers come from Vite env vars. The defaults below are
 * the *canonical* public client identifiers (Firebase web configs are
 * public-by-design) and exist only so the app boots without a local .env.
 * Set real values per environment in production:
 *
 *   VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_DATABASE_URL,
 *   VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET,
 *   VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID,
 *   VITE_FIREBASE_MEASUREMENT_ID, VITE_FIREBASE_FIRESTORE_DATABASE_ID
 *
 * Do not introduce additional Firebase config literals elsewhere — the
 * removed `src/firebase.ts` (an unused second project) is the cautionary tale.
 */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBwyxWm0MIQlTmjJ-NKPKjl72AYLS7oDqQ',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'hazardnet-aas48424.firebaseapp.com',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'https://hazardnet-aas48424-default-rtdb.firebaseio.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'hazardnet-aas48424',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'hazardnet-aas48424.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1053636076316',
  appId: env.VITE_FIREBASE_APP_ID || '1:1053636076316:web:0fbe66d8e4b90c2de9d0d9',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-G40YRHHD94',
};

/** Firestore database id (the AI-Studio applet database used for forecasts). */
export const firestoreDatabaseId =
  env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-hazardnet-28005e8f-9924-4dea-983b-743f2fca6093';
