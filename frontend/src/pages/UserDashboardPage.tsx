import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { UserAvatarField } from '../components/user/UserAvatarField';
import { OverviewSection } from '../components/user/dashboard/OverviewSection';
import { ProfileSection } from '../components/user/dashboard/ProfileSection';
import { AccountSection } from '../components/user/dashboard/AccountSection';
import { ConnectorsSection } from '../components/user/dashboard/ConnectorsSection';
import MaterialIcon from '../components/MaterialIcon';
import { HazardNetBrand } from '../components/HazardNetLogo';
import { profilePath, sanitizeUsernameInput } from '../lib/username';
import { Card } from '../components/user/dashboard/ui';
import { useI18n } from '../hooks/useI18n';

/**
 * The dedicated per-user dashboard — unique URL: /dashboard (auth required).
 *
 * Five sections: Overview (stats + completeness), Profile (all editable data
 * stored in Firestore), Account & Security (email/password/identities),
 * Connectors (integrations), Public Profile (live preview of /u/<username>).
 */

type Tab = 'overview' | 'profile' | 'account' | 'connectors' | 'public';

const TABS: Array<{ id: Tab; label: string; icon: string; hint: string }> = [
  { id: 'overview', label: 'Overview', icon: 'grid_view', hint: 'Stats, completion & quick actions' },
  { id: 'profile', label: 'Edit Profile', icon: 'person', hint: 'Identity, farm, social & preferences' },
  { id: 'account', label: 'Account & Security', icon: 'shield', hint: 'Email, password, linked accounts' },
  { id: 'connectors', label: 'Connectors', icon: 'hub', hint: 'Weather, alerts & productivity integrations' },
  { id: 'public', label: 'Public Profile', icon: 'visibility', hint: 'What the world sees at /u/username' },
];

const PublicProfilePreview: React.FC = () => {
  const { userProfile, user } = useAuth();
  const { formatDate } = useI18n();
  const username = userProfile?.username ? sanitizeUsernameInput(userProfile.username) : 'your-username';
  const socials = [
    ['socialFacebook', 'Facebook', userProfile?.socialFacebook],
    ['socialX', 'X', userProfile?.socialX],
    ['socialLinkedin', 'LinkedIn', userProfile?.socialLinkedin],
    ['socialGithub', 'GitHub', userProfile?.socialGithub],
    ['socialYoutube', 'YouTube', userProfile?.socialYoutube],
    ['socialInstagram', 'Instagram', userProfile?.socialInstagram],
  ].filter(([, , url]) => Boolean(url)) as Array<[string, string, string]>;

  return (
    <Card
      title="Public profile preview"
      subtitle="This is exactly what visitors see at your unique URL."
      icon={<MaterialIcon name="visibility" size={18} />}
      actions={
        <Link
          to={profilePath(username)}
          className="inline-flex min-h-[44px] items-center bg-nasa-blue px-4 py-2 text-base font-semibold text-white hover:bg-nasa-blue-shade touch-manipulation"
        >
          Open live page
        </Link>
      }
    >
      <div className="overflow-hidden border border-carbon-20">
        <div className="h-16 bg-carbon-90" />
        <div className="px-5 pb-5">
          <div className="-mt-8 mb-3">
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="" className="h-16 w-16 rounded-full border-4 border-white object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-nasa-red text-xl font-black text-white">
                {(userProfile?.displayName || user?.email || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-base font-black text-carbon-90">{userProfile?.displayName || 'Set your display name'}</p>
          <p className="text-xs font-bold text-carbon-60">
            @{username} · hazardnet.live{profilePath(username)}
          </p>
          {userProfile?.bio && <p className="mt-2 text-base leading-[1.62] text-carbon-60">{userProfile.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {userProfile?.userRole && <span className="rounded-sm bg-carbon-10 px-2.5 py-1 text-xs font-bold text-carbon-80">{userProfile.userRole.replace(/_/g, ' ')}</span>}
            {(userProfile?.district || userProfile?.primaryDistrict) && (
              <span className="rounded-sm bg-carbon-10 px-2.5 py-1 text-xs font-bold text-carbon-60">
                📍 {userProfile?.district || userProfile?.primaryDistrict}
                {userProfile?.division ? `, ${userProfile.division}` : ''}
              </span>
            )}
            {userProfile?.targetCrops && (
              <span className="rounded-sm bg-carbon-05 px-2.5 py-1 text-xs font-bold text-carbon-80">
                🌾 {userProfile.targetCrops}
              </span>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {([
              ['Farm size', userProfile?.farmSizeHectares ? `${userProfile.farmSizeHectares} ha` : null],
              ['Experience', userProfile?.farmingExperienceYears ? `${userProfile.farmingExperienceYears} yrs` : null],
              ['Irrigation', userProfile?.irrigationType],
              ['Soil', userProfile?.soilType],
              ['Organization', userProfile?.organization],
              ['Member since', userProfile?.createdAt ? formatDate(userProfile.createdAt, { monthYear: true }) : null],
            ] as Array<[string, string | null | undefined]>)
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label} className="bg-carbon-05 px-3 py-2">
                  <dt className="text-xs font-extrabold uppercase tracking-wide text-carbon-60">{label}</dt>
                  <dd className="mt-0.5 truncate font-bold text-carbon-70">{value}</dd>
                </div>
              ))}
          </dl>
          {socials.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-carbon-10 pt-3">
              {socials.map(([key, label, url]) => (
                <a
                  key={key}
                  href={url.startsWith('http') ? url : `https://${url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-carbon-20 px-3 py-1.5 text-xs font-bold text-carbon-70 transition-colors hover:bg-carbon-05"
                >
                  {label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

const UserDashboardPage: React.FC = () => {
  const { user, userProfile, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = TABS.some((tab) => tab.id === tabParam) ? (tabParam as Tab) : 'overview';
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    document.title = 'My Dashboard · HazardNet';
    return () => {
      document.title = 'HazardNet';
    };
  }, []);

  const setActiveTab = (tab: Tab) => setSearchParams(tab === 'overview' ? {} : { tab }, { replace: true });

  const username = userProfile?.username ? sanitizeUsernameInput(userProfile.username) : '';
  const profileUrl = useMemo(
    () => (username && typeof window !== 'undefined' ? `${window.location.origin}${profilePath(username)}` : ''),
    [username],
  );

  // Auth guard — signed-out visitors go to login with a return path.
  if (!loading && !user) {
    return <Navigate to="/login?next=%2Fdashboard" replace />;
  }

  if (loading && !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading dashboard">
        <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-carbon-20 border-t-amber-500" />
      </div>
    );
  }

  const copyProfileUrl = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 1600);
    } catch {
      // Clipboard unavailable.
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden border border-carbon-20/90 bg-white"
      >
        <div className="h-16 bg-carbon-90 sm:h-20" />
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="rounded-full bg-white p-1">
              <UserAvatarField size={88} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {username && (
                <>
                  <code className="hidden bg-carbon-10 px-3 py-2 font-mono text-xs font-bold text-carbon-60 sm:block">
                    hazardnet.live{profilePath(username)}
                  </code>
                  <button
                    type="button"
                    onClick={copyProfileUrl}
                    className="inline-flex min-h-[44px] items-center gap-1.5 border border-carbon-20 bg-white px-3 py-2 text-sm font-semibold text-carbon-70 hover:bg-carbon-05 cursor-pointer touch-manipulation"
                  >
                    <MaterialIcon name={copiedUrl ? 'check' : 'content_copy'} size={13} />
                    {copiedUrl ? 'Copied!' : 'Copy profile URL'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate('/forecast/overview')}
                className="inline-flex min-h-[44px] items-center bg-nasa-red-shade px-4 py-2 text-base font-semibold text-white hover:bg-nasa-red cursor-pointer touch-manipulation"
              >
                Open forecasts
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-carbon-90 sm:text-[32px]">
              {userProfile?.displayName || user?.email?.split('@')[0] || 'Welcome'}
            </h1>
            {username && <span className="text-sm font-bold text-amber-700">@{username}</span>}
            {userProfile?.emailVerified && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-carbon-05 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-carbon-80">
                <MaterialIcon name="check_badge" size={11} /> Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-base leading-[1.62] text-carbon-60">
            {userProfile?.userRole?.replace(/_/g, ' ')}
            {userProfile?.district || userProfile?.primaryDistrict
              ? ` · ${userProfile?.district || userProfile?.primaryDistrict}`
              : ''}
            {userProfile?.organization ? ` · ${userProfile.organization}` : ''}
          </p>
        </div>
      </motion.header>

      {/* ── Body: sidebar + content ────────────────────────────────────── */}
      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <nav className="lg:w-64 lg:shrink-0" aria-label="Dashboard sections">
          <div className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:flex-col lg:overflow-visible lg:border lg:border-carbon-20 lg:bg-white lg:p-2">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[44px] shrink-0 items-center gap-2.5 px-4 py-3 text-left text-base font-semibold cursor-pointer touch-manipulation lg:w-full ${
                    active
                      ? 'bg-carbon-90 text-white'
                      : 'border border-carbon-20 bg-white text-carbon-60 hover:bg-carbon-05 lg:border-transparent lg:bg-transparent lg:hover:bg-carbon-10'
                  }`}
                >
                  <MaterialIcon name={tab.icon} size={16} className={active ? 'text-amber-400' : 'text-carbon-60'} />
                  <span className="flex-1">
                    {tab.label}
                    <span className={`hidden text-xs font-semibold ${active ? 'text-carbon-30' : 'text-carbon-60'} lg:block`}>
                      {tab.hint}
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="hidden lg:mt-2 lg:block lg:border-t lg:border-carbon-10 lg:pt-2">
              <Link
                to="/"
                className="flex items-center gap-2.5 px-4 py-3 text-xs font-extrabold text-carbon-60 transition-colors hover:bg-carbon-10"
              >
                <MaterialIcon name="public" size={16} className="text-carbon-60" />
                Back to HazardNet
              </Link>
            </div>
            <div className="hidden items-center gap-2 px-4 pb-1 pt-2 lg:flex">
              <HazardNetBrand size="xs" />
            </div>
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === 'overview' && <OverviewSection onNavigate={(tab) => setActiveTab(tab)} />}
          {activeTab === 'profile' && <ProfileSection />}
          {activeTab === 'account' && <AccountSection />}
          {activeTab === 'connectors' && <ConnectorsSection />}
          {activeTab === 'public' && <PublicProfilePreview />}
        </div>
      </div>
    </div>
  );
};

export default UserDashboardPage;
