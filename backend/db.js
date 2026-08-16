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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || 'ai-studio-hazardnet-28005e8f-9924-4dea-983b-743f2fca6093');
export { collection, addDoc, getDocs, query, where, orderBy, limit, deleteDoc, doc, setDoc, getDoc, writeBatch };
export default db;

