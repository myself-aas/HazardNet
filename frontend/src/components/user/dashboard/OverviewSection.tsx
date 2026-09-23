import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import MaterialIcon from '../../MaterialIcon';
import { profilePath, sanitizeUsernameInput } from '../../../lib/username';
import { CONNECTOR_CATALOG, fetchUserConnectors } from '../../../lib/connectors';
import { Card } from './ui';
import { useI18n } from '../../../hooks/useI18n';

/**
 * "Overview" tab — the at-a-glance home of the user dashboard: profile
 * completeness, quick stats, verification status and deep links.
 */

const COMPLETION_FIELDS: Array<keyof typeof COMPLETION_LABELS> = [
  'firstName', 'lastName', 'displayName', 'username', 'bio', 'photoURL', 'phoneNumber',
  'division', 'district', 'dateOfBirth', 'userRole', 'farmSizeHectares', 'targetCrops',
  'irrigationType', 'soilType', 'socialFacebook', 'socialX', 'website',
] as const;

const COMPLETION_LABELS = {
  firstName: 'First name', lastName: 'Last name', displayName: 'Display name', username: 'Username',
  bio: 'Bio', photoURL: 'Profile picture', phoneNumber: 'Phone number', division: 'Division',
  district: 'District', dateOfBirth: 'Date of birth', userRole: 'I am a…', farmSizeHectares: 'Farm size',
  targetCrops: 'Target crops', irrigationType: 'Irrigation type', soilType: 'Soil type',
  socialFacebook: 'Facebook', socialX: 'X (Twitter)', website: 'Website',
} as const;

export function computeProfileCompletion(profile: Record<string, unknown> | null): {
  percent: number;
  missing: string[];
} {
  if (!profile) return { percent: 0, missing: [] };
  const missing: string[] = [];
  for (const field of COMPLETION_FIELDS) {
    const value = profile[field];
    if (value === undefined || value === null || value === '' ) missing.push(COMPLETION_LABELS[field]);
  }
  const percent = Math.round(((COMPLETION_FIELDS.length - missing.length) / COMPLETION_FIELDS.length) * 100);
  return { percent, missing };
}

const StatTile: React.FC<{ icon: string; label: string; value: React.ReactNode; accent: string }> = ({ icon, label, value, accent }) => (
  <div className="flex items-center gap-3 border border-carbon-20/90 bg-white p-4">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center text-white" style={{ backgroundColor: accent }}>
      <MaterialIcon name={icon} size={19} />
    </span>
    <div className="min-w-0">
      <p className="truncate text-lg font-black leading-tight text-carbon-90">{value}</p>
      <p className="truncate text-xs font-semibold uppercase tracking-wide text-carbon-60">{label}</p>
    </div>
  </div>
);

export const OverviewSection: React.FC<{ onNavigate: (tab: 'profile' | 'connectors' | 'account') => void }> = ({ onNavigate }) => {
  const { user, userProfile, fetchUserAssessments, sendVerificationEmail } = useAuth();
  const { formatDate } = useI18n();
  const [assessmentCount, setAssessmentCount] = useState<number | null>(null);
  const [connectorCount, setConnectorCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  const username = userProfile?.username ? sanitizeUsernameInput(userProfile.username) : '';
  const profileUrl = username ? `${window.location.origin}${profilePath(username)}` : '';

  const completion = useMemo(() => computeProfileCompletion(userProfile as unknown as Record<string, unknown> | null), [userProfile]);

  useEffect(() => {
    if (!user) return;
    void fetchUserAssessments()
      .then((assessments: unknown[]) => setAssessmentCount(assessments.length))
      .catch(() => setAssessmentCount(0));
    void fetchUserConnectors(user.uid).then(
      (rows) => setConnectorCount(rows.filter((row) => row.status === 'connected').length),
    );
  }, [user, fetchUserAssessments]);

  const copyProfileUrl = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — user can select the text manually.
    }
  };

  const emailVerified = Boolean(user?.emailVerified ?? user?.email_confirmed_at ?? user?.confirmed_at);

  const handleResend = async () => {
    if (!userProfile?.email) return;
    setResendBusy(true);
    try {
      await sendVerificationEmail(userProfile.email, { nextTo: '/dashboard' });
      toast.success('Verification link sent — check your inbox.');
    } catch {
      toast.error('Could not resend right now — email links are rate-limited. Try again in a minute.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Verification banner */}
      {!emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3" data-testid="verify-email-banner">
          <div className="flex items-center gap-2.5">
            <MaterialIcon name="mail" size={16} className="text-amber-700" />
            <p className="text-base leading-[1.62] font-semibold text-amber-900">
              Verify your email to secure account recovery and unlock every connector.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendBusy}
            className="inline-flex min-h-[44px] items-center bg-nasa-blue px-4 py-2 text-base font-semibold text-white hover:bg-nasa-blue-shade disabled:opacity-50 cursor-pointer touch-manipulation"
          >
            {resendBusy ? 'Sending…' : 'Resend link'}
          </button>
        </div>
      )}

      {/* Profile URL card */}
      <Card
        title="Your unique profile URL"
        subtitle="Share this link — anyone can view your public profile card."
        icon={<MaterialIcon name="link" size={18} />}
      >
        {username ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate bg-carbon-05 px-4 py-2.5 font-mono text-xs font-semibold text-carbon-70 ring-1 ring-carbon-20">
              {profileUrl}
            </code>
            <button
              type="button"
              onClick={copyProfileUrl}
              className="inline-flex min-h-[44px] items-center gap-1.5 bg-nasa-blue px-4 py-2 text-base font-semibold text-white hover:bg-nasa-blue-shade cursor-pointer touch-manipulation"
            >
              <MaterialIcon name={copied ? 'check' : 'content_copy'} size={13} />
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <Link
              to={profilePath(username)}
              className="inline-flex min-h-[44px] items-center gap-1.5 border border-carbon-20 px-4 py-2 text-base font-semibold text-carbon-70 hover:bg-carbon-05 touch-manipulation"
            >
              <MaterialIcon name="visibility" size={13} />
              View public profile
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base leading-[1.62] text-carbon-60">You haven’t claimed your username yet — it becomes hazardnet.live/u/&lt;username&gt;.</p>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="inline-flex min-h-[44px] items-center bg-nasa-blue px-4 py-2 text-base font-semibold text-white hover:bg-nasa-blue-shade cursor-pointer touch-manipulation"
            >
              Claim username
            </button>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon="trending_up" label="Profile completion" value={`${completion.percent}%`} accent="#17171b" />
        <StatTile icon="hub" label="Connectors" value={connectorCount} accent="#1c67e3" />
        <StatTile icon="bookmark" label="Saved assessments" value={assessmentCount ?? '…'} accent="#0b3d91" />
        <StatTile
          icon="calendar_month"
          label="Member since"
          value={userProfile?.createdAt ? formatDate(userProfile.createdAt, { monthYear: true }) : '—'}
          accent="#17171b"
        />
      </div>

      {/* Completion + quick actions */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Complete your profile" subtitle="A complete profile unlocks sharper, farm-tuned advisories." icon={<MaterialIcon name="user_check" size={18} />}>
          <div className="mb-3 h-2 w-full overflow-hidden bg-carbon-10">
            <div
              className="h-full bg-nasa-green"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          {completion.missing.length > 0 ? (
            <>
              <p className="text-xs font-semibold text-carbon-60">Still missing:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {completion.missing.slice(0, 8).map((missing) => (
                  <span key={missing} className="rounded-sm bg-carbon-10 px-2.5 py-1 text-xs font-bold text-carbon-60">
                    {missing}
                  </span>
                ))}
                {completion.missing.length > 8 && (
                  <span className="rounded-sm bg-carbon-10 px-2.5 py-1 text-xs font-bold text-carbon-60">
                    +{completion.missing.length - 8} more
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs font-bold text-carbon-80">Everything’s filled in — beautiful! 🎉</p>
          )}
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center border border-carbon-20 px-4 py-2 text-base font-semibold text-carbon-80 hover:bg-carbon-05 cursor-pointer touch-manipulation"
          >
            Edit profile fields
          </button>
        </Card>

        <Card title="Quick actions" subtitle="Jump straight into the tools you use most." icon={<MaterialIcon name="bolt" size={18} />}>
          <div className="grid gap-2">
            <Link
              to="/forecast/overview"
              className="flex items-center justify-between border border-carbon-20 px-4 py-3 text-xs font-bold text-carbon-80 transition-colors hover:bg-carbon-05"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon name="public" size={15} className="text-nasa-blue" /> Open district forecasts
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={() => onNavigate('connectors')}
              className="flex min-h-[44px] items-center justify-between border border-carbon-20 px-4 py-3 text-base font-semibold text-carbon-80 hover:bg-carbon-05 cursor-pointer touch-manipulation"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon name="hub" size={15} className="text-carbon-60" /> Manage connectors
                <span className="rounded-sm bg-carbon-10 px-1.5 py-0.5 text-xs font-bold text-carbon-60">
                  {CONNECTOR_CATALOG.length} available
                </span>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('account')}
              className="flex min-h-[44px] items-center justify-between border border-carbon-20 px-4 py-3 text-base font-semibold text-carbon-80 hover:bg-carbon-05 cursor-pointer touch-manipulation"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon name="shield" size={15} className="text-carbon-60" /> Email, password & security
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};
