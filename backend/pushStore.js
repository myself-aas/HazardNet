import crypto from 'node:crypto';
import { getAdminDb } from './admin.js';
const idFor = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');
const store = () => getAdminDb().collection('push_subscriptions');
export const pushStore = {
  async size() { return (await store().count().get()).data().count; },
  async set(endpoint, value) { await store().doc(idFor(endpoint)).set(value); },
  async delete(endpoint) {
    const ref = store().doc(idFor(endpoint));
    const snapshot = await ref.get();
    await ref.delete();
    return snapshot.exists;
  },
  async entries() {
    return (await store().limit(5000).get()).docs.map((doc) => [doc.data().subscription.endpoint, doc.data()]);
  },
};
