import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config();

// Lazy initialization keeps imports/builds credential-free. Credentials are
// server-only: ADC on managed hosts, or a secret JSON env value on Vercel.
export function getAdminApp() {
  const existing = getApps().find((app) => app.name === 'hazardnet-server');
  if (existing) return existing;
  const config = JSON.parse(fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
  const options = { projectId: process.env.FIREBASE_PROJECT_ID || config.projectId };
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    options.credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } else if (!process.env.FIRESTORE_EMULATOR_HOST) {
    options.credential = applicationDefault();
  }
  return initializeApp(options, 'hazardnet-server');
}
export function getAdminDb() {
  const config = JSON.parse(fs.readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
  return getFirestore(getAdminApp(), process.env.FIREBASE_DATABASE_ID || config.firestoreDatabaseId || '(default)');
}
export const getAdminAuth = () => getAuth(getAdminApp());
