import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { db } from '../services/firebase';
import { collection, query, getDocs, where, limit } from 'firebase/firestore';
const isProfileStoreConfigured = true;
import { HazardNetBrand } from '../components/HazardNetLogo';
import MaterialIcon from '../components/MaterialIcon';
import { PublicProfileCard } from '../components/user/PublicProfileCard';
import { sanitizeUsernameInput } from '../lib/username';
import { useI18n } from '../hooks/useI18n';
import { InfinityLoader } from '../components/brand';

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
  const { formatDate } = useI18n();

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setProfile(null);

    if (!isProfileStoreConfigured || !username) {
      // Store unavailable: show a friendly card instead of a hard error so
      // the route is still explorable.
      setState('offline');
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        let data: any = null; let error = null;
        try {
          // limit(1) is mandatory: firestore.rules denies an uncapped `list` on profiles,
          // which is what stops the collection being read as a directory of every account.
          const q = query(collection(db, 'profiles'), where('username', '==', username), limit(1));
          const snap = await getDocs(q);
          if(!snap.empty) data = { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch(e) { error = e; }
        if (cancelled) return;
        if (error) {
          // Private rows deny this read rather than returning nothing, so a denied query is
          // a username that exists but is not shared — not a 404.
          if ((error as { code?: string })?.code === 'permission-denied') {
            setState('private');
            return;
          }
          throw error;
        }
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
    ? formatDate(profile.createdAt, { monthYear: true })
    : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <HazardNetBrand size="sm" />
        <Link to="/" className="ap-btn ap-btn-secondary">
          Explore forecasts
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {state === 'loading' && (
        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Loading profile">
          <InfinityLoader size={88} label="Loading" announce={false} />
        </div>
      )}

      {(state === 'missing' || state === 'offline') && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-carbon-20 bg-carbon-05 p-6 sm:p-10 text-center"
          data-testid="profile-not-found"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-carbon-60">
            <MaterialIcon name="person" size={26} />
          </span>
          <h1 className="mt-4 text-lg font-bold text-carbon-90">
            {state === 'offline' ? `@${username} hasn’t synced yet` : `@${username} isn’t on HazardNet… yet`}
          </h1>
          <p className="mx-auto mt-1.5 max-w-sm text-base leading-[1.62] text-carbon-60">
            {state === 'offline'
              ? 'This deployment isn’t connected to the profile store, so public profiles can’t be loaded right now.'
              : 'The username may be unclaimed or the profile is set to private.'}
          </p>
          <Link to="/signup" className="ap-btn mt-5">
            Claim this username
          </Link>
        </motion.div>
      )}

      {state === 'private' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-carbon-20 bg-carbon-05 p-6 sm:p-10 text-center"
          data-testid="profile-private"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-carbon-60">
            <MaterialIcon name="lock" size={24} />
          </span>
          <h1 className="mt-4 text-lg font-bold text-carbon-90">This profile is private</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-base leading-[1.62] text-carbon-60">
            @{username} keeps their details visible only to themselves.
          </p>
        </motion.div>
      )}

      {state === 'found' && profile && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <PublicProfileCard
            headingLevel={1}
            profile={{
              displayName: profile.displayName,
              username: profile.username ?? username,
              photoURL: profile.photoURL,
              bio: profile.bio,
              userRole: profile.userRole,
              organization: profile.organization,
              district,
              division,
              country: profile.country,
              targetCrops: profile.targetCrops,
              farmSizeHectares: profile.farmSizeHectares,
              farmingExperienceYears: profile.farmingExperienceYears,
              irrigationType: profile.irrigationType,
              soilType: profile.soilType,
              website: profile.website,
              links: SOCIALS.filter(([key]) => profile[key]).map(([key, label]) => ({
                label,
                url: profile[key] as string,
              })),
              memberSince,
            }}
          />
        </motion.div>
      )}

      <p className="mt-6 text-center text-xs text-carbon-60">
        Every HazardNet member gets a profile like this at{' '}
        <span className="font-bold text-carbon-60">hazardnet.live/u/username</span>.{' '}
        <Link to="/signup" className="font-bold text-ap-link hover:underline">
          <span className="inline-flex items-center gap-1.5">
            Claim yours <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </Link>
      </p>
    </div>
  );
};

export default PublicProfilePage;
