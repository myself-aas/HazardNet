/** @jest-environment node */
import {
  persistForecasts,
  parseServiceAccountJson,
  validateServiceAccountEnv,
  resolveServiceAccountCredential,
} from '../backend/forecastPersistence.js';

function fakeDb(oldDocs = []) {
  const transaction = { get: jest.fn(async () => ({ docs: oldDocs })), delete: jest.fn(), set: jest.fn() };
  const collection = { where: jest.fn(() => 'date-query'), doc: jest.fn(() => 'new-ref') };
  return {
    transaction,
    collection,
    db: { collection: jest.fn(() => collection), runTransaction: jest.fn(async (fn) => fn(transaction)) },
  };
}

const VALID_SA = {
  type: 'service_account',
  project_id: 'hazardnet-prod',
  private_key_id: 'key-123',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----\n',
  client_email: 'ingest-bot@hazardnet-prod.iam.gserviceaccount.com',
};

test('replacement reads and atomically deletes/inserts in one transaction', async () => {
  const { db, transaction, collection } = fakeDb([{ ref: 'old-ref' }]);
  const rows = [{ prediction_date: '2026-09-20', district_id: 19 }];
  await expect(persistForecasts(rows, '2026-09-20', db)).resolves.toEqual({ written: 1 });
  expect(collection.where).toHaveBeenCalledWith('prediction_date', '==', '2026-09-20');
  expect(transaction.delete).toHaveBeenCalledWith('old-ref');
  expect(transaction.set).toHaveBeenCalledWith('new-ref', rows[0]);
  expect(db.runTransaction).toHaveBeenCalledTimes(1);
});

test('append also awaits the durable transaction', async () => {
  const { db, transaction } = fakeDb();
  await persistForecasts([{ district_id: 19 }], null, db);
  expect(transaction.get).not.toHaveBeenCalled();
  expect(transaction.set).toHaveBeenCalledTimes(1);
});

test('oversized replacement fails before scheduling mutations', async () => {
  const { db, transaction } = fakeDb(Array.from({ length: 500 }, () => ({ ref: 'old' })));
  await expect(persistForecasts([{}], '2026-09-20', db)).rejects.toThrow('500-operation');
  expect(transaction.set).not.toHaveBeenCalled();
  expect(transaction.delete).not.toHaveBeenCalled();
});

test('commit/credentials failure propagates, never returning success', async () => {
  const { db } = fakeDb();
  db.runTransaction.mockRejectedValue(new Error('permission denied'));
  await expect(persistForecasts([{}], null, db)).rejects.toThrow('permission denied');
});

test('validateServiceAccountEnv resolves both FIREBASE_SERVICE_ACCOUNT_JSON and FIREBASE_SERVICE_ACCOUNT', () => {
  const resJson = validateServiceAccountEnv({
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(VALID_SA),
  });
  expect(resJson.valid).toBe(true);
  expect(resJson.source).toBe('FIREBASE_SERVICE_ACCOUNT_JSON');
  expect(resJson.projectId).toBe('hazardnet-prod');

  const resFallback = validateServiceAccountEnv({
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify(VALID_SA),
  });
  expect(resFallback.valid).toBe(true);
  expect(resFallback.source).toBe('FIREBASE_SERVICE_ACCOUNT');
  expect(resFallback.projectId).toBe('hazardnet-prod');
});

test('parseServiceAccountJson supports Base64-encoded service account JSON', () => {
  const encoded = Buffer.from(JSON.stringify(VALID_SA), 'utf8').toString('base64');
  const { credential, error } = parseServiceAccountJson(encoded);
  expect(error).toBeNull();
  expect(credential.project_id).toBe('hazardnet-prod');
  expect(credential.client_email).toBe(VALID_SA.client_email);
});

test('validateServiceAccountEnv rejects when only FIREBASE_PROJECT_ID is set without service account JSON', () => {
  const res = validateServiceAccountEnv({
    FIREBASE_PROJECT_ID: 'hazardnet-prod',
  });
  expect(res.valid).toBe(false);
  expect(res.reason).toMatch(/Neither FIREBASE_SERVICE_ACCOUNT_JSON nor FIREBASE_SERVICE_ACCOUNT/);
  expect(resolveServiceAccountCredential({ FIREBASE_PROJECT_ID: 'hazardnet-prod' })).toBeNull();
});

test('validateServiceAccountEnv rejects malformed JSON or missing required service account keys', () => {
  const badJson = validateServiceAccountEnv({
    FIREBASE_SERVICE_ACCOUNT: '{not-valid-json',
  });
  expect(badJson.valid).toBe(false);
  expect(badJson.reason).toMatch(/Invalid JSON/);

  const incompleteSa = validateServiceAccountEnv({
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', project_id: 'only-project' }),
  });
  expect(incompleteSa.valid).toBe(false);
  expect(incompleteSa.reason).toMatch(/missing required fields: client_email, private_key/);
});
