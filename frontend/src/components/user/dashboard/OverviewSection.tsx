import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../../context/AuthContext';
import MaterialIcon from '../../MaterialIcon';
import { profilePath, sanitizeUsernameInput } from '../../../lib/username';
import { CONNECTOR_CATALOG, fetchUserConnectors } from '../../../lib/connectors';
import { Card } from './ui';

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
  <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: accent }}>
      <MaterialIcon name={icon} size={19} />
    </span>
    <div className="min-w-0">
      <p className="text-lg font-black leading-tight text-slate-900">{value}</p>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  </div>
);

export const OverviewSection: React.FC<{ onNavigate: (tab: 'profile' | 'connectors' | 'account') => void }> = ({ onNavigate }) => {
  const { user, userProfile, fetchUserAssessments, sendVerificationEmail } = useAuth();
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
      toast.error('Could not resend right now — Supabase rate-limits email. Try again in a minute.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Verification banner */}
      {!emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3" data-testid="verify-email-banner">
          <div className="flex items-center gap-2.5">
            <MaterialIcon name="mail" size={16} className="text-amber-700" />
            <p className="text-xs font-bold text-amber-900">
              Verify your email to secure account recovery and unlock every connector.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendBusy}
            className="rounded-xl bg-amber-500 px-3 py-1.5 text-[11px] font-extrabold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
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
            <code className="flex-1 truncate rounded-xl bg-slate-50 px-4 py-2.5 font-mono text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
              {profileUrl}
            </code>
            <button
              type="button"
              onClick={copyProfileUrl}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2.5 text-[11px] font-extrabold text-white transition-colors hover:bg-slate-800 cursor-pointer"
            >
              <MaterialIcon name={copied ? 'check' : 'content_copy'} size={13} />
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <Link
              to={profilePath(username)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-[11px] font-extrabold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <MaterialIcon name="visibility" size={13} />
              View public profile
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">You haven’t claimed your username yet — it becomes hazardnet.live/u/&lt;username&gt;.</p>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="rounded-xl bg-nasa-red px-3.5 py-2 text-[11px] font-extrabold text-slate-950 transition-colors hover:bg-nasa-red-shade cursor-pointer"
            >
              Claim username
            </button>
          </div>
        )}
      </Card>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon="trending_up" label="Profile completion" value={`${completion.percent}%`} accent="#d97706" />
        <StatTile icon="hub" label="Connectors" value={connectorCount} accent="#0d9488" />
        <StatTile icon="bookmark" label="Saved assessments" value={assessmentCount ?? '…'} accent="#0284c7" />
        <StatTile
          icon="calendar_month"
          label="Member since"
          value={userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
          accent="#7c3aed"
        />
      </div>

      {/* Completion + quick actions */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Complete your profile" subtitle="A complete profile unlocks sharper, farm-tuned advisories." icon={<MaterialIcon name="user_check" size={18} />}>
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${completion.percent}%` }}
            />
          </div>
          {completion.missing.length > 0 ? (
            <>
              <p className="text-[11px] font-semibold text-slate-500">Still missing:</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {completion.missing.slice(0, 8).map((missing) => (
                  <span key={missing} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-bold text-slate-600">
                    {missing}
                  </span>
                ))}
                {completion.missing.length > 8 && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-bold text-slate-600">
                    +{completion.missing.length - 8} more
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs font-bold text-emerald-700">Everything’s filled in — beautiful! 🎉</p>
          )}
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-extrabold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            Edit profile fields
          </button>
        </Card>

        <Card title="Quick actions" subtitle="Jump straight into the tools you use most." icon={<MaterialIcon name="bolt" size={18} />}>
          <div className="grid gap-2">
            <Link
              to="/forecast/overview"
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon name="public" size={15} className="text-sky-600" /> Open district forecasts
              </span>
              <span aria-hidden="true">→</span>
            </Link>
            <button
              type="button"
              onClick={() => onNavigate('connectors')}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon name="hub" size={15} className="text-teal-600" /> Manage connectors
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9.5px] font-extrabold text-slate-500">
                  {CONNECTOR_CATALOG.length} available
                </span>
              </span>
              <span aria-hidden="true">→</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('account')}
              className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <MaterialIcon name="shield" size={15} className="text-emerald-600" /> Email, password & security
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};
