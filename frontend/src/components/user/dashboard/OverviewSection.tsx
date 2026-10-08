import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import MaterialIcon from '../../MaterialIcon';
import { CONNECTOR_CATALOG, fetchUserConnectors } from '../../../lib/connectors';
import { Figure, Button } from '../../apple/primitives';
import { Panel, ProgressMeter } from './ui';
import { useI18n } from '../../../hooks/useI18n';

/**
 * "Overview" tab — the at-a-glance home of the user dashboard: profile
 * completeness, account figures and deep links.
 *
 * One bordered level only. The stat tiles were bordered white boxes with an
 * inline `style={{ backgroundColor: accent }}` swatch, three of them inside a
 * bordered row inside a bordered page: four hairlines to say four numbers. They
 * are `Figure`s now — number, label, nothing else — and the accents are gone
 * with them, because the system has one accent and it is not a stat tile.
 */

const COMPLETION_FIELDS = [
  'firstName', 'lastName', 'displayName', 'username', 'bio', 'photoURL', 'phoneNumber',
  'division', 'district', 'dateOfBirth', 'userRole', 'farmSizeHectares', 'targetCrops',
  'irrigationType', 'soilType', 'socialFacebook', 'socialX', 'website',
] as const;

const COMPLETION_LABELS: Record<(typeof COMPLETION_FIELDS)[number], string> = {
  firstName: 'First name', lastName: 'Last name', displayName: 'Display name', username: 'Username',
  bio: 'Bio', photoURL: 'Profile picture', phoneNumber: 'Phone number', division: 'Division',
  district: 'District', dateOfBirth: 'Date of birth', userRole: 'I am a…', farmSizeHectares: 'Farm size',
  targetCrops: 'Target crops', irrigationType: 'Irrigation type', soilType: 'Soil type',
  socialFacebook: 'Facebook', socialX: 'X (Twitter)', website: 'Website',
};

export function computeProfileCompletion(profile: Record<string, unknown> | null): {
  percent: number;
  missing: string[];
} {
  if (!profile) return { percent: 0, missing: [] };
  const missing: string[] = [];
  for (const field of COMPLETION_FIELDS) {
    const value = profile[field];
    if (value === undefined || value === null || value === '') missing.push(COMPLETION_LABELS[field]);
  }
  const percent = Math.round(((COMPLETION_FIELDS.length - missing.length) / COMPLETION_FIELDS.length) * 100);
  return { percent, missing };
}

/** A hairline action row. Not a button in a box: the row is the target. */
const ActionRow: React.FC<{ onClick: () => void; icon: string; label: string; meta?: React.ReactNode }> = ({
  onClick,
  icon,
  label,
  meta,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="ap-focusable ap-press-row flex min-h-[44px] w-full items-center justify-between gap-3 border-b border-carbon-10 py-3 text-left text-base font-semibold text-carbon-80 last:border-b-0 hover:text-carbon-90"
  >
    <span className="flex min-w-0 items-center gap-3">
      <MaterialIcon name={icon} size={16} className="text-carbon-60" />
      <span className="truncate">{label}</span>
      {meta}
    </span>
    <ArrowRight className="h-4 w-4 shrink-0 text-carbon-60" aria-hidden="true" />
  </button>
);

export const OverviewSection: React.FC<{ onNavigate: (tab: 'profile' | 'connectors' | 'account') => void }> = ({
  onNavigate,
}) => {
  const { user, userProfile, fetchUserAssessments, sendVerificationEmail } = useAuth();
  const { formatDate } = useI18n();
  const [assessmentCount, setAssessmentCount] = useState<number | null>(null);
  const [connectorCount, setConnectorCount] = useState<number>(0);
  const [resendBusy, setResendBusy] = useState(false);

  const completion = useMemo(
    () => computeProfileCompletion(userProfile as unknown as Record<string, unknown> | null),
    [userProfile],
  );

  useEffect(() => {
    if (!user) return;
    void fetchUserAssessments()
      .then((assessments: unknown[]) => setAssessmentCount(assessments.length))
      .catch(() => setAssessmentCount(0));
    void fetchUserConnectors(user.uid).then(
      (rows) => setConnectorCount(rows.filter((row) => row.status === 'connected').length),
    );
  }, [user, fetchUserAssessments]);

  const emailVerified = Boolean(user?.emailVerified ?? user?.email_confirmed_at ?? user?.confirmed_at);

  const handleResend = async () => {
    if (!userProfile?.email) return;
    setResendBusy(true);
    try {
      await sendVerificationEmail(userProfile.email, { nextTo: '/dashboard' });
      toast.success('Verification link sent. Check your inbox.');
    } catch {
      toast.error('Could not resend right now. Email links are rate-limited. Try again in a minute.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Unverified accounts get a soft callout, not an amber alert box: the copy states the
          condition, and the action is an ordinary secondary button. */}
      {!emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-carbon-05 p-4" data-testid="verify-email-banner">
          <p className="max-w-prose text-sm leading-[1.62] text-carbon-80">
            <strong className="font-semibold">Verify your email address.</strong> It secures account recovery and
            unlocks every connector.
          </p>
          <Button intent="secondary" size="sm" onClick={handleResend} disabled={resendBusy}>
            {resendBusy ? 'Sending…' : 'Resend verification link'}
          </Button>
        </div>
      )}

      <Panel title="At a glance" description="Figures read from your HazardNet account.">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <Figure label="Profile completion" value={`${completion.percent}%`} />
          <Figure label="Connectors in use" value={connectorCount} />
          <Figure label="Saved assessments" value={assessmentCount ?? '—'} missing={assessmentCount === null} />
          <Figure
            label="Member since"
            value={userProfile?.createdAt ? formatDate(userProfile.createdAt, { monthYear: true }) : '—'}
            missing={!userProfile?.createdAt}
          />
        </div>
      </Panel>

      <Panel
        title="Finish your profile"
        description="A complete profile unlocks sharper, farm-tuned advisories."
        actions={
          <Link to="/dashboard?tab=profile" className="ap-btn ap-btn-secondary">
            Edit profile fields
          </Link>
        }
      >
        <ProgressMeter value={completion.percent} label={`${completion.percent}% complete`} />
        {completion.missing.length > 0 ? (
          <p className="mt-3 text-sm leading-[1.62] text-carbon-70">
            Still missing: <span className="text-carbon-90">{completion.missing.join(' · ')}</span>
          </p>
        ) : (
          <p className="mt-3 text-sm leading-[1.62] text-carbon-70">
            Everything is filled in. Your advisories use the most specific context available.
          </p>
        )}
      </Panel>

      <Panel title="Go to" description="Jump straight into the tools you use most.">
        <ActionRow
          onClick={() => onNavigate('connectors')}
          icon="hub"
          label="Manage connectors"
          meta={
            <span className="ap-caption shrink-0 text-carbon-60">{CONNECTOR_CATALOG.length} available</span>
          }
        />
        <ActionRow onClick={() => onNavigate('account')} icon="shield" label="Email, password & security" />
        <ActionRow onClick={() => onNavigate('profile')} icon="person" label="Profile fields" />
        <Link
          to="/forecast/overview"
          className="ap-focusable ap-press-row flex min-h-[44px] w-full items-center justify-between gap-3 py-3 text-left text-base font-semibold text-carbon-80 hover:text-carbon-90"
        >
          <span className="flex min-w-0 items-center gap-3">
            <MaterialIcon name="public" size={16} className="text-carbon-60" />
            <span className="truncate">Open district forecasts</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-carbon-60" aria-hidden="true" />
        </Link>
      </Panel>
    </div>
  );
};

export default OverviewSection;
