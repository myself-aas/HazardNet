import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../services/firebase';

// Explicit public projection. Contact, exact location, birth date, income,
// identity email and notification preferences NEVER belong in this collection.
export const PUBLIC_PROFILE_FIELDS = [
  'display_name', 'username', 'photo_url', 'bio', 'user_role', 'organization',
  'country', 'division', 'district', 'primary_division', 'primary_district',
  'nationality', 'preferred_language', 'occupation', 'target_crops',
  'farm_size_hectares', 'farming_experience_years', 'irrigation_type', 'soil_type',
  'website', 'social_facebook', 'social_x', 'social_linkedin', 'social_github',
  'social_youtube', 'social_instagram', 'created_at',
] as const;

export function publicProfile(row: Record<string, unknown>) {
  const visibility = row.profile_visibility === 'private' ? 'private' : 'public';
  const result: Record<string, unknown> = { profile_visibility: visibility };
  // Reserve a username without exposing a private profile's demographic data.
  const fields = visibility === 'private' ? ['username'] : PUBLIC_PROFILE_FIELDS;
  for (const key of fields) if (row[key] !== undefined) result[key] = row[key];
  return result;
}

export async function saveProfile(uid: string, patch: Record<string, unknown>, createOnly = false) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'profiles', uid);
    const snapshot = await tx.get(ref);
    const row = createOnly && snapshot.exists() ? snapshot.data() : { ...snapshot.data(), ...patch };
    tx.set(ref, row);
    // Replace, never merge: removing a public field or making the profile
    // private must remove previously published values atomically.
    tx.set(doc(db, 'public_profiles', uid), publicProfile(row));
  });
}
