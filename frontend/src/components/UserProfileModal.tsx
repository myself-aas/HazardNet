import MaterialIcon from "./MaterialIcon";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth, UserRolePersona } from '../context/AuthContext';
import { detectExactPinpointLocation, LocationDetectionResult, findNearestDistrict, isValidLatLng, isValidCoordinate } from '../services/geolocationService';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { getGranularDisasterData } from '../data/disasterDetails';
import { FirebaseRealtimeStatus } from './FirebaseRealtimeStatus';
import IdentityConnections from './IdentityConnections';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectDistrict?: (districtId: string) => void;
}

const PERSONA_LABELS: Record<UserRolePersona, { label: string; tag: string }> = {
  smallholder_farmer: { label: 'Rural Smallholder Farmer', tag: 'Micro-Farm & Local Advisory' },
  ngo_coordinator: { label: 'NGO Disaster Coordinator', tag: 'Humanitarian Relief & WASH' },
  govt_official: { label: 'DAE / Govt Extension Officer', tag: 'Regional Oversight & Policy' },
  academic_researcher: { label: 'Academic Climate Scientist', tag: 'Satellite Tensors & Metrics' },
  commercial_agribusiness: { label: 'Commercial Agro-Business', tag: 'Supply Chain & Logistics' },
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  onSelectDistrict,
}) => {
  const navigate = useNavigate();
  const { user, userProfile, updateUserProfile, signOut, sendPasswordResetEmail } = useAuth();

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
  }, [userProfile, user, isOpen]);

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
        if (onSelectDistrict) {
          onSelectDistrict(matchedDist.id);
        }
        navigate(`/?district=${matchedDist.id}`);
      }

      setSaveMessage('Profile settings and Home District saved successfully!');
      setTimeout(() => {
        setSaveMessage('');
        onClose();
      }, 1200);
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
      onClose();
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

  return (
    <AnimatePresence>
      {isOpen && user && (
        <motion.div
          key="user-profile-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            key="user-profile-modal"
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5 max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col text-slate-800"
            role="dialog"
            aria-modal="true"
            aria-label="User profile settings"
          >
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pb-3 sm:pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3 min-w-0">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#f9a825]/10 border border-[#f9a825]/20 text-[#d08305] font-black text-lg flex items-center justify-center shadow-xs shrink-0">
                {(displayName || 'U')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate max-w-[55vw] sm:max-w-none">{displayName || 'User Profile'}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                  {personaInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium truncate max-w-[60vw] sm:max-w-none">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[36px] px-3 py-1.5 text-xs font-black text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
            title="Close Profile Modal"
            aria-label="Close Profile Modal"
          >
            <MaterialIcon name="close" className="w-4 h-4" />
            <span>CLOSE</span>
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto space-y-4 pr-1">
          
          {saveMessage && (
            <div className={`p-3 rounded-xl text-xs font-bold border ${
              saveMessage.includes('updated') ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}>
              {saveMessage}
            </div>
          )}

          {/* Firebase Realtime Database Status Indicator */}
          <FirebaseRealtimeStatus variant="card" />

          {/* Persona Card Selector */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <label className="block text-xs font-extrabold text-slate-900">
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
                    className={`p-3 rounded-xl text-left border transition-all flex items-center gap-2.5 ${
                      isSelected
                        ? 'bg-amber-50 text-[#d08305] border-[#f9a825] shadow-xs font-bold'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">{item.label}</div>
                      <div className={`text-[10px] truncate ${isSelected ? 'text-[#d08305]' : 'text-slate-500'}`}>
                        {item.tag}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Use Current Location for District Setting Toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 transition-all">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${
                  autoDetectLocationEnabled ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-200 text-slate-600 border border-slate-300'
                }`}>
                  <MaterialIcon name="my_location" className="w-5 h-5 text-current" filled />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-extrabold text-slate-900">Use Current Location for District</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      autoDetectLocationEnabled ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-200 text-slate-700 border border-slate-300'
                    }`}>
                      {autoDetectLocationEnabled ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Automatically detect your geographic GPS / IP location on app launch and map to the nearest Bangladesh district.
                  </p>
                </div>
              </div>

              {/* Interactive Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={autoDetectLocationEnabled}
                onClick={() => handleToggleAutoDetect(!autoDetectLocationEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1 ${
                  autoDetectLocationEnabled ? 'bg-slate-900' : 'bg-slate-300'
                }`}
                title={autoDetectLocationEnabled ? 'Disable automatic location detection' : 'Enable automatic location detection'}
              >
                <span className="sr-only">Use Current Location for District</span>
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-amber-400 shadow-md ring-0 transition duration-200 ease-in-out ${
                    autoDetectLocationEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Pinpoint Geolocation Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-extrabold text-slate-900">IP & GPS Precise Pinpoint Coordinates</h4>
                <p className="text-[11px] text-slate-500">Auto-detect nearest Bangladesh district and exact lat/lng</p>
              </div>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={detectingLoc}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl border border-slate-900 transition-all shadow-xs disabled:opacity-50"
              >
                {detectingLoc ? 'Detecting...' : 'Pinpoint Location'}
              </button>
            </div>

            {locResult && (
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-xs space-y-2 animate-in fade-in shadow-xs">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>Method: {locResult.method.toUpperCase()}</span>
                  <span>Nearest: {locResult.nearestDistrict.name} ({locResult.distanceKm.toFixed(1)} km away)</span>
                </div>
                <div className="font-mono text-[11px] text-slate-600 flex items-center justify-between">
                  <span>Lat: {locResult.lat.toFixed(4)}, Lng: {locResult.lng.toFixed(4)}</span>
                  {locResult.accuracyMeters && <span>Accuracy: ±{Math.round(locResult.accuracyMeters)}m</span>}
                </div>
                {locResult.city && (
                  <div className="text-[10px] text-slate-500">
                    City/ISP: {locResult.city}, {locResult.country} ({locResult.isp || 'IP Geolocation'})
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onSelectDistrict) {
                        onSelectDistrict(locResult.nearestDistrict.id);
                      }
                      navigate(`/?district=${locResult.nearestDistrict.id}`);
                      onClose();
                    }}
                    className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white border border-slate-900 font-bold rounded-xl text-xs transition-colors shadow-xs"
                  >
                    Sync Map to {locResult.nearestDistrict.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetHomeDistrict(locResult.nearestDistrict.id)}
                    className="py-1.5 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" /><span>Set as Default Home District</span>
                  </button>
                </div>
              </div>
            )}

            {isValidCoordinate(pinpointLat) && isValidCoordinate(pinpointLng) && isValidLatLng(pinpointLat, pinpointLng) && !locResult && (
              <div className="text-xs text-slate-700 font-mono bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
                <span>Stored Coordinates: <strong>{pinpointLat.toFixed(4)}, {pinpointLng.toFixed(4)}</strong></span>
                <span className="text-[10px] text-slate-500 font-sans">Synced with Firestore</span>
              </div>
            )}
          </div>

          {/* Dedicated Default Home District Preference Card */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm"><MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" /></span>
                  <h4 className="text-xs font-extrabold text-slate-900">Default Home District Preference</h4>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  The application will automatically load and map this district on every visit.
                </p>
              </div>
              {homeDistrictId ? (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-200 text-amber-950 border border-amber-300 flex items-center gap-1">
                  <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" />
                  <span>{ALL_64_DISTRICTS.find(d => d.id === homeDistrictId)?.name || homeDistrictId}</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600">
                  Not configured
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-8">
                <select
                  value={homeDistrictId}
                  onChange={(e) => handleSetHomeDistrict(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Select Default Home District (64 Districts) --</option>
                  {ALL_64_DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} District ({d.division} Division)
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4">
                {homeDistrictId && (
                  <button
                    type="button"
                    onClick={() => {
                      setHomeDistrictId('');
                      try { localStorage.removeItem('hazardnet_home_district'); } catch { /* best-effort */ }
                    }}
                    className="w-full py-2 px-3 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Clear Home District
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* District-Based Hazard & Severity Identification Card */}
          {(() => {
            const currentDistrictObj = ALL_64_DISTRICTS.find(d => d.id === homeDistrictId) || ALL_64_DISTRICTS.find(d => d.id === 'dhaka') || ALL_64_DISTRICTS[0];
            const granular = currentDistrictObj ? getGranularDisasterData(currentDistrictObj.id) : null;
            const severityScorePct = currentDistrictObj ? Math.round(currentDistrictObj.severity * 100) : 75;

            return (
              <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-4 space-y-3 shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold text-sm"><MaterialIcon name="shield" className="w-4 h-4 inline-block mr-1" /></span>
                    <div>
                      <h4 className="text-xs font-extrabold text-white tracking-wide uppercase font-mono">
                        District Hazard & Severity Identification
                      </h4>
                      <p className="text-[10px] text-slate-400 font-sans">
                        Identified using user district ({currentDistrictObj.name}) instead of raw lat/lon coordinates
                      </p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black border ${
                    currentDistrictObj.risk === 'High' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                    currentDistrictObj.risk === 'Moderate' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                    'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}>
                    {currentDistrictObj.risk} Risk ({severityScorePct}% Severity)
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Selected District</span>
                    <strong className="text-amber-400 font-black truncate block mt-0.5">{currentDistrictObj.name} ({currentDistrictObj.division})</strong>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Primary Hazard</span>
                    <strong className="text-white font-black truncate block mt-0.5">{currentDistrictObj.hazardType}</strong>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Severity Score</span>
                    <strong className="text-rose-400 font-mono font-black block mt-0.5">{severityScorePct}%</strong>
                  </div>
                  <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60">
                    <span className="text-[10px] font-mono text-slate-400 block uppercase">Vulnerable Crop</span>
                    <strong className="text-emerald-400 font-black truncate block mt-0.5">{currentDistrictObj.mainCrop}</strong>
                  </div>
                </div>

                {granular?.modelAssessment?.softmaxProbabilities && (
                  <div className="pt-2 border-t border-slate-800 text-[11px] space-y-1.5">
                    <span className="text-[10px] font-mono text-slate-400 font-extrabold uppercase tracking-wider block">
                      Multi-Hazard Risk Distribution for {currentDistrictObj.name}:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {granular.modelAssessment.softmaxProbabilities.map((item: { hazard: string; probability: number }, idx: number) => (
                        <div key={idx} className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[10px] flex items-center gap-1.5 font-mono">
                          <span className="text-slate-300 font-bold">{item.hazard}:</span>
                          <span className="text-amber-400 font-black">{Math.round(item.probability * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="+880 1712-345678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Organization / Department</label>
              <input
                type="text"
                placeholder="e.g. DAE Rangpur / Self Farm"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Farm / Land Area (Hectares)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={farmSizeHectares}
                onChange={(e) => setFarmSizeHectares(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Primary Division</label>
              <input
                type="text"
                value={primaryDivision}
                onChange={(e) => setPrimaryDivision(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Primary District</label>
              <input
                type="text"
                value={primaryDistrict}
                onChange={(e) => setPrimaryDistrict(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Target Crops / Cultivations</label>
              <input
                type="text"
                placeholder="e.g. Boro Paddy, Aman Rice, Jute, Potato, Maize"
                value={targetCrops}
                onChange={(e) => setTargetCrops(e.target.value)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 font-medium focus:outline-none focus:border-[#f9a825]"
              />
            </div>
          </div>

          {/* Account Security & Session Management Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm"><MaterialIcon name="lock" className="w-4 h-4 inline-block mr-1" /></span>
                <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                  Account Security & Active Session
                </h4>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Authenticated
              </span>
            </div>

            <p className="text-[11px] text-slate-600 leading-relaxed">
              You are signed in as <strong className="text-slate-900">{user.email || user.displayName || 'User'}</strong>. Logging out terminates your sign-in session and clears local application caches and cached district preferences from this browser.
            </p>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <MaterialIcon name="grid_view" className="w-4 h-4" />
                  <span>Full User Dashboard</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Edit every profile field, connectors, avatar and your unique /u/&lt;username&gt; page.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/dashboard');
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <MaterialIcon name="arrow_right" className="w-4 h-4" />
                <span>Open Dashboard</span>
              </button>
            </div>

            <div className="p-3 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="font-mono text-slate-500">
                  <span className="font-semibold text-slate-700">Account UID:</span> {user.uid}
                </div>
                <div className="text-[10px] text-slate-500">
                  Provider: <span className="font-semibold text-slate-700">{user.providerData[0]?.providerId || 'password'}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 font-bold rounded-lg border border-rose-200 text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <span>{isLoggingOut ? 'refresh' : '🚪'}</span>
                <span>{isLoggingOut ? 'Signing Out...' : 'Log Out & Clear Local State'}</span>
              </button>
            </div>

            {user.email && (
              <div className="p-3 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <MaterialIcon name="key" className="w-4 h-4" />
                    <span>Password & Recovery</span>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Need to update your password? Request a recovery link for {user.email}.
                  </div>
                </div>

                <button
                  id="user-profile-send-reset-btn"
                  type="button"
                  onClick={handleSendResetEmail}
                  disabled={isSendingReset}
                  className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-lg border border-amber-200 text-xs shadow-2xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <span>{isSendingReset ? 'refresh' : 'mail'}</span>
                  <span>{isSendingReset ? 'Sending...' : 'Send Password Reset Email'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Connected Accounts (social identity linking) */}
          <IdentityConnections />

          {/* Action Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-200 text-xs shadow-xs cursor-pointer"
              >
                Cancel
              </button>
              {user && (
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 text-xs shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                  title="Sign out and clear local state"
                >
                  {isLoggingOut ? 'Signing Out...' : 'Sign Out'}
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-[#f9a825] hover:bg-[#d08305] text-slate-900 font-extrabold rounded-xl text-xs shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? 'Saving to Firestore...' : 'Save Profile Changes'}
            </button>
          </div>

        </form>

      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
);
};
