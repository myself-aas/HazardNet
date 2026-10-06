import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Button, Container } from '../components/apple/primitives';
import { Panel } from '../components/user/dashboard/ui';
import { ProfileDetails } from '../components/user/dashboard/ProfileDetails';
import { PublicProfileCard } from '../components/user/PublicProfileCard';
import { FirebaseRealtimeStatus } from '../components/FirebaseRealtimeStatus';
import IdentityConnections from '../components/IdentityConnections';
import Breadcrumbs from '../components/Breadcrumbs';
import MaterialIcon from '../components/MaterialIcon';
import { profilePath } from '../lib/username';
import { useI18n } from '../hooks/useI18n';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { getGranularDisasterData } from '../data/disasterDetails';
import { getSeverityTier } from '../services/geolocationService';
import { InfinityLoader } from '../components/brand';

/**
 * Signed-in user profile — unique URL: /profile
 *
 * This page and `/dashboard?tab=profile` edit the same Firestore document, so
 * they render the same editor (`components/user/dashboard/ProfileDetails`). This
 * page adds what the dashboard tab does not: the account identity header, the
 * district outlook for the home district, the session controls and the live
 * public card.
 *
 * What the 2026-10-06 pass removed here, per the audit
 * (docs/audits/2026-10-06-profile-page-design-audit.md): the single outer white
 * card that held the entire page, the `overflow-y-auto` form inside it, the
 * seven hand-rolled inputs, the second switch design, the second severity-green
 * accent, the duplicated sign-out and the two "go to the dashboard" buttons.
 * What is left is a header on the page canvas and one `Panel` per group, and the
 * controls are the user-area kit's.
 */

/**
 * Severity ink for the hazard tile. Severity is a protected data encoding, so
 * this one keeps its hue — but it has to TRACK the reading. It was a fixed
 * rose, which painted a 20% score the same red as a 95% one. The -300 steps
 * are the tints that clear AA on the tile's tinted surface.
 */
const SEVERITY_INK_ON_TILE: Record<string, string> = {
  low: 'text-emerald-300',
  moderate: 'text-amber-300',
  high: 'text-orange-300',
  veryHigh: 'text-rose-300',
  extreme: 'text-rose-300',
};

const PERSONA_LABELS: Record<string, string> = {
  smallholder_farmer: 'Rural smallholder farmer',
  ngo_coordinator: 'NGO disaster coordinator',
  govt_official: 'DAE / government extension officer',
  academic_researcher: 'Academic climate scientist',
  commercial_agribusiness: 'Commercial agro-business',
};

export const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, loading, signOut, sendPasswordResetEmail } = useAuth();
  const { formatDate } = useI18n();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      toast.success('Signed out securely. Session state cleared.');
      navigate('/', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Failed to sign out. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email) {
      toast.error('No email associated with this account.');
      return;
    }
    setIsSendingReset(true);
    try {
      await sendPasswordResetEmail(user.email);
      toast.success(`Password reset link dispatched to ${user.email}`, {
        icon: <MaterialIcon name="mail" className="w-4 h-4 inline-block mr-1" />,
      });
    } catch (err) {
      console.error('Reset error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to dispatch password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-label="Loading profile">
        <InfinityLoader size={88} label="Loading" announce={false} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login?next=/profile" replace />;
  }

  const displayName = userProfile?.displayName || user.displayName || '';
  const publicUsername = userProfile?.username;
  const homeDistrict =
    ALL_64_DISTRICTS.find((district) => district.id === userProfile?.homeDistrictId) ??
    ALL_64_DISTRICTS.find((district) => district.name === userProfile?.primaryDistrict) ??
    null;
  const outlookDistrict = homeDistrict ?? ALL_64_DISTRICTS.find((district) => district.id === 'dhaka') ?? ALL_64_DISTRICTS[0];
  const granular = getGranularDisasterData(outlookDistrict.id);
  const severityPercent = Math.round(outlookDistrict.severity * 100);
  const publicLinks = (
    [
      ['Facebook', userProfile?.socialFacebook],
      ['X (Twitter)', userProfile?.socialX],
      ['LinkedIn', userProfile?.socialLinkedin],
      ['GitHub', userProfile?.socialGithub],
      ['YouTube', userProfile?.socialYoutube],
      ['Instagram', userProfile?.socialInstagram],
    ] as Array<[string, string | undefined]>
  )
    .filter(([, url]) => Boolean(url))
    .map(([label, url]) => ({ label, url: url as string }));

  return (
    <Container width="text">
      <div className="space-y-6 pb-ap-xl" data-testid="user-profile-page">
        <Breadcrumbs />

        {/* ── Identity header, on the canvas ───────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName || 'Your profile picture'}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-ap-action-fg">
                {(displayName || user.email || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-ap-lead font-bold leading-tight tracking-tight text-carbon-90">
                {displayName || 'User Profile'}
              </h1>
              <p className="truncate text-sm text-carbon-60">{user.email}</p>
              {userProfile?.userRole && (
                <p className="mt-0.5 text-sm text-carbon-70">{PERSONA_LABELS[userProfile.userRole] ?? userProfile.userRole}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {publicUsername && (
              <Link to={profilePath(publicUsername)} className="ap-btn ap-btn-secondary">
                Public page
              </Link>
            )}
            <Link to="/dashboard" className="ap-btn ap-btn-secondary">
              Dashboard
            </Link>
          </div>
        </header>

        <ProfileDetails saveErrorMessage="Failed to save profile changes." />

        {/* ── District outlook: severity is data here, and it is the only place on this
               page that spends a severity hue. ───────────────────────────────────── */}
        <Panel
          title="District outlook"
          description={
            homeDistrict
              ? `Identified from your home district (${outlookDistrict.name}) rather than raw coordinates.`
              : 'Pick a home district in Location above to pin this outlook to your area. It falls back to Dhaka.'
          }
        >
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-carbon-60">District</dt>
              <dd className="mt-0.5 text-sm font-semibold text-carbon-90">
                {outlookDistrict.name} ({outlookDistrict.division})
              </dd>
            </div>
            <div>
              <dt className="text-sm text-carbon-60">Primary hazard</dt>
              <dd className="mt-0.5 text-sm font-semibold text-carbon-90">{outlookDistrict.hazardType}</dd>
            </div>
            <div>
              <dt className="text-sm text-carbon-60">Severity</dt>
              <dd
                data-severity-ink
                className={`mt-0.5 text-sm font-bold ${SEVERITY_INK_ON_TILE[getSeverityTier(outlookDistrict.severity)]}`}
              >
                {outlookDistrict.risk} · {severityPercent}%
              </dd>
            </div>
            <div>
              <dt className="text-sm text-carbon-60">Vulnerable crop</dt>
              <dd className="mt-0.5 text-sm font-semibold text-carbon-90">{outlookDistrict.mainCrop}</dd>
            </div>
          </dl>

          {granular?.modelAssessment?.confidenceProbabilities && (
            <div className="mt-5 border-t border-carbon-10 pt-4">
              <p className="text-sm font-semibold text-carbon-80">
                Multi-hazard risk distribution for {outlookDistrict.name}
              </p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                {granular.modelAssessment.confidenceProbabilities.map((item: { hazard: string; probability: number }, index: number) => (
                  <li key={index} className="text-sm text-carbon-70">
                    {item.hazard}: <span className="font-semibold text-carbon-90">{Math.round(item.probability * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-5">
            <Link to={`/live?district=${outlookDistrict.id}`} className="ap-btn ap-btn-secondary">
              Open on the live map
            </Link>
          </div>
        </Panel>

        {/* ── Session and recovery: one sign-out control on the whole page. ─── */}
        <Panel title="Account and session" description="The identity this browser is signed in with.">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-carbon-60">Account UID</dt>
              <dd className="mt-0.5 truncate font-mono text-sm text-carbon-80">{user.uid}</dd>
            </div>
            <div>
              <dt className="text-sm text-carbon-60">Provider</dt>
              <dd className="mt-0.5 text-sm font-semibold text-carbon-90">
                {user.providerData[0]?.providerId || 'password'}
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-carbon-10 pt-5">
            {user.email && (
              <Button intent="secondary" size="sm" onClick={handleSendResetEmail} disabled={isSendingReset}>
                <MaterialIcon name="key" size={14} />
                {isSendingReset ? 'Sending…' : 'Send password reset link'}
              </Button>
            )}
            <Button intent="secondary" size="sm" onClick={handleLogout} disabled={isLoggingOut}>
              <MaterialIcon name="logout" size={14} />
              {isLoggingOut ? 'Signing out…' : 'Sign out and clear local state'}
            </Button>
          </div>
        </Panel>

        <Panel title="Connected accounts" description="Sign in with one click using any linked provider.">
          <IdentityConnections />
        </Panel>

        <Panel title="Realtime sync" description="Whether this browser is holding a live realtime connection.">
          <FirebaseRealtimeStatus />
        </Panel>

        {/* ── Your public card, exactly as a visitor resolves it ─────────────── */}
        {publicUsername && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight text-carbon-90">Your public page</h2>
            <p className="max-w-prose text-sm leading-[1.62] text-carbon-70">
              This is the card visitors resolve at hazardnet.live{profilePath(publicUsername)}.
            </p>
            <PublicProfileCard
              headingLevel={2}
              profile={{
                displayName: displayName || 'HazardNet member',
                username: publicUsername,
                photoURL: userProfile?.photoURL,
                bio: userProfile?.bio,
                userRole: userProfile?.userRole,
                organization: userProfile?.organization,
                district: userProfile?.district || userProfile?.primaryDistrict,
                division: userProfile?.division || userProfile?.primaryDivision,
                country: userProfile?.country,
                targetCrops: userProfile?.targetCrops,
                farmSizeHectares: userProfile?.farmSizeHectares,
                farmingExperienceYears: userProfile?.farmingExperienceYears,
                irrigationType: userProfile?.irrigationType,
                soilType: userProfile?.soilType,
                website: userProfile?.website,
                links: publicLinks,
                memberSince: userProfile?.createdAt
                  ? formatDate(userProfile.createdAt, { monthYear: true })
                  : null,
              }}
            />
          </section>
        )}
      </div>
    </Container>
  );
};

export default UserProfilePage;
