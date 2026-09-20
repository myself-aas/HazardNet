import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, deleteDoc, doc, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig = {};
try {
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Could not read firebase-applet-config.json:', e.message);
}

function normalizeDbId(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed === 'default' || trimmed === '(default)') return null;
  return trimmed;
}

const rawDbId = firebaseConfig.firestoreDatabaseId || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || 'ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843';
const normalizedDbId = normalizeDbId(rawDbId) || 'ai-studio-hazardnet-55b49dbf-625b-492b-9cff-feabd729e843';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = normalizedDbId ? getFirestore(app, normalizedDbId) : getFirestore(app);
export { collection, addDoc, getDocs, query, where, orderBy, limit, deleteDoc, doc, setDoc, getDoc, writeBatch };
export default db;

