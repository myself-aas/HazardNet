import { before, after, beforeEach, test } from 'node:test';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, query, collection, where, updateDoc, deleteDoc } from 'firebase/firestore';
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-hazardnet', firestore: {
    rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080,
  } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });
const db = (uid, claims = {}) => uid ? env.authenticatedContext(uid, claims).firestore() : env.unauthenticatedContext().firestore();
const seed = (path, row) => env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), path), row));

test('connector secrets are owner-only, including queries and ownership changes', async () => {
  const row = { user_id: 'alice', config: { endpoint: 'https://hooks.slack.com/services/private' } };
  await assertSucceeds(setDoc(doc(db('alice'), 'user_connectors/alice_slack'), row));
  await assertFails(getDoc(doc(db('bob'), 'user_connectors/alice_slack')));
  await assertFails(getDoc(doc(db(), 'user_connectors/alice_slack')));
  await assertFails(updateDoc(doc(db('alice'), 'user_connectors/alice_slack'), { user_id: 'bob' }));
  await assertFails(setDoc(doc(db('bob'), 'user_connectors/forged'), row));
  await assertSucceeds(getDocs(query(collection(db('alice'), 'user_connectors'), where('user_id', '==', 'alice'))));
  await assertFails(getDocs(collection(db('alice'), 'user_connectors')));
});
test('private profile remains private; public projection rejects sensitive fields', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'profiles/alice'), { email: 'private', date_of_birth: 'private' }));
  await assertFails(getDoc(doc(db(), 'profiles/alice')));
  await assertFails(getDoc(doc(db('bob'), 'profiles/alice')));
  await assertSucceeds(getDoc(doc(db('alice'), 'profiles/alice')));
  const publicDoc = doc(db('alice'), 'public_profiles/alice');
  await assertSucceeds(setDoc(publicDoc, { username: 'alice', country: 'BD', profile_visibility: 'public' }));
  await assertSucceeds(getDoc(doc(db(), 'public_profiles/alice')));
  for (const field of ['email', 'phone_number', 'date_of_birth', 'pinpoint_lat', 'annual_income_bdt', 'config']) {
    await assertFails(updateDoc(publicDoc, { [field]: 'private' }));
  }
  await assertFails(updateDoc(publicDoc, { profile_visibility: 'private' })); // still contains country
  await assertSucceeds(setDoc(publicDoc, { username: 'alice', profile_visibility: 'private' }));
});
test('registered authors publish their own work; custom-claim admins moderate', async () => {
  const row = { author_id: 'alice', status: 'draft', title: 'Field report' };
  await assertSucceeds(setDoc(doc(db('alice'), 'blog_articles/one'), row));
  await assertFails(getDoc(doc(db(), 'blog_articles/one')));
  await assertFails(getDoc(doc(db('bob'), 'blog_articles/one')));
  await assertFails(updateDoc(doc(db('bob'), 'blog_articles/one'), { title: 'Hijacked' }));
  await assertFails(updateDoc(doc(db('alice'), 'blog_articles/one'), { author_id: 'bob' }));
  await assertFails(setDoc(doc(db('bob'), 'blog_articles/two'), row));
  await assertSucceeds(updateDoc(doc(db('alice'), 'blog_articles/one'), { status: 'published' }));
  await assertSucceeds(getDoc(doc(db(), 'blog_articles/one')));
  await assertSucceeds(updateDoc(doc(db('moderator', { admin: true }), 'blog_articles/one'), { status: 'draft' }));
  await assertSucceeds(deleteDoc(doc(db('moderator', { admin: true }), 'blog_articles/one')));
});
test('self-assigned profile role never grants moderator rights', async () => {
  await seed('blog_articles/one', { author_id: 'alice', status: 'draft' });
  await setDoc(doc(db('bob'), 'profiles/bob'), { role: 'admin' });
  await assertFails(deleteDoc(doc(db('bob'), 'blog_articles/one')));
});
test('assessment ownership follows actual snake_case client schema', async () => {
  await assertSucceeds(setDoc(doc(db('alice'), 'assessments/one'), { user_id: 'alice', district_id: 'dhaka' }));
  await assertFails(getDoc(doc(db('bob'), 'assessments/one')));
  await assertFails(updateDoc(doc(db('alice'), 'assessments/one'), { user_id: 'bob' }));
});
test('forecasts are public-read, server-write; push tokens are never client-readable', async () => {
  await seed('forecasts/one', { severity_score: 0.5 });
  await assertSucceeds(getDoc(doc(db(), 'forecasts/one')));
  await assertFails(setDoc(doc(db('moderator', { admin: true }), 'forecasts/one'), { severity_score: 0 }));
  await seed('push_subscriptions/one', { subscription: { endpoint: 'private' } });
  await assertFails(getDoc(doc(db('moderator', { admin: true }), 'push_subscriptions/one')));
});
