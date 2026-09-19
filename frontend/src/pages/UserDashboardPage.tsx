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

/**
 * The dedicated per-user dashboard — unique URL: /dashboard (auth required).
 *
 * Five sections: Overview (stats + completeness), Profile (all editable data
 * stored in Supabase), Account & Security (email/password/identities),
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
          className="rounded-xl bg-carbon-90 px-3 py-1.5 text-[11px] font-extrabold text-white transition-colors hover:bg-carbon-80"
        >
          Open live page
        </Link>
      }
    >
      <div className="overflow-hidden rounded-2xl border border-carbon-20">
        <div className="h-20 bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-300" />
        <div className="px-5 pb-5">
          <div className="-mt-8 mb-3">
            {userProfile?.photoURL ? (
              <img src={userProfile.photoURL} alt="" className="h-16 w-16 rounded-full border-4 border-white object-cover shadow-md" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-gradient-to-tr from-amber-500 to-amber-300 text-xl font-black text-carbon-black shadow-md">
                {(userProfile?.displayName || user?.email || 'U')[0].toUpperCase()}
              </div>
            )}
          </div>
          <p className="text-base font-black text-carbon-90">{userProfile?.displayName || 'Set your display name'}</p>
          <p className="text-xs font-bold text-carbon-60">
            @{username} · hazardnet.live{profilePath(username)}
          </p>
          {userProfile?.bio && <p className="mt-2 text-xs leading-relaxed text-carbon-60">{userProfile.bio}</p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {userProfile?.userRole && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-extrabold text-amber-800">{userProfile.userRole.replace(/_/g, ' ')}</span>}
            {(userProfile?.district || userProfile?.primaryDistrict) && (
              <span className="rounded-full bg-carbon-10 px-2.5 py-1 text-[10.5px] font-extrabold text-carbon-60">
                📍 {userProfile?.district || userProfile?.primaryDistrict}
                {userProfile?.division ? `, ${userProfile.division}` : ''}
              </span>
            )}
            {userProfile?.targetCrops && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-extrabold text-emerald-700">
                🌾 {userProfile.targetCrops}
              </span>
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[11px] sm:grid-cols-3">
            {([
              ['Farm size', userProfile?.farmSizeHectares ? `${userProfile.farmSizeHectares} ha` : null],
              ['Experience', userProfile?.farmingExperienceYears ? `${userProfile.farmingExperienceYears} yrs` : null],
              ['Irrigation', userProfile?.irrigationType],
              ['Soil', userProfile?.soilType],
              ['Organization', userProfile?.organization],
              ['Member since', userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : null],
            ] as Array<[string, string | null | undefined]>)
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label} className="rounded-xl bg-carbon-05 px-3 py-2">
                  <dt className="text-[9.5px] font-extrabold uppercase tracking-wide text-carbon-60">{label}</dt>
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
                  className="rounded-xl border border-carbon-20 px-3 py-1.5 text-[11px] font-bold text-carbon-70 transition-colors hover:bg-carbon-05"
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
        className="overflow-hidden rounded-3xl border border-carbon-20/90 bg-white shadow-sm"
      >
        <div className="h-24 bg-gradient-to-r from-carbon-90 via-carbon-80 to-[#b45309] sm:h-28" />
        <div className="px-5 pb-5 sm:px-7">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="rounded-full bg-white p-1 shadow-sm">
              <UserAvatarField size={88} />
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {username && (
                <>
                  <code className="hidden rounded-xl bg-carbon-10 px-3 py-2 font-mono text-[11px] font-bold text-carbon-60 sm:block">
                    hazardnet.live{profilePath(username)}
                  </code>
                  <button
                    type="button"
                    onClick={copyProfileUrl}
                    className="flex items-center gap-1.5 rounded-xl border border-carbon-20 bg-white px-3 py-2 text-[11px] font-extrabold text-carbon-70 shadow-xs transition-colors hover:bg-carbon-05 cursor-pointer"
                  >
                    <MaterialIcon name={copiedUrl ? 'check' : 'content_copy'} size={13} />
                    {copiedUrl ? 'Copied!' : 'Copy profile URL'}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate('/forecast/overview')}
                className="rounded-xl bg-nasa-red px-3.5 py-2 text-[11px] font-extrabold text-carbon-black shadow-xs transition-colors hover:bg-nasa-red-shade cursor-pointer"
              >
                Open forecasts
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-black tracking-tight text-carbon-90 sm:text-2xl">
              {userProfile?.displayName || user?.email?.split('@')[0] || 'Welcome'}
            </h1>
            {username && <span className="text-sm font-bold text-amber-700">@{username}</span>}
            {userProfile?.emailVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">
                <MaterialIcon name="check_badge" size={11} /> Verified
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-carbon-60">
            {userProfile?.userRole?.replace(/_/g, ' ')}
            {userProfile?.district || userProfile?.primaryDistrict
              ? ` · ${userProfile?.district || userProfile?.primaryDistrict}`
              : ''}
            {userProfile?.organization ? ` · ${userProfile.organization}` : ''}
          </p>
        </div>
      </motion.header>

      {/* ── Body: sidebar + content ────────────────────────────────────── */}
      <div className="mt-5 flex flex-col gap-5 lg:flex-row">
        <nav className="lg:w-64 lg:shrink-0" aria-label="Dashboard sections">
          <div className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:flex-col lg:overflow-visible lg:rounded-3xl lg:border lg:border-carbon-20/90 lg:bg-white lg:p-2 lg:shadow-xs">
            {TABS.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-xs font-extrabold transition-all cursor-pointer lg:w-full ${
                    active
                      ? 'bg-carbon-90 text-white shadow-sm'
                      : 'border border-carbon-20 bg-white text-carbon-60 hover:bg-carbon-05 lg:border-transparent lg:bg-transparent lg:hover:bg-carbon-10'
                  }`}
                >
                  <MaterialIcon name={tab.icon} size={16} className={active ? 'text-amber-400' : 'text-carbon-60'} />
                  <span className="flex-1">
                    {tab.label}
                    <span className={`hidden text-[10px] font-semibold ${active ? 'text-carbon-30' : 'text-carbon-60'} lg:block`}>
                      {tab.hint}
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="hidden lg:mt-2 lg:block lg:border-t lg:border-carbon-10 lg:pt-2">
              <Link
                to="/"
                className="flex items-center gap-2.5 rounded-2xl px-4 py-3 text-xs font-extrabold text-carbon-60 transition-colors hover:bg-carbon-10"
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
