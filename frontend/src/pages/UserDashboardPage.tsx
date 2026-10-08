import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DataStateEmpty, DataStateError } from '../components/ui/DataState';
import { ProfileDetails } from '../components/user/dashboard/ProfileDetails';
import { OverviewSection } from '../components/user/dashboard/OverviewSection';
import { AccountSection } from '../components/user/dashboard/AccountSection';
import { ConnectorsSection } from '../components/user/dashboard/ConnectorsSection';
import { PublicProfileCard } from '../components/user/PublicProfileCard';
import MaterialIcon from '../components/MaterialIcon';
import { Button, Container, PillTabs } from '../components/apple/primitives';
import { profilePath, sanitizeUsernameInput } from '../lib/username';
import { useI18n } from '../hooks/useI18n';
import { InfinityLoader } from '../components/brand';

/**
 * The dedicated per-user dashboard — unique URL: /dashboard (auth required).
 *
 * Five sections: Overview, Profile, Account & Security, Connectors and the
 * public page preview. `?tab=` selects one, and the tab row is the system's real
 * `PillTabs` tablist (arrow keys, `aria-selected`) instead of five buttons on a
 * bordered sidebar that announced themselves as pages.
 *
 * The page is a page: a header on the canvas, then one `Panel` per group. It
 * used to open with a card whose top half was a black band, put a bordered
 * sidebar panel beside a column of bordered cards, and nest a bordered
 * connector directory inside a bordered card — four hairline levels on one
 * screen, which is the nesting the 2026-10-06 pass removed.
 *
 * The tab bodies live in `components/user/dashboard/*`; `/profile` renders the
 * same `ProfileDetails` editor, so the two surfaces cannot drift apart again.
 */

type Tab = 'overview' | 'profile' | 'account' | 'connectors' | 'public';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'overview', label: 'Overview', hint: 'Stats, completion & quick actions' },
  { id: 'profile', label: 'Profile', hint: 'Identity, farm, social & preferences' },
  { id: 'account', label: 'Account', hint: 'Email, password, linked accounts' },
  { id: 'connectors', label: 'Connectors', hint: 'Weather, alerts & productivity integrations' },
  { id: 'public', label: 'Public page', hint: 'What the world sees at /u/username' },
];

const PublicPageTab: React.FC = () => {
  const { userProfile } = useAuth();
  const { formatDate } = useI18n();
  const username = userProfile?.username ? sanitizeUsernameInput(userProfile.username) : '';
  const links = (
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

  if (!username) {
    return (
      <div className="bg-carbon-05 p-6">
        <h2 className="text-lg font-bold tracking-tight text-carbon-90">Claim a username first</h2>
        <p className="mt-1.5 max-w-prose text-sm leading-[1.62] text-carbon-70">
          A public profile lives at hazardnet.live/u/&lt;username&gt;. Pick yours in the Profile tab and this page will
          show exactly what visitors see.
        </p>
        <Link to="/dashboard?tab=profile" className="ap-btn mt-4">
          Go to profile settings
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-carbon-90">Public page</h2>
          <p className="mt-1 max-w-prose text-sm leading-[1.62] text-carbon-70">
            Visitors see this card at{' '}
            <span className="font-semibold text-carbon-90">hazardnet.live{profilePath(username)}</span> once your
            profile visibility is public.
          </p>
        </div>
        <Link to={profilePath(username)} className="ap-btn ap-btn-secondary">
          Open live page
        </Link>
      </div>
      <PublicProfileCard
        headingLevel={2}
        profile={{
          displayName: userProfile?.displayName || 'Set your display name',
          username,
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
          links,
          memberSince: userProfile?.createdAt ? formatDate(userProfile.createdAt, { monthYear: true }) : null,
          note:
            userProfile?.profileVisibility === 'private'
              ? 'Your profile visibility is set to Private, so this card is not published yet.'
              : 'This is the same card a visitor resolves at your URL.',
        }}
      />
    </div>
  );
};

const UserDashboardPage: React.FC = () => {
  const { user, userProfile, loading, profileStatus, ensureProfile, refreshProfile } = useAuth();
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
      <div
        className="ap-enter flex min-h-[60vh] items-center justify-center"
        role="status"
        aria-label="Loading dashboard"
      >
        <InfinityLoader size={88} label="Loading" announce={false} />
      </div>
    );
  }

  // Two shapes the page used to render as a half-filled dashboard with no explanation:
  // an unreadable profiles row (`error`) and an account that has no row at all (`missing`).
  if (user && profileStatus === 'error') {
    return (
      <div className="ap-enter mx-auto w-full max-w-[720px] py-10">
        <DataStateError
          title="Your profile could not be read"
          detail="The dashboard is not showing partial profile data. Your account and its settings are untouched."
          onRetry={() => { void refreshProfile(); }}
          retryLabel="Try reading the profile again"
        />
      </div>
    );
  }

  if (user && profileStatus === 'missing') {
    return (
      <div className="ap-enter mx-auto w-full max-w-[720px] py-10">
        <DataStateEmpty
          title="No profile is stored for this account yet"
          body="You are signed in, but this account has no profile document. Creating it seeds the same fields a first sign-in would, and nothing is overwritten."
        />
        <div className="mt-4 flex justify-center">
          <Button onClick={() => { void ensureProfile(); }}>Create my profile</Button>
        </div>
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

  const activeMeta = TABS.find((tab) => tab.id === activeTab);

  return (
    <Container width="wide">
      {/* ── Header: identity on the canvas, no card to nest everything inside ── */}
      <header className="flex flex-wrap items-start justify-between gap-5 pt-ap-lg pb-ap-md">
        <div className="flex min-w-0 items-center gap-4">
          {/* Display only: the one avatar editor lives in the Profile tab's Identity panel, so the
              same control does not appear twice on one screen. */}
          {userProfile?.photoURL ? (
            <img
              src={userProfile.photoURL}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-ap-action-fg">
              {(userProfile?.displayName || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-ap-lead font-bold leading-tight tracking-tight text-carbon-90">
              {userProfile?.displayName || user?.email?.split('@')[0] || 'Welcome'}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-carbon-60">
              {username && <span className="font-semibold text-carbon-70">@{username}</span>}
              {userProfile?.emailVerified && <span>Email confirmed</span>}
            </p>
            <p className="mt-1 text-sm leading-[1.62] text-carbon-70">
              {[
                userProfile?.userRole?.replace(/_/g, ' '),
                userProfile?.district || userProfile?.primaryDistrict,
                userProfile?.organization,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {username && (
            <Button intent="secondary" size="sm" onClick={copyProfileUrl}>
              <MaterialIcon name={copiedUrl ? 'check' : 'content_copy'} size={14} />
              {copiedUrl ? 'Copied' : 'Copy profile URL'}
            </Button>
          )}
          <Link to="/forecast/overview" className="ap-btn">
            Open forecasts
          </Link>
        </div>
      </header>

      {/* ── Tabs: a real tablist, not a bordered sidebar of page buttons ────── */}
      <PillTabs
        ariaLabel="Dashboard sections"
        tabs={TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
        value={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
      />
      <p className="mt-2 text-xs leading-[1.62] text-carbon-60">{activeMeta?.hint}</p>

      {/* The tab bodies are different components, so a tab switch is a mount, not a state change.
          `key` gives the panel one identity per tab and `.ap-enter` carries the swap. 240ms, fade
          only: the panel holds focusable fields, and translating it would move a control the
          reader may already be reaching for. */}
      <div
        key={activeTab}
        className="ap-enter mt-ap-md pb-ap-xl"
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-label={activeMeta?.label}
        tabIndex={-1}
      >
        {activeTab === 'overview' && <OverviewSection onNavigate={(tab) => setActiveTab(tab)} />}
        {activeTab === 'profile' && <ProfileDetails />}
        {activeTab === 'account' && <AccountSection />}
        {activeTab === 'connectors' && <ConnectorsSection />}
        {activeTab === 'public' && <PublicPageTab />}
      </div>
    </Container>
  );
};

export default UserDashboardPage;
