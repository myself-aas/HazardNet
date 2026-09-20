/** @jest-environment node */
import { persistForecasts } from '../backend/forecastPersistence.js';

function fakeDb(oldDocs = []) {
  const transaction = { get: jest.fn(async () => ({ docs: oldDocs })), delete: jest.fn(), set: jest.fn() };
  const collection = { where: jest.fn(() => 'date-query'), doc: jest.fn(() => 'new-ref') };
  return {
    transaction,
    collection,
    db: { collection: jest.fn(() => collection), runTransaction: jest.fn(async (fn) => fn(transaction)) },
  };
}
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
