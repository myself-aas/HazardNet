/**
 * The public profile card — `/u/<username>`, and the live preview of it inside the dashboard.
 *
 * This was two hand-copied implementations: `pages/PublicProfilePage.tsx` rendered the card a
 * visitor resolves by username, and `pages/UserDashboardPage.tsx` rendered its own copy of the same
 * markup under "This is exactly what visitors see". Two copies of a card drift, and a preview that
 * has drifted is a lie. Both callers now map their data into this one view model.
 *
 * One card deep by construction: the article is the only bordered box. The identity facts are a
 * `dl` on the grouped background (no border) — that is the "too many nested cardviews" rule the
 * user area follows, applied to the page a stranger sees too.
 */

import React from 'react';
import { Droplets, ExternalLink, Globe, Wheat } from 'lucide-react';
import MaterialIcon from '../MaterialIcon';

export interface PublicProfileView {
  displayName: string;
  username: string;
  photoURL?: string | null;
  bio?: string | null;
  userRole?: string | null;
  organization?: string | null;
  district?: string | null;
  division?: string | null;
  country?: string | null;
  targetCrops?: string | null;
  farmSizeHectares?: number | null;
  farmingExperienceYears?: number | null;
  irrigationType?: string | null;
  soilType?: string | null;
  website?: string | null;
  /** Already labelled and absolute-or-schemeless; the card adds the scheme. */
  links?: Array<{ label: string; url: string }>;
  memberSince?: string | null;
  /** Rendered under the @handle, e.g. "This is your own public card." */
  note?: React.ReactNode;
}

const absolute = (url: string) => (url.startsWith('http') ? url : `https://${url}`);

export interface PublicProfileCardProps {
  profile: PublicProfileView;
  /** `1` on `/u/<username>` (the page's subject), `2` inside the dashboard (`h2`). */
  headingLevel?: 1 | 2;
  className?: string;
}

export const PublicProfileCard: React.FC<PublicProfileCardProps> = ({
  profile,
  headingLevel = 1,
  className = '',
}) => {
  const Heading = (headingLevel === 1 ? 'h1' : 'h2') as 'h1';
  const place = [profile.district, profile.division, profile.country ?? 'Bangladesh'].filter(Boolean).join(', ');

  const facts = (
    [
      ['Farm size', profile.farmSizeHectares ? `${profile.farmSizeHectares} ha` : null],
      ['Experience', profile.farmingExperienceYears ? `${profile.farmingExperienceYears} yrs` : null],
      ['Irrigation', profile.irrigationType],
      ['Soil', profile.soilType],
      ['Organization', profile.organization],
      ['Member since', profile.memberSince],
    ] as Array<[string, string | null | undefined]>
  ).filter(([, value]) => Boolean(value));

  return (
    <article className={`overflow-hidden border border-carbon-20 bg-white ${className}`} data-testid="public-profile-card">
      <div className="h-20 bg-carbon-05" aria-hidden="true" />
      <div className="px-6 pb-6 sm:px-8">
        <div className="-mt-12 mb-4">
          {profile.photoURL ? (
            <img
              src={profile.photoURL}
              alt={profile.displayName}
              className="h-24 w-24 rounded-full border-4 border-white object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-primary text-3xl font-black text-ap-action-fg">
              {(profile.displayName || 'H').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading className="text-ap-lead font-bold leading-tight tracking-tight text-carbon-90 sm:text-ap-display-md">
            {profile.displayName}
          </Heading>
          <span className="text-sm font-semibold text-ap-link">@{profile.username}</span>
        </div>
        <p className="mt-1 text-base leading-[1.62] text-carbon-60">
          {[profile.userRole?.replace(/_/g, ' '), profile.organization, profile.memberSince ? `Member since ${profile.memberSince}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {profile.note && <p className="mt-2 text-xs leading-[1.62] text-carbon-60">{profile.note}</p>}

        {profile.bio && <p className="mt-3 max-w-xl text-base leading-[1.62] text-carbon-60">{profile.bio}</p>}

        <div className="mt-4 flex flex-wrap gap-1.5">
          {place && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-carbon-05 px-3 py-1.5 text-xs font-semibold text-carbon-70">
              <MaterialIcon name="pin" size={12} className="text-carbon-60" />
              {place}
            </span>
          )}
          {profile.targetCrops && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-carbon-05 px-3 py-1.5 text-xs font-semibold text-carbon-70">
              <Wheat className="h-3.5 w-3.5 text-carbon-60" aria-hidden="true" />
              {profile.targetCrops}
            </span>
          )}
          {profile.irrigationType && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-carbon-05 px-3 py-1.5 text-xs font-semibold text-carbon-70">
              <Droplets className="h-3.5 w-3.5 text-carbon-60" aria-hidden="true" />
              {profile.irrigationType}
            </span>
          )}
        </div>

        {facts.length > 0 && (
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {facts.map(([label, value]) => (
              <div key={label} className="bg-carbon-05 px-3 py-2">
                <dt className="text-xs font-semibold text-carbon-60">{label}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold text-carbon-90">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(profile.website || (profile.links?.length ?? 0) > 0) && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-carbon-10 pt-4">
            {profile.website && (
              <a href={absolute(profile.website)} target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn-secondary">
                <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                Website
              </a>
            )}
            {profile.links?.map((link) => (
              <a key={link.url} href={absolute(link.url)} target="_blank" rel="noopener noreferrer" className="ap-btn ap-btn-secondary">
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
};

export default PublicProfileCard;
