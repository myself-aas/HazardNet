/**
 * The profile editor: the fields for a HazardNet account, in one place.
 *
 * `/dashboard?tab=profile` and `/profile` are two doors to this one component. They used to be two
 * separate implementations of the same form (13 `Card`s / 24 `TextField`s here, seven hand-rolled
 * inputs and a second switch there), which is the duplication
 * `docs/audits/2026-10-06-profile-page-design-audit.md` F-4 named as the cause of the two pages
 * looking like two products. Now there is one editor, one save path and one set of field names, and
 * the pages differ only in the chrome around it.
 *
 * Every field maps to a field on the Firestore `profiles` document. The draft is local until Save;
 * `SaveBar` reports the dirty state, and only changed keys are written.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAuth, type UserProfileData, type UserRolePersona } from '../../../context/AuthContext';
import { ALL_64_DISTRICTS } from '../../../data/bangladeshDistricts';
import {
  detectExactPinpointLocation,
  findNearestDistrict,
  isValidLatLng,
} from '../../../services/geolocationService';
import { profilePath, sanitizeUsernameInput } from '../../../lib/username';
import { UsernameField } from '../UsernameField';
import { UserAvatarField } from '../UserAvatarField';
import { Button } from '../../apple/primitives';
import {
  DateField,
  Field,
  FieldGrid,
  NumberField,
  OptionGroup,
  Panel,
  SaveBar,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
  inputClass,
} from './ui';

/** The stakeholder personas. One list, two labels each: the name and what it tunes. */
const PERSONAS: Array<{ value: UserRolePersona; label: string; description: string }> = [
  { value: 'smallholder_farmer', label: 'Smallholder farmer', description: 'Micro-farm and local advisory' },
  { value: 'ngo_coordinator', label: 'NGO disaster coordinator', description: 'Humanitarian relief and WASH' },
  { value: 'govt_official', label: 'DAE / government extension officer', description: 'Regional oversight and policy' },
  { value: 'academic_researcher', label: 'Academic climate researcher', description: 'Satellite records and metrics' },
  { value: 'commercial_agribusiness', label: 'Commercial agribusiness', description: 'Supply chain and logistics' },
];

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা (Bengali)' },
];
const TIMEZONES = [
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
];
const IRRIGATION_TYPES = [
  'Rain-fed',
  'Shallow tube well',
  'Deep tube well',
  'Canal / surface',
  'Drip',
  'Sprinkler',
  'Other',
];
const SOIL_TYPES = ['Loam', 'Clay', 'Clay loam', 'Sandy', 'Sandy loam', 'Silt', 'Peaty', 'Saline', 'Other'];
const DIVISIONS = Array.from(new Set(ALL_64_DISTRICTS.map((district) => district.division))).sort();

type Draft = Record<string, string | number | boolean | undefined>;
type DraftValue = string | number | boolean | undefined;

/**
 * Two of these settings are also mirrored to `localStorage` (`hazardnet_home_district`,
 * `hazardnet_auto_detect_location`), because the map, the region selector and the alert hook read
 * the mirror before the profile row has loaded. The old /profile page wrote it on every toggle; the
 * writer moved with the fields, so this component keeps the mirror in step with the draft it saves.
 */
const LOCAL_HOME_DISTRICT = 'hazardnet_home_district';
const LOCAL_AUTO_DETECT = 'hazardnet_auto_detect_location';

const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable (private mode)
  }
};

const writeLocalMirrors = (patch: Draft) => {
  try {
    const homeDistrictId = pickText(patch.homeDistrictId);
    if (homeDistrictId) localStorage.setItem(LOCAL_HOME_DISTRICT, homeDistrictId);
    else localStorage.removeItem(LOCAL_HOME_DISTRICT);
    if (patch.autoDetectLocationEnabled !== undefined) {
      localStorage.setItem(LOCAL_AUTO_DETECT, String(patch.autoDetectLocationEnabled));
    }
  } catch {
    // best effort
  }
};

/** The draft starts from the profile row, falling back to the local mirror for the two keys the
 *  rest of the app also reads locally. */
const withLocalDefaults = (patch: Draft): Draft => ({
  ...patch,
  homeDistrictId: pickText(patch.homeDistrictId) || readLocal(LOCAL_HOME_DISTRICT) || undefined,
  autoDetectLocationEnabled:
    patch.autoDetectLocationEnabled ?? readLocal(LOCAL_AUTO_DETECT) !== 'false',
});

const pickText = (value: DraftValue): string => (value === undefined || value === null ? '' : String(value));
const options = (values: string[]) => values.map((value) => ({ value, label: value }));
const districtOptions = (division: string) => {
  const inDivision = ALL_64_DISTRICTS.filter((district) => district.division === division);
  return (inDivision.length > 0 ? inDivision : ALL_64_DISTRICTS).map((district) => ({
    value: district.name,
    label: district.name,
  }));
};

export interface ProfileDetailsProps {
  /**
   * Copy for a failed write. The page passes its own string when it has
   * published one: `data/design/four-state-baseline.json` pins the error
   * evidence for `pages/UserProfilePage.tsx`, and the evidence has to be a
   * literal in that file.
   */
  saveErrorMessage?: string;
}

export const ProfileDetails: React.FC<ProfileDetailsProps> = ({
  saveErrorMessage = 'Could not save your profile. Check your connection and try again.',
}) => {
  const { user, userProfile, updateUserProfile, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => withLocalDefaults({ ...userProfile }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // Set after a save that resolved a district, so the confirmation can link to it instead of
  // navigating the reader off the page they were editing (the 2026-10-06 pass: Save used to
  // teleport straight to the map).
  const [savedDistrictId, setSavedDistrictId] = useState<string | null>(null);

  const set = (key: string) => (value: DraftValue) => {
    setMessage(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(
    () =>
      Object.keys(draft).some(
        (key) => draft[key] !== (userProfile as unknown as Draft | null)?.[key],
      ),
    [draft, userProfile],
  );

  // Mirror server-side changes into the draft while the reader is not editing, which covers the
  // asynchronous profile load right after the page mounts.
  useEffect(() => {
    if (!dirty && userProfile) setDraft((current) => withLocalDefaults({ ...current, ...userProfile }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const reset = () => {
    setDraft(withLocalDefaults({ ...userProfile }));
    setMessage(null);
    setSavedDistrictId(null);
  };

  const save = async () => {
    if (!user) return;
    const baseline = (userProfile ?? {}) as unknown as Draft;
    const changed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (value !== baseline[key]) changed[key] = value;
    }
    if (Object.keys(changed).length === 0) return;
    setSaving(true);
    try {
      await updateUserProfile(changed as Partial<UserProfileData>);
      writeLocalMirrors(draft);
      await refreshProfile();
      setMessage('Profile saved to your HazardNet account.');
      toast.success('Profile updated');
      const districtId = pickText(draft.homeDistrictId);
      setSavedDistrictId(districtId || null);
    } catch (error) {
      console.error(error);
      setMessage(saveErrorMessage);
      toast.error(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const setDistrict = (name: string) => {
    const matched = ALL_64_DISTRICTS.find((district) => district.name === name);
    setMessage(null);
    setSavedDistrictId(null);
    setDraft((current) => ({
      ...current,
      district: name,
      primaryDistrict: name,
      division: matched?.division ?? current.division,
      primaryDivision: matched?.division ?? current.primaryDivision,
      homeDistrictId: matched?.id ?? current.homeDistrictId,
      homeDistrictName: matched?.name ?? current.homeDistrictName,
    }));
  };

  const handleDetectLocation = async () => {
    setLocating(true);
    try {
      const result = await detectExactPinpointLocation();
      const nearest = findNearestDistrict(result.lat, result.lng)?.district ?? null;
      setMessage(null);
      setDraft((current) => ({
        ...current,
        pinpointLat: result.lat,
        pinpointLng: result.lng,
        division: nearest?.division ?? current.division,
        primaryDivision: nearest?.division ?? current.primaryDivision,
        district: nearest?.name ?? current.district,
        primaryDistrict: nearest?.name ?? current.primaryDistrict,
        homeDistrictId: nearest?.id ?? current.homeDistrictId,
        homeDistrictName: nearest?.name ?? current.homeDistrictName,
      }));
      toast.success(`Location pinned near ${nearest?.name ?? 'your area'}`);
    } catch {
      toast.error('Location permission denied. Pick your district manually.');
    } finally {
      setLocating(false);
    }
  };

  const division = pickText(draft.division) || pickText(draft.primaryDivision);
  const district = pickText(draft.district) || pickText(draft.primaryDistrict);
  const homeDistrictId = pickText(draft.homeDistrictId);
  const hasPin = isValidLatLng(draft.pinpointLat as number | undefined, draft.pinpointLng as number | undefined);
  const username = userProfile?.username ? sanitizeUsernameInput(userProfile.username) : '';

  return (
    <div className="space-y-6">
      {/* ── Who you are ─────────────────────────────────────────────────────── */}
      <Panel
        title="Identity"
        description="Your name and @username become your public profile URL. Everything here is optional except the display name."
      >
        <div className="space-y-6">
          <UserAvatarField />
          <FieldGrid>
            <TextField
              id="profile-first-name"
              label="First name"
              value={pickText(draft.firstName)}
              onChange={set('firstName')}
              autoComplete="given-name"
            />
            <TextField
              id="profile-last-name"
              label="Last name"
              value={pickText(draft.lastName)}
              onChange={set('lastName')}
              autoComplete="family-name"
            />
            <TextField
              id="profile-display-name"
              label="Display name"
              value={pickText(draft.displayName)}
              onChange={set('displayName')}
              hint="Shown on advisories, blog posts and your public profile."
              autoComplete="name"
            />
            <TextField
              id="profile-website"
              label="Website"
              type="url"
              value={pickText(draft.website)}
              onChange={set('website')}
              placeholder="https://your-site.com"
            />
          </FieldGrid>
          <UsernameField
            id="profile-username"
            label="Username (profile URL)"
            value={pickText(draft.username)}
            onChange={(value) => set('username')(value)}
            fullName={pickText(draft.displayName) || `${pickText(draft.firstName)} ${pickText(draft.lastName)}`}
            email={userProfile?.email}
            currentUsername={userProfile?.username}
            showRules={false}
          />
          <TextAreaField
            id="profile-bio"
            label="Bio"
            value={pickText(draft.bio)}
            onChange={set('bio')}
            maxLength={280}
            hint={`${pickText(draft.bio).length}/280 characters`}
            placeholder="Aman farmer from Rangpur experimenting with deficit irrigation."
          />
          <FieldGrid>
            <DateField
              id="profile-dob"
              label="Date of birth"
              value={pickText(draft.dateOfBirth)}
              onChange={set('dateOfBirth')}
            />
            <SelectField
              id="profile-gender"
              label="Gender"
              value={pickText(draft.gender)}
              onChange={set('gender')}
              placeholder="Select…"
              options={options(GENDERS)}
            />
            <TextField
              id="profile-pronouns"
              label="Pronouns"
              value={pickText(draft.pronouns)}
              onChange={set('pronouns')}
              placeholder="she/her, he/him, they/them"
            />
            <TextField
              id="profile-nationality"
              label="Nationality"
              value={pickText(draft.nationality)}
              onChange={set('nationality')}
              placeholder="Bangladeshi"
            />
          </FieldGrid>
        </div>
      </Panel>

      {/* ── How we reach you ────────────────────────────────────────────────── */}
      <Panel title="Contact and locale" description="How HazardNet reaches you, and in which language and timezone.">
        <FieldGrid>
          <TextField
            id="profile-phone"
            label="Phone number"
            type="tel"
            value={pickText(draft.phoneNumber)}
            onChange={set('phoneNumber')}
            placeholder="+8801XXXXXXXXX"
            autoComplete="tel"
          />
          <TextField
            id="profile-whatsapp"
            label="WhatsApp number"
            type="tel"
            value={pickText(draft.whatsappNumber)}
            onChange={set('whatsappNumber')}
            placeholder="+8801XXXXXXXXX"
            hint="Used by the WhatsApp alerts connector."
          />
          <SelectField
            id="profile-language"
            label="Preferred language"
            value={pickText(draft.preferredLanguage) || 'en'}
            onChange={set('preferredLanguage')}
            options={LANGUAGES}
          />
          <SelectField
            id="profile-timezone"
            label="Timezone"
            value={pickText(draft.timezone) || 'Asia/Dhaka'}
            onChange={set('timezone')}
            options={options(TIMEZONES)}
          />
          <TextField id="profile-country" label="Country" value={pickText(draft.country) || 'Bangladesh'} onChange={set('country')} />
        </FieldGrid>
      </Panel>

      {/* ── Where you are ───────────────────────────────────────────────────── */}
      <Panel
        title="Location"
        description="District level data drives your hazard feed. Pinning your farm sharpens the outlook further."
        actions={
          <Button intent="secondary" size="sm" onClick={handleDetectLocation} disabled={locating}>
            {locating ? 'Locating…' : 'Detect my location'}
          </Button>
        }
      >
        <div className="space-y-6">
          <ToggleField
            id="profile-auto-detect"
            label="Use my current location for the district"
            description="Detect your GPS or IP location on launch and map it to the nearest of the 64 districts."
            checked={draft.autoDetectLocationEnabled !== false}
            onChange={set('autoDetectLocationEnabled')}
          />
          <FieldGrid>
            <SelectField
              id="profile-division"
              label="Division"
              value={division}
              onChange={(value) => {
                setMessage(null);
                setDraft((current) => ({ ...current, division: value, primaryDivision: value, district: '', primaryDistrict: '' }));
              }}
              placeholder="Select division…"
              options={options(DIVISIONS)}
            />
            <SelectField
              id="profile-district"
              label="District (of 64)"
              value={district}
              onChange={setDistrict}
              placeholder="Select district…"
              options={districtOptions(division)}
              hint={homeDistrictId ? 'This is also your home district.' : undefined}
            />
            <TextField
              id="profile-upazila"
              label="Upazila / sub-district"
              value={pickText(draft.upazila)}
              onChange={set('upazila')}
              placeholder="e.g. Sadullapur"
            />
            <TextField
              id="profile-village"
              label="Village / area"
              value={pickText(draft.village)}
              onChange={set('village')}
              placeholder="e.g. Boro Bhandar"
            />
            <TextField
              id="profile-postal-code"
              label="Postal code"
              value={pickText(draft.postalCode)}
              onChange={set('postalCode')}
              placeholder="5700"
            />
            <TextField
              id="profile-address"
              label="Street address"
              value={pickText(draft.address)}
              onChange={set('address')}
              placeholder="House / road details"
            />
            <Field
              label="Pinpoint latitude"
              htmlFor="profile-lat"
              hint={hasPin ? 'Set. Used for hyper-local forecasts.' : 'Use Detect my location, or fill both by hand.'}
            >
              <input
                id="profile-lat"
                type="number"
                step="any"
                inputMode="decimal"
                value={pickText(draft.pinpointLat)}
                onChange={(event) => set('pinpointLat')(event.target.value === '' ? undefined : Number(event.target.value))}
                className={inputClass}
                placeholder="25.6480"
              />
            </Field>
            <Field label="Pinpoint longitude" htmlFor="profile-lng">
              <input
                id="profile-lng"
                type="number"
                step="any"
                inputMode="decimal"
                value={pickText(draft.pinpointLng)}
                onChange={(event) => set('pinpointLng')(event.target.value === '' ? undefined : Number(event.target.value))}
                className={inputClass}
                placeholder="88.8870"
              />
            </Field>
          </FieldGrid>
          {homeDistrictId && (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-carbon-05 p-4">
              <p className="text-sm text-carbon-70">
                Home district:{' '}
                <strong className="font-semibold text-carbon-90">
                  {pickText(draft.homeDistrictName) || ALL_64_DISTRICTS.find((d) => d.id === homeDistrictId)?.name || homeDistrictId}
                </strong>
                . This is the district the map and your advisories open on.
              </p>
              <Button
                intent="secondary"
                size="sm"
                onClick={() => {
                  setMessage(null);
                  setDraft((current) => ({
                    ...current,
                    homeDistrictId: undefined,
                    homeDistrictName: undefined,
                    district: '',
                    primaryDistrict: '',
                  }));
                }}
              >
                Clear home district
              </Button>
            </div>
          )}
        </div>
      </Panel>

      {/* ── What you grow ───────────────────────────────────────────────────── */}
      <Panel title="Farming profile" description="These fields tune the advisory engine to your context.">
        <div className="space-y-6">
          <OptionGroup
            label="I am a…"
            value={(pickText(draft.userRole) || 'smallholder_farmer') as UserRolePersona}
            onChange={(value) => set('userRole')(value)}
            options={PERSONAS}
          />
          <FieldGrid>
            <TextField
              id="profile-organization"
              label="Organization / cooperative"
              value={pickText(draft.organization)}
              onChange={set('organization')}
              placeholder="Rangpur Farmers’ Co-op"
              autoComplete="organization"
            />
            <TextField
              id="profile-occupation"
              label="Occupation"
              value={pickText(draft.occupation)}
              onChange={set('occupation')}
              placeholder="Rice and wheat farmer"
            />
            <NumberField
              id="profile-farm-size"
              label="Farm size"
              value={draft.farmSizeHectares as number | undefined}
              onChange={set('farmSizeHectares')}
              min={0}
              step={0.1}
              unit="hectares"
            />
            <NumberField
              id="profile-experience"
              label="Farming experience"
              value={draft.farmingExperienceYears as number | undefined}
              onChange={set('farmingExperienceYears')}
              min={0}
              max={100}
              unit="years"
            />
            <NumberField
              id="profile-income"
              label="Annual agricultural income"
              value={draft.annualIncomeBdt as number | undefined}
              onChange={set('annualIncomeBdt')}
              min={0}
              step={1000}
              unit="BDT"
            />
            <SelectField
              id="profile-irrigation"
              label="Irrigation type"
              value={pickText(draft.irrigationType)}
              onChange={set('irrigationType')}
              placeholder="Select…"
              options={options(IRRIGATION_TYPES)}
            />
            <SelectField
              id="profile-soil"
              label="Dominant soil type"
              value={pickText(draft.soilType)}
              onChange={set('soilType')}
              placeholder="Select…"
              options={options(SOIL_TYPES)}
            />
            <TextField
              id="profile-livestock"
              label="Livestock"
              value={pickText(draft.livestock)}
              onChange={set('livestock')}
              placeholder="2 cows, 8 goats, 30 poultry"
            />
            <TextField
              id="profile-target-crops"
              label="Target crops"
              value={pickText(draft.targetCrops)}
              onChange={set('targetCrops')}
              placeholder="Boro paddy, Aman rice, wheat"
              hint="Comma separated."
              className="sm:col-span-2"
            />
          </FieldGrid>
        </div>
      </Panel>

      {/* ── Where else you post ─────────────────────────────────────────────── */}
      <Panel
        title="Social links"
        description="Shown on your public profile. Leave a field empty to hide it."
      >
        <FieldGrid>
          <TextField
            id="profile-social-facebook"
            label="Facebook"
            value={pickText(draft.socialFacebook)}
            onChange={set('socialFacebook')}
            placeholder="https://facebook.com/…"
          />
          <TextField
            id="profile-social-x"
            label="X (Twitter)"
            value={pickText(draft.socialX)}
            onChange={set('socialX')}
            placeholder="https://x.com/…"
          />
          <TextField
            id="profile-social-linkedin"
            label="LinkedIn"
            value={pickText(draft.socialLinkedin)}
            onChange={set('socialLinkedin')}
            placeholder="https://linkedin.com/in/…"
          />
          <TextField
            id="profile-social-github"
            label="GitHub"
            value={pickText(draft.socialGithub)}
            onChange={set('socialGithub')}
            placeholder="https://github.com/…"
          />
          <TextField
            id="profile-social-youtube"
            label="YouTube"
            value={pickText(draft.socialYoutube)}
            onChange={set('socialYoutube')}
            placeholder="https://youtube.com/@…"
          />
          <TextField
            id="profile-social-instagram"
            label="Instagram"
            value={pickText(draft.socialInstagram)}
            onChange={set('socialInstagram')}
            placeholder="https://instagram.com/…"
          />
        </FieldGrid>
      </Panel>

      {/* ── What we may send, and who may look ──────────────────────────────── */}
      <Panel title="Notifications and privacy" description="Choose what HazardNet sends you and who can see your profile.">
        <div className="divide-y divide-carbon-10">
          <ToggleField
            id="profile-notify-email"
            label="Email notifications"
            description="Hazard alerts for your district and product updates."
            checked={draft.notifyEmail !== false}
            onChange={set('notifyEmail')}
          />
          <ToggleField
            id="profile-notify-sms"
            label="SMS alerts"
            description="Critical warnings by text message. Requires the SMS connector."
            checked={draft.notifySms === true}
            onChange={set('notifySms')}
          />
          <ToggleField
            id="profile-notify-push"
            label="Push notifications"
            description="Browser push for severe hazards within six hours."
            checked={draft.notifyPush !== false}
            onChange={set('notifyPush')}
          />
          <ToggleField
            id="profile-notify-digest"
            label="Weekly advisory digest"
            description="A plain language summary every Sunday evening."
            checked={draft.notifyWeeklyDigest !== false}
            onChange={set('notifyWeeklyDigest')}
          />
          <ToggleField
            id="profile-notify-emergency"
            label="Emergency broadcasts"
            description="Government issued extreme warnings, on every channel."
            checked={draft.notifyEmergencyAlerts !== false}
            onChange={set('notifyEmergencyAlerts')}
          />
          <ToggleField
            id="profile-notify-marketing"
            label="Product and research updates"
            description="Occasional email about new features and published studies."
            checked={draft.marketingOptIn === true}
            onChange={set('marketingOptIn')}
          />
        </div>
        <div className="mt-6 border-t border-carbon-10 pt-6">
          <OptionGroup
            label="Who can see my profile"
            hint={
              username
                ? `Public means anyone with the link can open hazardnet.live${profilePath(username)}.`
                : 'A public profile needs a username, which you can claim above.'
            }
            value={draft.profileVisibility === 'private' ? 'private' : 'public'}
            onChange={set('profileVisibility')}
            options={[
              { value: 'public', label: 'Public', description: 'Anyone with the link can view your profile card.' },
              { value: 'private', label: 'Private', description: 'Only you can see it. The link stops resolving.' },
            ]}
          />
        </div>
      </Panel>

      {savedDistrictId && (
        <p className="text-sm leading-[1.62] text-carbon-70">
          Saved.{' '}
          <Link
            to={`/live?district=${encodeURIComponent(savedDistrictId)}`}
            className="ap-btn ap-btn-secondary"
          >
            Open {ALL_64_DISTRICTS.find((district) => district.id === savedDistrictId)?.name ?? 'your district'} on the
            live map
          </Link>
        </p>
      )}

      <SaveBar dirty={dirty} saving={saving} message={message} onSave={save} onReset={reset} />
    </div>
  );
};

export default ProfileDetails;
