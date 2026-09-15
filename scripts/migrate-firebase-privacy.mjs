import { FieldValue } from 'firebase-admin/firestore';
// One-time privacy migration: dry run by default; does NOT print user data.
// Apply only after backup: FIREBASE_PRIVACY_MIGRATION=RUN node scripts/migrate-firebase-privacy.mjs
import { getAdminDb } from '../backend/admin.js';
const fields = [
  'display_name', 'username', 'photo_url', 'bio', 'user_role', 'organization',
  'country', 'division', 'district', 'primary_division', 'primary_district',
  'nationality', 'preferred_language', 'occupation', 'target_crops',
  'farm_size_hectares', 'farming_experience_years', 'irrigation_type', 'soil_type',
  'website', 'social_facebook', 'social_x', 'social_linkedin', 'social_github',
  'social_youtube', 'social_instagram', 'created_at',
];
const apply = process.env.FIREBASE_PRIVACY_MIGRATION === 'RUN';
const db = getAdminDb();
let count = 0;
let cursor;
do {
  let query = db.collection('profiles').orderBy('__name__').limit(200);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const entry of page.docs) {
    if (apply) await db.runTransaction(async (tx) => {
      const current = await tx.get(entry.ref);
      if (!current.exists) return;
      const row = current.data();
      const visibility = row.profile_visibility === 'private' ? 'private' : 'public';
      const projection = { profile_visibility: visibility };
      for (const key of visibility === 'private' ? ['username'] : fields) {
        if (row[key] !== undefined) projection[key] = row[key];
      }
      tx.set(db.collection('public_profiles').doc(entry.id), projection);
    });
    count++;
  }
  cursor = page.docs.at(-1);
} while (cursor);
console.log({ mode: apply ? 'apply' : 'dry-run', profileCount: count });

let articleCount = 0;
cursor = undefined;
do {
  let query = db.collection('blog_articles').orderBy('__name__').limit(200);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  if (page.empty) break;
  for (const entry of page.docs) {
    if ('author_email' in entry.data()) {
      if (apply) await entry.ref.update({ author_email: FieldValue.delete() });
      articleCount++;
    }
  }
  cursor = page.docs.at(-1);
} while (cursor);
console.log({ mode: apply ? 'apply' : 'dry-run', articleEmailsToRemove: articleCount });
