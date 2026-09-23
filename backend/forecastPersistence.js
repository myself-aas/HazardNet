/** Privileged forecast writer only. Never used by public conversion/profile routes.
 * Uses Application Default Credentials, or FIREBASE_SERVICE_ACCOUNT_JSON on hosts
 * without workload identity. Firestore rules remain default-deny for client writes.
 */
import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

let writer;
export function getForecastWriter() {
  if (writer) return writer;
  const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
  const name = 'hazardnet-forecast-writer';
  const app =
    getApps().find((candidate) => candidate.name === name) ||
    initializeApp(
      {
        credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
          ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
          : applicationDefault(),
        projectId: config.projectId,
      },
      name,
    );
  // Match backend/db.js: the checked-in applet configuration is authoritative.
  const raw = config.firestoreDatabaseId ?? process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
  const databaseId = !raw || ['default', '(default)'].includes(raw.trim()) ? '(default)' : raw.trim();
  writer = getFirestore(app, databaseId);
  return writer;
}

export async function persistForecasts(rows, predictionDate = null, db = getForecastWriter()) {
  // One atomic transaction: never split a replacement into partial successful chunks.
  return db.runTransaction(async (transaction) => {
    const collection = db.collection('forecasts');
    const old =
      predictionDate === null ? null : await transaction.get(collection.where('prediction_date', '==', predictionDate));
    const deletions = old ? old.docs : [];
    if (deletions.length + rows.length > 500) {
      throw new Error('Atomic forecast write exceeds the 500-operation limit');
    }
    for (const document of deletions) transaction.delete(document.ref);
    for (const row of rows) transaction.set(collection.doc(), row);
    return { written: rows.length };
  });
}
