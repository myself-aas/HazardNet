import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { db } from '../services/firebase';
import { collection, query, getDocs, where, getDoc, doc } from 'firebase/firestore';
const isSupabaseConfigured = true;
import { HazardNetBrand } from '../components/HazardNetLogo';
import MaterialIcon from '../components/MaterialIcon';
import { sanitizeUsernameInput } from '../lib/username';

/**
 * Public profile page — unique URL: /u/<username>
 *
 * The username a user claims in their dashboard is their address on the web.
 * Fetches the `profiles` row by username (RLS exposes only rows marked
 * public), renders a clean profile card, and handles unknown/private users.
 */

interface PublicProfile {
  displayName: string;
  username: string | null;
  photoURL: string | null;
  bio: string | null;
  userRole: string | null;
  organization: string | null;
  district: string | null;
  primaryDistrict: string | null;
  division: string | null;
  primaryDivision: string | null;
  country: string | null;
  targetCrops: string | null;
  farmSizeHectares: number | null;
  farmingExperienceYears: number | null;
  irrigationType: string | null;
  soilType: string | null;
  website: string | null;
  socialFacebook: string | null;
  socialX: string | null;
  socialLinkedin: string | null;
  socialGithub: string | null;
  socialYoutube: string | null;
  socialInstagram: string | null;
  profileVisibility: string | null;
  createdAt: string | null;
}

type LoadState = 'loading' | 'found' | 'private' | 'missing' | 'offline';

const SOCIALS: Array<[keyof PublicProfile, string]> = [
  ['socialFacebook', 'Facebook'],
  ['socialX', 'X (Twitter)'],
  ['socialLinkedin', 'LinkedIn'],
  ['socialGithub', 'GitHub'],
  ['socialYoutube', 'YouTube'],
  ['socialInstagram', 'Instagram'],
];

const PublicProfilePage: React.FC = () => {
  const { username: rawUsername } = useParams<{ username: string }>();
  const username = sanitizeUsernameInput(rawUsername ?? '');
  const [state, setState] = useState<LoadState>('loading');
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setProfile(null);

    if (!isSupabaseConfigured || !username) {
      // Demo mode without Supabase: show a friendly sample card instead of a
      // hard error so the route is still explorable.
      setState('offline');
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        let data: any = null; let error = null;
        try {
          const q = query(collection(db, 'profiles'), where('username', '==', username));
          const snap = await getDocs(q);
          if(!snap.empty) data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch(e) { error = e; }
        if (cancelled) return;
        if (error) throw error;
        if (!data) {
          setState('missing');
          return;
        }
        const row = data as Record<string, unknown>;
        if (row.profile_visibility === 'private') {
          setState('private');
          return;
        }
        setProfile({
          displayName: (row.display_name as string) ?? 'HazardNet member',
          username: (row.username as string) ?? username,
          photoURL: (row.photo_url as string) || null,
          bio: (row.bio as string) ?? null,
          userRole: (row.user_role as string) ?? null,
          organization: (row.organization as string) || null,
          district: (row.district as string) || null,
          primaryDistrict: (row.primary_district as string) || null,
          division: (row.division as string) || null,
          primaryDivision: (row.primary_division as string) || null,
          country: (row.country as string) || null,
          targetCrops: (row.target_crops as string) || null,
          farmSizeHectares: (row.farm_size_hectares as number) || null,
          farmingExperienceYears: (row.farming_experience_years as number) || null,
          irrigationType: (row.irrigation_type as string) || null,
          soilType: (row.soil_type as string) || null,
          website: (row.website as string) || null,
          socialFacebook: (row.social_facebook as string) || null,
          socialX: (row.social_x as string) || null,
          socialLinkedin: (row.social_linkedin as string) || null,
          socialGithub: (row.social_github as string) || null,
          socialYoutube: (row.social_youtube as string) || null,
          socialInstagram: (row.social_instagram as string) || null,
          profileVisibility: (row.profile_visibility as string) ?? 'public',
          createdAt: (row.created_at as string) ?? null,
        });
        setState('found');
        document.title = `@${username} · HazardNet`;
      } catch (error) {
        console.error('Public profile fetch failed:', error);
        if (!cancelled) setState('missing');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username]);

  const district = profile?.district || profile?.primaryDistrict;
  const division = profile?.division || profile?.primaryDivision;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <HazardNetBrand size="sm" />
        <Link to="/" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[11px] font-extrabold text-slate-700 shadow-xs transition-colors hover:bg-slate-50">
          Explore forecasts →
        </Link>
      </div>

      {state === 'loading' && (
        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading profile">
          <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-amber-500" />
        </div>
      )}

      {(state === 'missing' || state === 'offline') && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 text-center shadow-sm"
          data-testid="profile-not-found"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <MaterialIcon name="person" size={26} />
          </span>
          <h1 className="mt-4 text-lg font-black text-slate-900">
            {state === 'offline' ? `@${username} hasn’t synced yet` : `@${username} isn’t on HazardNet… yet`}
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
            {state === 'offline'
              ? 'This deployment isn’t connected to Supabase, so public profiles can’t be loaded right now.'
              : 'The username may be unclaimed or the profile is set to private.'}
          </p>
          <Link
            to="/signup"
            className="mt-5 inline-block rounded-2xl bg-nasa-red px-5 py-3 text-xs font-extrabold text-slate-950 shadow-md transition-colors hover:bg-nasa-red-shade"
          >
            Claim this username
          </Link>
        </motion.div>
      )}

      {state === 'private' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 text-center shadow-sm"
          data-testid="profile-private"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <MaterialIcon name="lock" size={24} />
          </span>
          <h1 className="mt-4 text-lg font-black text-slate-900">This profile is private</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
            @{username} keeps their details visible only to themselves.
          </p>
        </motion.div>
      )}

      {state === 'found' && profile && (
        <motion.article
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          data-testid="public-profile-card"
        >
          <div className="h-28 bg-gradient-to-r from-slate-900 via-slate-800 to-[#b45309]" />
          <div className="px-6 pb-6 sm:px-8">
            <div className="-mt-12 mb-4">
              {profile.photoURL ? (
                <img src={profile.photoURL} alt={profile.displayName} className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-gradient-to-tr from-amber-500 to-amber-300 text-3xl font-black text-slate-950 shadow-md">
                  {profile.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{profile.displayName}</h1>
              <span className="text-sm font-bold text-amber-700">@{profile.username ?? username}</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {profile.userRole?.replace(/_/g, ' ')}
              {profile.organization ? ` · ${profile.organization}` : ''}
              {memberSince ? ` · Member since ${memberSince}` : ''}
            </p>

            {profile.bio && <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">{profile.bio}</p>}

            <div className="mt-4 flex flex-wrap gap-1.5">
              {(district || division) && (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-extrabold text-slate-700">
                  <MaterialIcon name="pin" size={12} className="mr-1 inline text-slate-500" />
                  {[district, division, profile.country ?? 'Bangladesh'].filter(Boolean).join(', ')}
                </span>
              )}
              {profile.targetCrops && (
                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-extrabold text-emerald-700">
                  🌾 {profile.targetCrops}
                </span>
              )}
              {profile.farmSizeHectares != null && profile.farmSizeHectares > 0 && (
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-extrabold text-amber-800">
                  {profile.farmSizeHectares} ha
                </span>
              )}
              {profile.irrigationType && (
                <span className="rounded-full bg-sky-50 px-3 py-1.5 text-[11px] font-extrabold text-sky-700">
                  💧 {profile.irrigationType}
                </span>
              )}
              {profile.soilType && (
                <span className="rounded-full bg-stone-100 px-3 py-1.5 text-[11px] font-extrabold text-stone-600">
                  {profile.soilType} soil
                </span>
              )}
              {profile.farmingExperienceYears != null && profile.farmingExperienceYears > 0 && (
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-[11px] font-extrabold text-violet-700">
                  {profile.farmingExperienceYears} yrs experience
                </span>
              )}
            </div>

            {(SOCIALS.some(([key]) => profile[key]) || profile.website) && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {profile.website && (
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-slate-900 px-3.5 py-2 text-[11px] font-extrabold text-white transition-colors hover:bg-slate-800"
                  >
                    🌐 Website
                  </a>
                )}
                {SOCIALS.filter(([key]) => profile[key]).map(([key, label]) => {
                  const url = profile[key] as string;
                  return (
                    <a
                      key={key}
                      href={url.startsWith('http') ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-slate-200 px-3.5 py-2 text-[11px] font-extrabold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {label} ↗
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </motion.article>
      )}

      <p className="mt-6 text-center text-[11px] text-slate-400">
        Every HazardNet member gets a profile like this at{' '}
        <span className="font-bold text-slate-500">hazardnet.live/u/username</span>.{' '}
        <Link to="/signup" className="font-bold text-amber-700 hover:underline">
          Claim yours →
        </Link>
      </p>
    </div>
  );
};

export default PublicProfilePage;
