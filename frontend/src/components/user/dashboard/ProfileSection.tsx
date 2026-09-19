import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth, UserProfileData, UserRolePersona } from '../../../context/AuthContext';
import { ALL_64_DISTRICTS } from '../../../data/bangladeshDistricts';
import { UsernameField } from '../UsernameField';
import { UserAvatarField } from '../UserAvatarField';
import { detectExactPinpointLocation, findNearestDistrict, isValidLatLng } from '../../../services/geolocationService';
import {
  Card,
  DateField,
  Field,
  NumberField,
  SaveBar,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
  inputClass,
} from './ui';
import MaterialIcon from '../../MaterialIcon';

/**
 * "Edit Profile" tab — the full data-collection surface. Every field maps to
 * a column on the Supabase `profiles` table (scripts/db/003_user_dashboard.sql)
 * and is editable with a dirty-state save bar.
 */

const PERSONAS: Array<{ value: UserRolePersona; label: string }> = [
  { value: 'smallholder_farmer', label: 'Smallholder Farmer' },
  { value: 'ngo_coordinator', label: 'NGO Disaster Coordinator' },
  { value: 'govt_official', label: 'DAE / Government Extension Officer' },
  { value: 'academic_researcher', label: 'Academic / Climate Researcher' },
  { value: 'commercial_agribusiness', label: 'Commercial Agribusiness' },
];

const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'bn', label: 'বাংলা (Bengali)' },
];
const TIMEZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles'];
const IRRIGATION_TYPES = ['Rain-fed', 'Shallow tube well', 'Deep tube well', 'Canal / surface', 'Drip', 'Sprinkler', 'Other'];
const SOIL_TYPES = ['Loam', 'Clay', 'Clay loam', 'Sandy', 'Sandy loam', 'Silt', 'Peaty', 'Saline', 'Other'];

const DIVISIONS = Array.from(new Set(ALL_64_DISTRICTS.map((district) => district.division))).sort();

type Draft = Record<string, string | number | boolean | undefined>;

const pickText = (value: string | number | boolean | undefined): string =>
  value === undefined || value === null ? '' : String(value);

export const ProfileSection: React.FC = () => {
  const { user, userProfile, updateUserProfile, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => ({ ...userProfile }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const set = (key: string) => (value: string | number | boolean | undefined) => {
    setMessage(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const dirty = useMemo(
    () => Object.keys(draft).some((key) => (draft as Record<string, unknown>)[key] !== (userProfile as unknown as Record<string, unknown>)?.[key]),
    [draft, userProfile],
  );

  // Mirror server-side profile changes into the draft while the user isn't
  // editing (covers async profile loads right after the dashboard mounts).
  useEffect(() => {
    if (!dirty && userProfile) {
      setDraft((current) => ({ ...current, ...userProfile }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const reset = () => {
    setDraft({ ...userProfile });
    setMessage(null);
  };

  const save = async () => {
    if (!user) {
      toast('Design preview — connect Supabase to persist profile changes.', { icon: 'ℹ️' });
      return;
    }
    const changed: Record<string, unknown> = {};
    const baseline = (userProfile ?? {}) as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(draft)) {
      if (value !== baseline[key]) changed[key] = value;
    }
    if (Object.keys(changed).length === 0) return;
    setSaving(true);
    try {
      await updateUserProfile(changed as Partial<UserProfileData>);
      await refreshProfile();
      setDraft((current) => ({ ...current }));
      setMessage('Profile saved to Supabase.');
      toast.success('Profile updated');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDetectLocation = async () => {
    setLocating(true);
    try {
      const result = await detectExactPinpointLocation();
      const nearest = findNearestDistrict(result.lat, result.lng)?.district ?? null;
      setDraft((current) => ({
        ...current,
        pinpointLat: result.lat,
        pinpointLng: result.lng,
        division: nearest?.division ?? current.division,
        district: nearest?.name ?? current.district,
        homeDistrictId: nearest?.id ?? current.homeDistrictId,
        homeDistrictName: nearest?.name ?? current.homeDistrictName,
      }));
      toast.success(`Location pinned near ${nearest?.name ?? 'your area'}`);
    } catch {
      toast.error('Location permission denied — pick your district manually.');
    } finally {
      setLocating(false);
    }
  };

  const divisionValue = pickText(draft.division) || pickText(draft.primaryDivision);
  const districtsForDivision = ALL_64_DISTRICTS.filter((district) => district.division === divisionValue);
  const districtOptions = (districtsForDivision.length > 0 ? districtsForDivision : ALL_64_DISTRICTS).map((district) => ({
    value: district.name,
    label: district.name,
  }));

  const hasPin = isValidLatLng(draft.pinpointLat as number | undefined, draft.pinpointLng as number | undefined);

  return (
    <div className="space-y-5">
      {/* Identity */}
      <Card title="Identity" subtitle="How you appear across HazardNet — your name and unique @username become your profile URL." icon={<MaterialIcon name="badge_fallback" size={18} />}>
        <div className="space-y-4">
          <UserAvatarField />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="first-name" label="First name" value={pickText(draft.firstName)} onChange={set('firstName')} placeholder="Ashif" autoComplete="given-name" />
            <TextField id="last-name" label="Last name" value={pickText(draft.lastName)} onChange={set('lastName')} placeholder="Ahmed" autoComplete="family-name" />
          </div>
          <TextField id="display-name" label="Display name" value={pickText(draft.displayName)} onChange={set('displayName')} placeholder="Ashif Ahmed" hint="Shown on advisories, blogs and your public profile." />
          <div className="grid gap-4 sm:grid-cols-2">
            <UsernameField
              id="dashboard-username"
              label="Username (profile URL)"
              value={pickText(draft.username)}
              onChange={(value) => set('username')(value)}
              fullName={pickText(draft.displayName) || `${pickText(draft.firstName)} ${pickText(draft.lastName)}`}
              email={userProfile?.email}
              currentUsername={userProfile?.username}
              showRules={false}
            />
            <TextField
              id="website"
              label="Website"
              value={pickText(draft.website)}
              onChange={set('website')}
              placeholder="https://your-site.com"
              type="url"
            />
          </div>
          <TextAreaField id="bio" label="Bio" value={pickText(draft.bio)} onChange={set('bio')} placeholder="Aman farmer from Rangpur experimenting with deficit irrigation…" maxLength={280} hint={`${pickText(draft.bio).length}/280 characters`} />
          <div className="grid gap-4 sm:grid-cols-3">
            <DateField id="date-of-birth" label="Date of birth" value={pickText(draft.dateOfBirth)} onChange={set('dateOfBirth')} />
            <SelectField
              id="gender"
              label="Gender"
              value={pickText(draft.gender)}
              onChange={set('gender')}
              placeholder="Select…"
              options={GENDERS.map((gender) => ({ value: gender, label: gender }))}
            />
            <TextField id="pronouns" label="Pronouns" value={pickText(draft.pronouns)} onChange={set('pronouns')} placeholder="she/her, he/him, they/them" />
          </div>
          <TextField id="nationality" label="Nationality" value={pickText(draft.nationality)} onChange={set('nationality')} placeholder="Bangladeshi" />
        </div>
      </Card>

      {/* Contact & locale */}
      <Card title="Contact & locale" subtitle="How HazardNet reaches you and in which language/timezone advisories render." icon={<MaterialIcon name="mail" size={18} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="phone-number" label="Phone number" value={pickText(draft.phoneNumber)} onChange={set('phoneNumber')} placeholder="+8801XXXXXXXXX" type="tel" autoComplete="tel" />
          <TextField id="whatsapp-number" label="WhatsApp number" value={pickText(draft.whatsappNumber)} onChange={set('whatsappNumber')} placeholder="+8801XXXXXXXXX" type="tel" hint="Used by the WhatsApp Alerts connector." />
          <SelectField id="preferred-language" label="Preferred language" value={pickText(draft.preferredLanguage) || 'en'} onChange={set('preferredLanguage')} options={LANGUAGES} />
          <SelectField
            id="timezone"
            label="Timezone"
            value={pickText(draft.timezone) || 'Asia/Dhaka'}
            onChange={set('timezone')}
            options={TIMEZONES.map((timezone) => ({ value: timezone, label: timezone }))}
          />
        </div>
      </Card>

      {/* Location */}
      <Card
        title="Location"
        subtitle="District-level data drives your hazard feed. Pin your farm for hyper-local accuracy."
        icon={<MaterialIcon name="pin" size={18} />}
        actions={
          <button
            type="button"
            onClick={handleDetectLocation}
            disabled={locating}
            className="flex items-center gap-1.5 rounded-xl border border-carbon-20 px-3 py-1.5 text-[11px] font-bold text-carbon-60 transition-colors hover:bg-carbon-05 disabled:opacity-50 cursor-pointer"
          >
            {locating ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-carbon-30 border-t-carbon-60" />
            ) : (
              <MaterialIcon name="person_pin_circle" size={14} />
            )}
            {locating ? 'Locating…' : 'Detect my location'}
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="country" label="Country" value={pickText(draft.country) || 'Bangladesh'} onChange={set('country')} />
          <SelectField
            id="division"
            label="Division"
            value={divisionValue}
            onChange={(value) => {
              set('division')(value);
              set('district')('');
              set('primaryDivision')(value);
            }}
            placeholder="Select division…"
            options={DIVISIONS.map((division) => ({ value: division, label: division }))}
          />
          <SelectField
            id="district"
            label="District (of 64)"
            value={pickText(draft.district) || pickText(draft.primaryDistrict)}
            onChange={(value) => {
              set('district')(value);
              set('primaryDistrict')(value);
              const matched = ALL_64_DISTRICTS.find((district) => district.name === value);
              if (matched) {
                setDraft((current) => ({ ...current, district: value, primaryDistrict: value, division: matched.division, primaryDivision: matched.division, homeDistrictId: matched.id, homeDistrictName: matched.name }));
                setMessage(null);
              }
            }}
            placeholder="Select district…"
            options={districtOptions}
          />
          <TextField id="upazila" label="Upazila / Sub-district" value={pickText(draft.upazila)} onChange={set('upazila')} placeholder="e.g. Sadullapur" />
          <TextField id="village" label="Village / Area" value={pickText(draft.village)} onChange={set('village')} placeholder="e.g. Boro Bhandar" />
          <TextField id="postal-code" label="Postal code" value={pickText(draft.postalCode)} onChange={set('postalCode')} placeholder="5700" />
          <TextField id="address" label="Street address" value={pickText(draft.address)} onChange={set('address')} placeholder="House / road details" className="sm:col-span-2" />
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <Field label="Pinpoint latitude" htmlFor="pin-lat" hint={hasPin ? 'Set — used for hyper-local forecasts.' : 'Use “Detect my location” or fill manually.'}>
              <input
                id="pin-lat"
                type="number"
                step="any"
                value={pickText(draft.pinpointLat)}
                onChange={(event) => set('pinpointLat')(event.target.value === '' ? undefined : Number(event.target.value))}
                className={inputClass}
                placeholder="25.6480"
              />
            </Field>
            <Field label="Pinpoint longitude" htmlFor="pin-lng">
              <input
                id="pin-lng"
                type="number"
                step="any"
                value={pickText(draft.pinpointLng)}
                onChange={(event) => set('pinpointLng')(event.target.value === '' ? undefined : Number(event.target.value))}
                className={inputClass}
                placeholder="88.8870"
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Farming profile */}
      <Card title="Farming profile" subtitle="These fields tune the AI advisory engine to your exact context." icon={<MaterialIcon name="agriculture" size={18} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="user-role"
            label="I am a…"
            value={pickText(draft.userRole) || 'smallholder_farmer'}
            onChange={set('userRole')}
            options={PERSONAS}
          />
          <TextField id="organization" label="Organization / Cooperative" value={pickText(draft.organization)} onChange={set('organization')} placeholder="Rangpur Farmers’ Co-op" />
          <TextField id="occupation" label="Occupation" value={pickText(draft.occupation)} onChange={set('occupation')} placeholder="Rice & wheat farmer" />
          <NumberField id="farm-size" label="Farm size" value={draft.farmSizeHectares as number | undefined} onChange={set('farmSizeHectares')} min={0} step={0.1} suffix="hectares" />
          <NumberField id="experience" label="Farming experience" value={draft.farmingExperienceYears as number | undefined} onChange={set('farmingExperienceYears')} min={0} max={100} suffix="years" />
          <NumberField id="annual-income" label="Annual agricultural income" value={draft.annualIncomeBdt as number | undefined} onChange={set('annualIncomeBdt')} min={0} step={1000} suffix="BDT" />
          <TextField id="target-crops" label="Target crops" value={pickText(draft.targetCrops)} onChange={set('targetCrops')} placeholder="Boro Paddy, Aman Rice, Wheat" hint="Comma-separated." className="sm:col-span-2" />
          <SelectField id="irrigation" label="Irrigation type" value={pickText(draft.irrigationType)} onChange={set('irrigationType')} placeholder="Select…" options={IRRIGATION_TYPES.map((type) => ({ value: type, label: type }))} />
          <SelectField id="soil" label="Dominant soil type" value={pickText(draft.soilType)} onChange={set('soilType')} placeholder="Select…" options={SOIL_TYPES.map((type) => ({ value: type, label: type }))} />
          <TextField id="livestock" label="Livestock" value={pickText(draft.livestock)} onChange={set('livestock')} placeholder="2 cows, 8 goats, 30 poultry" className="sm:col-span-2" />
        </div>
      </Card>

      {/* Social links */}
      <Card title="Social links" subtitle="Shown on your public profile at hazardnet.live/u/&lt;username&gt;." icon={<MaterialIcon name="share" size={18} />}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="social-facebook" label="Facebook" value={pickText(draft.socialFacebook)} onChange={set('socialFacebook')} placeholder="https://facebook.com/…" />
          <TextField id="social-x" label="X (Twitter)" value={pickText(draft.socialX)} onChange={set('socialX')} placeholder="https://x.com/…" />
          <TextField id="social-linkedin" label="LinkedIn" value={pickText(draft.socialLinkedin)} onChange={set('socialLinkedin')} placeholder="https://linkedin.com/in/…" />
          <TextField id="social-github" label="GitHub" value={pickText(draft.socialGithub)} onChange={set('socialGithub')} placeholder="https://github.com/…" />
          <TextField id="social-youtube" label="YouTube" value={pickText(draft.socialYoutube)} onChange={set('socialYoutube')} placeholder="https://youtube.com/@…" />
          <TextField id="social-instagram" label="Instagram" value={pickText(draft.socialInstagram)} onChange={set('socialInstagram')} placeholder="https://instagram.com/…" />
        </div>
      </Card>

      {/* Preferences */}
      <Card title="Notifications & privacy" subtitle="Choose what HazardNet sends you and who can see your profile." icon={<MaterialIcon name="notifications" size={18} />}>
        <div className="divide-y divide-carbon-10">
          <ToggleField id="notify-email" label="Email notifications" description="Hazard alerts for your district, product updates." checked={draft.notifyEmail !== false} onChange={set('notifyEmail')} />
          <ToggleField id="notify-sms" label="SMS alerts" description="Critical warnings by text message (requires SMS connector)." checked={draft.notifySms === true} onChange={set('notifySms')} />
          <ToggleField id="notify-push" label="Push notifications" description="Browser push for severe hazards within 6 hours." checked={draft.notifyPush !== false} onChange={set('notifyPush')} />
          <ToggleField id="notify-digest" label="Weekly advisory digest" description="A plain-language summary every Sunday evening." checked={draft.notifyWeeklyDigest !== false} onChange={set('notifyWeeklyDigest')} />
          <ToggleField id="notify-emergency" label="Emergency broadcasts" description="Government-issued extreme warnings, all channels." checked={draft.notifyEmergencyAlerts !== false} onChange={set('notifyEmergencyAlerts')} />
          <ToggleField id="marketing" label="Product & research updates" description="Occasional emails about new HazardNet features and studies." checked={draft.marketingOptIn === true} onChange={set('marketingOptIn')} />
          <ToggleField
            id="profile-visibility"
            label="Public profile"
            description="Allow anyone with your link (hazardnet.live/u/username) to view your profile card."
            checked={draft.profileVisibility !== 'private'}
            onChange={(checked) => set('profileVisibility')(checked ? 'public' : 'private')}
          />
        </div>
      </Card>

      <SaveBar dirty={dirty} saving={saving} message={message} onSave={save} onReset={reset} />
    </div>
  );
};
