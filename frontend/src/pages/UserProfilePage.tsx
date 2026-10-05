import MaterialIcon from "../components/MaterialIcon";
import { Loader2, LogOut, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth, UserRolePersona } from '../context/AuthContext';
import { detectExactPinpointLocation, LocationDetectionResult, findNearestDistrict, isValidLatLng, isValidCoordinate, getSeverityTier } from '../services/geolocationService';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { getGranularDisasterData } from '../data/disasterDetails';
import { FirebaseRealtimeStatus } from '../components/FirebaseRealtimeStatus';
import IdentityConnections from '../components/IdentityConnections';
import Breadcrumbs from '../components/Breadcrumbs';
import { profilePath } from '../lib/username';
import { InfinityLoader } from '../components/brand';
import { NumberField, SelectField, TextField } from '../components/user/dashboard/ui';

/**
 * Signed-in user profile — unique URL: /profile
 *
 * Replaces the navbar UserProfileModal overlay. The public-facing page for
 * the same person lives at /u/<username>.
 */

/**
 * Severity ink for the inverted hazard tile. Severity is a protected data
 * encoding, so this one keeps its hue — but it has to TRACK the reading. It
 * was a fixed rose, which painted a 20% score the same red as a 95% one.
 * The -300 steps are the tints that clear AA on a carbon-80 tile.
 */
const SEVERITY_INK_ON_TILE: Record<string, string> = {
  low: 'text-emerald-300',
  moderate: 'text-amber-300',
  high: 'text-orange-300',
  veryHigh: 'text-rose-300',
  extreme: 'text-rose-300',
};

const PERSONA_LABELS: Record<UserRolePersona, { label: string; tag: string }> = {
  smallholder_farmer: { label: 'Rural Smallholder Farmer', tag: 'Micro-Farm & Local Advisory' },
  ngo_coordinator: { label: 'NGO Disaster Coordinator', tag: 'Humanitarian Relief & WASH' },
  govt_official: { label: 'DAE / Govt Extension Officer', tag: 'Regional Oversight & Policy' },
  academic_researcher: { label: 'Academic Climate Scientist', tag: 'Satellite Records & Metrics' },
  commercial_agribusiness: { label: 'Commercial Agro-Business', tag: 'Supply Chain & Logistics' },
};

export const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, loading, updateUserProfile, signOut, sendPasswordResetEmail } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userRole, setUserRole] = useState<UserRolePersona>('smallholder_farmer');
  const [organization, setOrganization] = useState('');
  const [farmSizeHectares, setFarmSizeHectares] = useState<number>(1.5);
  const [primaryDivision, setPrimaryDivision] = useState('Rangpur');
  const [primaryDistrict, setPrimaryDistrict] = useState('');
  const [targetCrops, setTargetCrops] = useState('Boro Paddy, Aman Rice');
  
  const [pinpointLat, setPinpointLat] = useState<number | undefined>();
  const [pinpointLng, setPinpointLng] = useState<number | undefined>();

  // Geolocation detection state
  const [locResult, setLocResult] = useState<LocationDetectionResult | null>(null);
  const [detectingLoc, setDetectingLoc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [homeDistrictId, setHomeDistrictId] = useState<string>(
    userProfile?.homeDistrictId || localStorage.getItem('hazardnet_home_district') || ''
  );
  const [autoDetectLocationEnabled, setAutoDetectLocationEnabled] = useState<boolean>(
    userProfile?.autoDetectLocationEnabled ?? (localStorage.getItem('hazardnet_auto_detect_location') !== 'false')
  );

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || user?.displayName || '');
      setPhoneNumber(userProfile.phoneNumber || '');
      setUserRole(userProfile.userRole || 'smallholder_farmer');
      setOrganization(userProfile.organization || '');
      setFarmSizeHectares(userProfile.farmSizeHectares ?? 1.5);
      setPrimaryDivision(userProfile.primaryDivision || 'Rangpur');
      setPrimaryDistrict(userProfile.primaryDistrict || '');
      setHomeDistrictId(userProfile.homeDistrictId || localStorage.getItem('hazardnet_home_district') || '');
      setAutoDetectLocationEnabled(userProfile.autoDetectLocationEnabled ?? (localStorage.getItem('hazardnet_auto_detect_location') !== 'false'));
      setTargetCrops(userProfile.targetCrops || 'Boro Paddy, Aman Rice');
      const validLat = isValidLatLng(userProfile.pinpointLat, userProfile.pinpointLng) ? userProfile.pinpointLat : undefined;
      const validLng = isValidLatLng(userProfile.pinpointLat, userProfile.pinpointLng) ? userProfile.pinpointLng : undefined;
      setPinpointLat(validLat);
      setPinpointLng(validLng);
    }
  }, [userProfile, user]);

  const handleToggleAutoDetect = async (enabled: boolean) => {
    setAutoDetectLocationEnabled(enabled);
    try {
      localStorage.setItem('hazardnet_auto_detect_location', String(enabled));
    } catch {
      // storage unavailable (private mode) — setting is best-effort
    }
    try {
      await updateUserProfile({ autoDetectLocationEnabled: enabled });
      toast.success(
        enabled
          ? 'Automatic location detection enabled for district mapping'
          : 'Automatic location detection disabled',
        { icon: enabled ? 'location_on' : 'lock', duration: 3500 }
      );
    } catch (err) {
      console.error('Failed to update location preference:', err);
    }
  };

  const handleSetHomeDistrict = (distId: string) => {
    const matched = ALL_64_DISTRICTS.find((d) => d.id === distId);
    if (matched) {
      setHomeDistrictId(matched.id);
      setPrimaryDistrict(matched.name);
      setPrimaryDivision(matched.division);
      try {
        localStorage.setItem('hazardnet_home_district', matched.id);
      } catch {
        // storage unavailable — best-effort
      }
    }
  };

  const handleDetectLocation = async () => {
    setDetectingLoc(true);
    setLocResult(null);
    try {
      const result = await detectExactPinpointLocation();
      setLocResult(result);
      setPinpointLat(result.lat);
      setPinpointLng(result.lng);
      setPrimaryDistrict(result.nearestDistrict.name);
      setPrimaryDivision(result.nearestDistrict.division);
    } catch (err) {
      console.error('Location detection failed:', err);
    } finally {
      setDetectingLoc(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage('');
    try {
      const matchedHomeDist = ALL_64_DISTRICTS.find((d) => d.id === homeDistrictId);
      await updateUserProfile({
        displayName,
        phoneNumber,
        userRole,
        organization,
        farmSizeHectares: Number(farmSizeHectares) || 0,
        primaryDivision,
        primaryDistrict,
        homeDistrictId: homeDistrictId || undefined,
        homeDistrictName: matchedHomeDist?.name || undefined,
        autoDetectLocationEnabled,
        targetCrops,
        pinpointLat: isValidLatLng(pinpointLat, pinpointLng) ? pinpointLat : undefined,
        pinpointLng: isValidLatLng(pinpointLat, pinpointLng) ? pinpointLng : undefined,
      });

      // Find district to sync map
      let matchedDist = ALL_64_DISTRICTS.find(d => d.id === homeDistrictId || d.name.toLowerCase() === primaryDistrict.toLowerCase());
      if (!matchedDist && isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng) && isValidLatLng(pinpointLat, pinpointLng)) {
        matchedDist = findNearestDistrict(pinpointLat, pinpointLng).district;
      }

      if (matchedDist) {
        navigate(`/?district=${matchedDist.id}`);
      }

      setSaveMessage('Profile settings and Home District saved successfully!');
      setTimeout(() => {
        setSaveMessage('');
      }, 1800);
    } catch (err: any) {
      console.error(err);
      setSaveMessage('Failed to save profile changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      toast.success('Signed out securely. Session state cleared.');
      navigate('/', { replace: true });
    } catch (err: any) {
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
      toast.success(`Password reset link dispatched to ${user.email}`, { icon: <MaterialIcon name="mail" className="w-4 h-4 inline-block mr-1" /> });
    } catch (err: any) {
      console.error('Reset error:', err);
      toast.error(err.message || 'Failed to dispatch password reset email.');
    } finally {
      setIsSendingReset(false);
    }
  };

  const personaInfo = PERSONA_LABELS[userRole] || PERSONA_LABELS.smallholder_farmer;
  const publicUsername = userProfile?.username;

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl space-y-6 pb-10"
      data-testid="user-profile-page"
    >
      <Breadcrumbs />
      <div className="bg-white border border-carbon-20 w-full p-6 space-y-6 flex flex-col text-carbon-80">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pb-3 sm:pb-4 border-b border-carbon-20">
          <div className="flex items-center gap-3 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="h-16 w-16 sm:h-24 sm:w-24 rounded-full object-cover border border-carbon-20 shrink-0"
              />
            ) : (
              <div className="h-16 w-16 sm:h-24 sm:w-24 rounded-full bg-primary text-ap-action-fg font-black text-lg flex items-center justify-center shrink-0">
                {(displayName || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-ap-lead font-bold leading-tight text-carbon-90 truncate max-w-[55vw] sm:max-w-none">{displayName || 'User Profile'}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-carbon-10 text-carbon-70 border border-carbon-20 whitespace-nowrap">
                  {personaInfo.label}
                </span>
              </div>
              <p className="text-base leading-[1.62] text-carbon-60 font-medium truncate max-w-[60vw] sm:max-w-none">{user.email}</p>
              <p className="text-xs font-mono text-carbon-60 mt-0.5">hazardnet.live/profile</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {publicUsername && (
              <Link
                to={profilePath(publicUsername)}
                className="min-h-[44px] px-3 py-2 text-base font-semibold text-ap-link hover:bg-carbon-05 border border-carbon-20 flex items-center gap-1 touch-manipulation"
              >
                Public page /u/{publicUsername}
              </Link>
            )}
            <Link
              to="/dashboard"
              className="min-h-[44px] px-3 py-2 text-base font-semibold text-carbon-60 hover:text-carbon-90 hover:bg-carbon-10 border border-carbon-20 flex items-center gap-1 touch-manipulation"
            >
              Dashboard
            </Link>
          </div>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto space-y-4 pr-1">
          
          {saveMessage && (
            <div className={`p-3 text-xs font-bold border ${
              saveMessage.includes('updated') ? 'bg-carbon-05 text-carbon-80 border-carbon-20' : 'bg-white text-ap-link border-ap-primary'
            }`}>
              {saveMessage}
            </div>
          )}

          {/* Firebase Realtime Database Status Indicator */}
          <FirebaseRealtimeStatus variant="card" />

          {/* Persona Card Selector */}
          <div className="bg-carbon-05 border border-carbon-20 p-4 space-y-2">
            <label className="block text-xs font-extrabold text-carbon-90">
              Stakeholder Role & Persona Tailoring
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(PERSONA_LABELS) as UserRolePersona[]).map((roleKey) => {
                const item = PERSONA_LABELS[roleKey];
                const isSelected = userRole === roleKey;
                return (
                  <button
                    type="button"
                    key={roleKey}
                    onClick={() => setUserRole(roleKey)}
                    className={`min-h-[44px] p-3 text-left border transition-all flex items-center gap-2.5 touch-manipulation tap-target ${
                      isSelected
                        ? 'bg-ap-primary/8 text-ap-link border-ap-primary font-bold'
                        : 'bg-white text-carbon-70 border-carbon-20 hover:border-carbon-40'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{item.label}</div>
                      <div className={`text-xs truncate ${isSelected ? 'text-ap-link' : 'text-carbon-60'}`}>
                        {item.tag}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Use Current Location for District Setting Toggle */}
          <section aria-labelledby="profile-autolocate-h" className="bg-carbon-05 border border-carbon-20 p-4 transition-all">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                  autoDetectLocationEnabled ? 'bg-ap-primary/10 text-ap-link border border-ap-primary' : 'bg-carbon-20 text-carbon-60 border border-carbon-30'
                }`}>
                  <MaterialIcon name="my_location" className="w-5 h-5 text-current" filled />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 id="profile-autolocate-h" className="text-xs font-extrabold text-carbon-90">Use Current Location for District</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                      autoDetectLocationEnabled ? 'bg-ap-primary/10 text-ap-link border border-ap-primary' : 'bg-carbon-20 text-carbon-70 border border-carbon-30'
                    }`}>
                      {autoDetectLocationEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-xs text-carbon-60 mt-0.5 leading-relaxed">
                    Automatically detect your geographic GPS / IP location on app launch and map to the nearest Bangladesh district.
                  </p>
                </div>
              </div>

              {/* Interactive switch.
                  This was a second toggle design: an amber thumb on a carbon
                  track with an amber focus ring, next to the kit's switch on
                  /dashboard which is a white thumb on the severity-low track
                  with the accent focus ring. Same control, same product, two
                  appearances — and amber is the severity vocabulary, not
                  chrome. Uses the shared switch styling now. */}
              <button
                type="button"
                role="switch"
                aria-checked={autoDetectLocationEnabled}
                onClick={() => handleToggleAutoDetect(!autoDetectLocationEnabled)}
                className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary/60 ${
                  autoDetectLocationEnabled ? 'bg-severity-low' : 'bg-carbon-30'
                }`}
                title={autoDetectLocationEnabled ? 'Disable automatic location detection' : 'Enable automatic location detection'}
              >
                <span className="sr-only">Use current location for district</span>
                <span
                  className={`pointer-events-none absolute top-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ease-in-out ${
                    autoDetectLocationEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Pinpoint Geolocation Box */}
          <section aria-labelledby="profile-pinpoint-h" className="bg-carbon-05 border border-carbon-20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 id="profile-pinpoint-h" className="text-xs font-extrabold text-carbon-90">IP & GPS Precise Pinpoint Coordinates</h2>
                <p className="text-xs text-carbon-60">Auto-detect nearest Bangladesh district and exact lat/lng</p>
              </div>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={detectingLoc}
                className="min-h-[44px] px-3.5 py-2 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 font-bold text-xs border border-carbon-90 transition-all disabled:opacity-50 touch-manipulation tap-target inline-flex items-center justify-center"
              >
                {detectingLoc ? 'Detecting...' : 'Pinpoint Location'}
              </button>
            </div>

            {locResult && (
              <div className="bg-white border border-carbon-20 p-3 text-xs space-y-2 ap-enter">
                <div className="flex items-center justify-between font-bold text-carbon-90">
                  <span>Method: {locResult.method.toUpperCase()}</span>
                  <span>Nearest: {locResult.nearestDistrict.name} ({locResult.distanceKm.toFixed(1)} km away)</span>
                </div>
                <div className="font-mono text-xs text-carbon-60 flex items-center justify-between">
                  <span>Lat: {locResult.lat.toFixed(4)}, Lng: {locResult.lng.toFixed(4)}</span>
                  {locResult.accuracyMeters && <span>Accuracy: ±{Math.round(locResult.accuracyMeters)}m</span>}
                </div>
                {locResult.city && (
                  <div className="text-xs text-carbon-60">
                    City/ISP: {locResult.city}, {locResult.country} ({locResult.isp || 'IP Geolocation'})
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      navigate(`/?district=${locResult.nearestDistrict.id}`);
                    }}
                    className="min-h-[44px] py-2 px-3 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 border border-carbon-90 font-bold text-xs transition-colors touch-manipulation tap-target inline-flex items-center justify-center"
                  >
                    Sync Map to {locResult.nearestDistrict.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetHomeDistrict(locResult.nearestDistrict.id)}
                    className="min-h-[44px] py-2 px-3 bg-white hover:bg-carbon-05 text-carbon-80 border border-carbon-20 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 touch-manipulation tap-target"
                  >
                    <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" /><span>Set as Default Home District</span>
                  </button>
                </div>
              </div>
            )}

            {isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng) && isValidLatLng(pinpointLat, pinpointLng) && !locResult && (
              <div className="text-xs text-carbon-70 font-mono bg-white p-2.5 border border-carbon-20 flex items-center justify-between">
                <span>Stored Coordinates: <strong>{pinpointLat.toFixed(4)}, {pinpointLng.toFixed(4)}</strong></span>
                <span className="text-xs text-carbon-60 font-sans">Synced with Firestore</span>
              </div>
            )}
          </section>

          {/* Dedicated Default Home District Preference Card */}
          <section aria-labelledby="profile-homedistrict-h" className="bg-carbon-05 border border-carbon-20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm"><MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" /></span>
                  <h2 id="profile-homedistrict-h" className="text-xs font-extrabold text-carbon-90">Default Home District Preference</h2>
                </div>
                <p className="text-xs text-carbon-60 mt-0.5">
                  The application will automatically load and map this district on every visit.
                </p>
              </div>
              {homeDistrictId ? (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-ap-primary/10 text-ap-link border border-ap-primary flex items-center gap-1">
                  <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" />
                  <span>{ALL_64_DISTRICTS.find(d => d.id === homeDistrictId)?.name || homeDistrictId}</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-carbon-20 text-carbon-60">
                  Not configured
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-12">
              <div className="sm:col-span-8">
                <SelectField
                  id="profile-home-district"
                  label="Default home district"
                  value={homeDistrictId}
                  onChange={handleSetHomeDistrict}
                  placeholder="Select a district (64 available)"
                  options={ALL_64_DISTRICTS.map((d) => ({
                    value: d.id,
                    label: `${d.name} District (${d.division} Division)`,
                  }))}
                />
              </div>
              <div className="sm:col-span-4">
                {homeDistrictId && (
                  <button
                    type="button"
                    onClick={() => {
                      setHomeDistrictId('');
                      try { localStorage.removeItem('hazardnet_home_district'); } catch { /* best-effort */ }
                    }}
                    className="min-h-[44px] w-full cursor-pointer border border-carbon-20 bg-white px-3 py-2 text-base font-semibold text-carbon-70 transition-colors hover:bg-carbon-05 touch-manipulation"
                  >
                    Clear home district
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* District-Based Hazard & Severity Identification Card */}
          {(() => {
            const currentDistrictObj = ALL_64_DISTRICTS.find(d => d.id === homeDistrictId) || ALL_64_DISTRICTS.find(d => d.id === 'dhaka') || ALL_64_DISTRICTS[0];
            const granular = currentDistrictObj ? getGranularDisasterData(currentDistrictObj.id) : null;
            const severityScorePct = currentDistrictObj ? Math.round(currentDistrictObj.severity * 100) : 75;

            return (
              <div className="bg-carbon-90 text-carbon-05 border border-carbon-80 p-4 space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-carbon-80 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-ap-on-inverse font-semibold text-sm"><MaterialIcon name="shield" className="w-4 h-4 inline-block mr-1" /></span>
                    <div>
                      <h2 className="text-xs font-extrabold text-ap-on-inverse tracking-wide uppercase font-mono">
                        District Hazard & Severity Identification
                      </h2>
                      <p className="text-xs text-carbon-30 font-sans">
                        Identified using user district ({currentDistrictObj.name}) instead of raw lat/lon coordinates
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-black border ${
                    currentDistrictObj.risk === 'High' ? 'bg-severity-high-surface text-severity-high border-severity-high/40' :
                    currentDistrictObj.risk === 'Moderate' ? 'bg-severity-moderate-surface text-severity-moderate border-severity-moderate/40' :
                    'bg-severity-low-surface text-severity-low border-severity-low/40'
                  }`}>
                    {currentDistrictObj.risk} Risk ({severityScorePct}% Severity)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-carbon-80/80 p-2.5 border border-carbon-70/60">
                    <span className="text-xs font-mono text-carbon-30 block uppercase">Selected District</span>
                    <strong className="text-ap-on-inverse font-bold truncate block mt-0.5">{currentDistrictObj.name} ({currentDistrictObj.division})</strong>
                  </div>
                  <div className="bg-carbon-80/80 p-2.5 border border-carbon-70/60">
                    <span className="text-xs font-mono text-carbon-30 block uppercase">Primary Hazard</span>
                    <strong className="text-ap-on-inverse font-black truncate block mt-0.5">{currentDistrictObj.hazardType}</strong>
                  </div>
                  <div className="bg-carbon-80/80 p-2.5 border border-carbon-70/60">
                    <span className="text-xs font-mono text-carbon-30 block uppercase">Severity Score</span>
                    <strong data-severity-ink className={`${SEVERITY_INK_ON_TILE[getSeverityTier(currentDistrictObj.severity)]} font-mono font-bold block mt-0.5`}>{severityScorePct}%</strong>
                  </div>
                  <div className="bg-carbon-80/80 p-2.5 border border-carbon-70/60">
                    <span className="text-xs font-mono text-carbon-30 block uppercase">Vulnerable Crop</span>
                    <strong className="text-ap-on-inverse font-bold truncate block mt-0.5">{currentDistrictObj.mainCrop}</strong>
                  </div>
                </div>

                {granular?.modelAssessment?.confidenceProbabilities && (
                  <div className="pt-2 border-t border-carbon-80 text-xs space-y-1.5">
                    <span className="text-xs font-mono text-carbon-30 font-extrabold uppercase tracking-wider block">
                      Multi-Hazard Risk Distribution for {currentDistrictObj.name}:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {granular.modelAssessment.confidenceProbabilities.map((item: { hazard: string; probability: number }, idx: number) => (
                        <div key={idx} className="px-2.5 py-1 bg-carbon-80 border border-carbon-70 text-xs flex items-center gap-1.5 font-mono">
                          <span className="text-carbon-30 font-bold">{item.hazard}:</span>
                          <span className="text-ap-on-inverse font-bold">{Math.round(item.probability * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Form fields.
              These are the shared user-area primitives, the same ones
              /dashboard's ProfileSection uses. Hand-rolled inputs here
              previously carried a visible <label> with no htmlFor and no id on
              the control, so not one field on this settings page had a
              programmatic name — a screen reader read them all as "edit text,
              blank". TextField wires the pair for free, and brings the
              canonical focus ring with it. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              id="profile-display-name"
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="name"
            />
            <TextField
              id="profile-phone"
              label="Phone number"
              type="tel"
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="+880 1712-345678"
              autoComplete="tel"
            />
            <TextField
              id="profile-organization"
              label="Organization / department"
              value={organization}
              onChange={setOrganization}
              placeholder="e.g. DAE Rangpur / Self Farm"
              autoComplete="organization"
            />
            <NumberField
              id="profile-farm-size"
              label="Farm / land area"
              value={farmSizeHectares}
              onChange={(value) => setFarmSizeHectares(value ?? 0)}
              min={0}
              step={0.1}
              suffix="ha"
            />
            <TextField
              id="profile-primary-division"
              label="Primary division"
              value={primaryDivision}
              onChange={setPrimaryDivision}
            />
            <TextField
              id="profile-primary-district"
              label="Primary district"
              value={primaryDistrict}
              onChange={setPrimaryDistrict}
            />
            <TextField
              id="profile-target-crops"
              label="Target crops / cultivations"
              value={targetCrops}
              onChange={setTargetCrops}
              placeholder="e.g. Boro Paddy, Aman Rice, Jute, Potato, Maize"
              className="sm:col-span-2"
            />
          </div>

          {/* Account Security & Session Management Card */}
          <section aria-labelledby="profile-security-h" className="bg-carbon-05 border border-carbon-20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm"><MaterialIcon name="lock" className="w-4 h-4 inline-block mr-1" /></span>
                <h2 id="profile-security-h" className="text-xs font-extrabold text-carbon-90 uppercase tracking-wide">
                  Account Security & Active Session
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-carbon-10 text-carbon-80 border border-carbon-20">
                Authenticated
              </span>
            </div>

            <p className="text-xs text-carbon-60 leading-relaxed">
              You are signed in as <strong className="text-carbon-90">{user.email || user.displayName || 'User'}</strong>. Logging out terminates your sign-in session and clears local application caches and cached district preferences from this browser.
            </p>

            <div className="p-3 bg-carbon-05 border border-carbon-20 text-xs text-carbon-60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-bold text-carbon-80 flex items-center gap-1.5">
                  <MaterialIcon name="grid_view" className="w-4 h-4" />
                  <span>Full User Dashboard</span>
                </div>
                <div className="text-xs text-carbon-60">
                  Edit every profile field, connectors, avatar and your unique /u/&lt;username&gt; page.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate('/dashboard');
                }}
                className="px-3 py-1.5 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <MaterialIcon name="arrow_right" className="w-4 h-4" />
                <span>Open Dashboard</span>
              </button>
            </div>

            <div className="p-3 bg-white border border-carbon-20 text-xs text-carbon-60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-mono text-carbon-60">
                  <span className="font-semibold text-carbon-70">Account UID:</span> {user.uid}
                </div>
                <div className="text-xs text-carbon-60">
                  Provider: <span className="font-semibold text-carbon-70">{user.providerData[0]?.providerId || 'password'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="min-h-[44px] px-3.5 py-2 bg-white hover:bg-carbon-05 text-ap-link hover:text-ap-link font-bold border border-ap-primary text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0 touch-manipulation tap-target"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                )}
                <span>{isLoggingOut ? 'Signing Out...' : 'Log Out & Clear Local State'}</span>
              </button>
            </div>

            {user.email && (
              <div className="p-3 bg-white border border-carbon-20 text-xs text-carbon-60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-carbon-80 flex items-center gap-1.5">
                    <MaterialIcon name="key" className="w-4 h-4" />
                    <span>Password & Recovery</span>
                  </div>
                  <div className="text-xs text-carbon-60">
                    Need to update your password? Request a recovery link for {user.email}.
                  </div>
                </div>

                <button
                  id="user-profile-send-reset-btn"
                  type="button"
                  onClick={handleSendResetEmail}
                  disabled={isSendingReset}
                  className="px-3 py-1.5 bg-white hover:bg-carbon-05 text-carbon-80 font-semibold border border-carbon-20 text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isSendingReset ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Mail className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{isSendingReset ? 'Sending...' : 'Send Password Reset Email'}</span>
                </button>
              </div>
            )}
          </section>

          {/* Connected Accounts (social identity linking) */}
          <IdentityConnections />

          {/* Action Footer */}
          <div className="pt-3 border-t border-carbon-20 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="min-h-[44px] px-4 py-2 bg-white hover:bg-carbon-10 text-carbon-70 font-bold border border-carbon-20 text-xs cursor-pointer touch-manipulation tap-target inline-flex items-center justify-center"
              >
                Back to dashboard
              </button>
              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="min-h-[44px] px-3.5 py-2 bg-white hover:bg-carbon-05 text-ap-link font-bold border border-ap-primary text-xs cursor-pointer transition-colors disabled:opacity-50 touch-manipulation tap-target inline-flex items-center justify-center"
                  title="Sign out and clear local state"
                >
                  {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex min-h-[44px] items-center px-6 py-2 bg-primary hover:bg-primary-strong text-ap-action-fg font-semibold text-base disabled:opacity-50 cursor-pointer touch-manipulation"
            >
              {isSaving ? 'Saving to Firestore...' : 'Save Profile Changes'}
            </button>
          </div>

        </form>
      </div>
    </motion.div>
  );
};

export default UserProfilePage;
