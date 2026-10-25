/** Privileged forecast writer only. Never used by public conversion/profile routes.
 * Uses Application Default Credentials, or FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT
 * on hosts without workload identity. Firestore rules remain default-deny for client writes.
 */
import { getApps, initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Parse a raw or Base64-encoded service account JSON string and verify required fields.
 */
export function parseServiceAccountJson(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return { credential: null, error: 'Service account value is empty' };
  }
  const trimmed = rawValue.trim();
  let jsonText = trimmed;
  if (!trimmed.startsWith('{')) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        jsonText = decoded;
      }
    } catch {
      // Fall through to standard JSON.parse error handling
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return { credential: null, error: `Invalid JSON in service account secret: ${err.message}` };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { credential: null, error: 'Service account payload must be a JSON object' };
  }

  if (parsed.type && parsed.type !== 'service_account') {
    return {
      credential: null,
      error: `Expected service account type "service_account", received "${parsed.type}"`,
    };
  }

  const missingFields = ['project_id', 'client_email', 'private_key'].filter(
    (field) => typeof parsed[field] !== 'string' || !parsed[field].trim(),
  );
  if (missingFields.length > 0) {
    return {
      credential: null,
      error: `Service account JSON missing required fields: ${missingFields.join(', ')}`,
    };
  }

  return { credential: parsed, error: null };
}

/**
 * Validate whether the current environment has a usable Firebase Admin service account
 * credential before enabling Firestore ingestion in CI.
 */
export function validateServiceAccountEnv(env = process.env) {
  const candidates = [
    ['FIREBASE_SERVICE_ACCOUNT_JSON', env.FIREBASE_SERVICE_ACCOUNT_JSON],
    ['FIREBASE_SERVICE_ACCOUNT', env.FIREBASE_SERVICE_ACCOUNT],
  ];

  for (const [source, raw] of candidates) {
    if (typeof raw === 'string' && raw.trim() !== '') {
      const { credential, error } = parseServiceAccountJson(raw);
      if (credential) {
        return {
          valid: true,
          source,
          projectId: credential.project_id,
          reason: null,
          credential,
        };
      }
      return {
        valid: false,
        source,
        projectId: null,
        reason: `${source} is set but invalid (${error})`,
        credential: null,
      };
    }
  }

  if (typeof env.GOOGLE_APPLICATION_CREDENTIALS === 'string' && env.GOOGLE_APPLICATION_CREDENTIALS.trim() !== '') {
    const credPath = env.GOOGLE_APPLICATION_CREDENTIALS.trim();
    if (existsSync(credPath)) {
      try {
        const fileContent = readFileSync(credPath, 'utf8');
        const { credential, error } = parseServiceAccountJson(fileContent);
        if (credential) {
          return {
            valid: true,
            source: 'GOOGLE_APPLICATION_CREDENTIALS',
            projectId: credential.project_id,
            reason: null,
            credential,
          };
        }
        return {
          valid: false,
          source: 'GOOGLE_APPLICATION_CREDENTIALS',
          projectId: null,
          reason: `GOOGLE_APPLICATION_CREDENTIALS file is invalid (${error})`,
          credential: null,
        };
      } catch (err) {
        return {
          valid: false,
          source: 'GOOGLE_APPLICATION_CREDENTIALS',
          projectId: null,
          reason: `Failed to read GOOGLE_APPLICATION_CREDENTIALS: ${err.message}`,
          credential: null,
        };
      }
    }
    return {
      valid: false,
      source: 'GOOGLE_APPLICATION_CREDENTIALS',
      projectId: null,
      reason: `GOOGLE_APPLICATION_CREDENTIALS path does not exist: ${credPath}`,
      credential: null,
    };
  }

  return {
    valid: false,
    source: null,
    projectId: null,
    reason: 'Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT is configured',
    credential: null,
  };
}

/**
 * Resolve the parsed service account object from environment variables, or throw if malformed.
 */
export function resolveServiceAccountCredential(env = process.env) {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !String(raw).trim()) return null;
  const { credential, error } = parseServiceAccountJson(String(raw));
  if (error) {
    throw new Error(error);
  }
  return credential;
}

let writer;
export function getForecastWriter() {
  if (writer) return writer;
  const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
  const name = 'hazardnet-forecast-writer';
  const serviceAccount = resolveServiceAccountCredential(process.env);
  const app =
    getApps().find((candidate) => candidate.name === name) ||
    initializeApp(
      {
        credential: serviceAccount ? cert(serviceAccount) : applicationDefault(),
        projectId: config.projectId || serviceAccount?.project_id || process.env.FIREBASE_PROJECT_ID,
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
  const normalizedDate =
    typeof predictionDate === 'object' && predictionDate !== null
      ? (predictionDate.predictionDate ?? rows?.[0]?.prediction_date ?? null)
      : predictionDate;

  // One atomic transaction: never split a replacement into partial successful chunks.
  return db.runTransaction(async (transaction) => {
    const collection = db.collection('forecasts');
    const old =
      normalizedDate === null ? null : await transaction.get(collection.where('prediction_date', '==', normalizedDate));
    const deletions = old ? old.docs : [];
    if (deletions.length + rows.length > 500) {
      throw new Error('Atomic forecast write exceeds the 500-operation limit');
    }
    for (const document of deletions) transaction.delete(document.ref);
    for (const row of rows) transaction.set(collection.doc(), row);
    return { written: rows.length };
  });
}
