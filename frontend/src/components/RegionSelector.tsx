import MaterialIcon from "./MaterialIcon";
import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  ALL_64_DISTRICTS,
  ALL_8_DIVISIONS,
  DistrictData,
  DivisionData,
  getDistrictById
} from '../data/bangladeshDistricts';
import { detectExactPinpointLocation, LocationDetectionResult } from '../services/geolocationService';

interface RegionSelectorProps {
  selectedDistrictId: string;
  onSelectDistrict: (district: DistrictData) => void;
  onSelectDivision?: (division: DivisionData) => void;
  selectedDivisionId?: string;
  viewMode?: 'districts' | 'divisions';
  onViewModeChange?: (mode: 'districts' | 'divisions') => void;
}

export const RegionSelector: React.FC<RegionSelectorProps> = ({
  selectedDistrictId,
  onSelectDistrict,
  onSelectDivision,
  selectedDivisionId = 'rangpur',
  viewMode = 'districts',
  onViewModeChange,
}) => {
  const { userProfile, updateUserProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState<string>('All');
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<LocationDetectionResult | null>(null);

  const currentHomeDistrictId = userProfile?.homeDistrictId || localStorage.getItem('hazardnet_home_district');

  const handleSetCurrentAsHome = async (dist: DistrictData) => {
    try {
      await updateUserProfile({
        homeDistrictId: dist.id,
        homeDistrictName: dist.name,
        primaryDistrict: dist.name,
        primaryDivision: dist.division,
      });
      toast.success(`${dist.name} District set as your default Home District!`, { icon: <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" />, duration: 4000 });
    } catch (err) {
      toast.error('Failed to set Home District.');
    }
  };

  const handleLocateUserDistrict = async () => {
    setIsDetectingLocation(true);
    try {
      const result = await detectExactPinpointLocation();
      setDetectedLocation(result);
      if (result.nearestDistrict) {
        onSelectDistrict(result.nearestDistrict);
      }
    } catch (err) {
      console.warn('Failed to detect user location:', err);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const currentDistrict = useMemo(() => {
    return getDistrictById(selectedDistrictId) || ALL_64_DISTRICTS[0];
  }, [selectedDistrictId]);

  // Filtered districts based on search + division filter
  const filteredDistricts = useMemo(() => {
    return ALL_64_DISTRICTS.filter((d) => {
      const matchesDiv = selectedDivisionFilter === 'All' || d.division.toLowerCase() === selectedDivisionFilter.toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesDiv;

      const matchesQuery =
        d.name.toLowerCase().includes(q) ||
        d.division.toLowerCase().includes(q) ||
        d.hazardType.toLowerCase().includes(q) ||
        d.mainCrop.toLowerCase().includes(q);

      return matchesDiv && matchesQuery;
    });
  }, [searchQuery, selectedDivisionFilter]);

  // Filtered divisions
  const filteredDivisions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return ALL_8_DIVISIONS;
    return ALL_8_DIVISIONS.filter(
      (div) =>
        div.name.toLowerCase().includes(q) ||
        div.capital.toLowerCase().includes(q) ||
        div.primaryHazard.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Group districts by division for categorized select
  const districtsByDivision = useMemo(() => {
    const map: Record<string, DistrictData[]> = {};
    filteredDistricts.forEach((d) => {
      if (!map[d.division]) map[d.division] = [];
      map[d.division].push(d);
    });
    return map;
  }, [filteredDistricts]);

  return (
    <div className="bg-white border border-carbon-20 p-6 sm:p-8 rounded-[28px] shadow-xs space-y-6 transition-all duration-300 hover:border-carbon-30 text-carbon-90">
      
      {/* Top Header & Map Level Mode Selector (64 Districts vs 8 Divisions) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-carbon-20 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-nasa-red animate-pulse shadow-xs"></span>
            <h3 className="text-lg sm:text-xl font-extrabold text-carbon-90 tracking-tight">
              Spatial Region & Hazard Selector
            </h3>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 text-amber-900 border border-amber-200 shadow-xs">
              64 Districts • 8 Divisions
            </span>
          </div>
          <p className="text-xs sm:text-sm text-carbon-60">
            Select any district or division from Bangladesh to load its stored multi-hazard forecast
          </p>
        </div>

        {/* View Mode Toggle: 64 Districts vs 8 Divisions */}
        <div className="flex items-center gap-1.5 bg-carbon-10 p-1.5 rounded-full border border-carbon-20 self-start md:self-auto shrink-0">
          <button
            onClick={() => onViewModeChange && onViewModeChange('districts')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 min-h-[44px] ${
              viewMode === 'districts'
                ? 'bg-nasa-red text-carbon-90 shadow-xs scale-[1.02]'
                : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-20'
            }`}
          >
            <span>64 Districts</span>
          </button>
          <button
            onClick={() => onViewModeChange && onViewModeChange('divisions')}
            className={`px-4 py-2 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 flex items-center gap-2 min-h-[44px] ${
              viewMode === 'divisions'
                ? 'bg-nasa-red text-carbon-90 shadow-xs scale-[1.02]'
                : 'text-carbon-60 hover:text-carbon-90 hover:bg-carbon-20'
            }`}
          >
            <span>8 Divisions</span>
          </button>
        </div>
      </div>

      {/* Main Search Bar & Dropdown Select Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        
        {/* Search Input with Auto-complete Filter */}
        <div className="md:col-span-4 relative">
          <div className="relative flex items-center">
            <span className="absolute left-4 text-carbon-60 text-sm font-bold">Search</span>
            <input
              type="text"
              placeholder={
                viewMode === 'districts'
                  ? 'Search 64 districts...'
                  : 'Search 8 divisions...'
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-16 pr-10 py-3.5 bg-carbon-05 border border-carbon-20 focus:border-nasa-blue focus:bg-white focus:ring-2 focus:ring-nasa-blue/20 rounded-2xl text-carbon-90 text-sm font-medium placeholder-carbon-40 focus:outline-none transition-all shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3.5 text-carbon-60 hover:text-carbon-90 text-sm font-bold p-1 rounded-full hover:bg-carbon-20"
              >
                X
              </button>
            )}
          </div>
        </div>

        {/* Division Filter Dropdown (When in Districts Mode) */}
        {viewMode === 'districts' && (
          <div className="md:col-span-3">
            <select
              value={selectedDivisionFilter}
              onChange={(e) => setSelectedDivisionFilter(e.target.value)}
              className="w-full px-4 py-3.5 bg-carbon-05 border border-carbon-20 focus:border-nasa-blue focus:bg-white focus:ring-2 focus:ring-nasa-blue/20 rounded-2xl text-carbon-90 text-sm font-semibold focus:outline-none cursor-pointer shadow-xs"
            >
              <option value="All">All 8 Divisions</option>
              {ALL_8_DIVISIONS.map((div) => (
                <option key={div.id} value={div.capital}>
                  {div.name} ({div.districtCount})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Primary District / Division Dropdown Select */}
        <div className={viewMode === 'districts' ? 'md:col-span-3' : 'md:col-span-5'}>
          {viewMode === 'districts' ? (
            <select
              value={selectedDistrictId}
              onChange={(e) => {
                const selected = ALL_64_DISTRICTS.find((d) => d.id === e.target.value);
                if (selected) onSelectDistrict(selected);
              }}
              className="w-full px-4 py-3.5 bg-carbon-05 border border-carbon-20 text-carbon-90 font-bold rounded-2xl text-sm focus:outline-none cursor-pointer shadow-xs focus:ring-2 focus:ring-nasa-blue/20"
            >
              {Object.keys(districtsByDivision).map((divName) => (
                <optgroup key={divName} label={`--- ${divName} Division ---`} className="bg-carbon-10 text-carbon-60 font-mono">
                  {districtsByDivision[divName].map((d) => (
                    <option key={d.id} value={d.id} className="bg-white text-carbon-90 py-1 font-sans">
                      {d.name} ({d.hazardType}) - {(d.severity * 100).toFixed(0)}%
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            <select
              value={selectedDivisionId}
              onChange={(e) => {
                const div = ALL_8_DIVISIONS.find((d) => d.id === e.target.value);
                if (div && onSelectDivision) onSelectDivision(div);
                const capitalDistrict = ALL_64_DISTRICTS.find(
                  (d) => d.name.toLowerCase() === div?.capital.toLowerCase()
                );
                if (capitalDistrict) onSelectDistrict(capitalDistrict);
              }}
              className="w-full px-4 py-3.5 bg-carbon-05 border border-carbon-20 text-carbon-90 font-bold rounded-2xl text-sm focus:outline-none cursor-pointer shadow-xs"
            >
              {filteredDivisions.map((div) => (
                <option key={div.id} value={div.id} className="bg-white text-carbon-90 py-1">
                  {div.name} (Capital: {div.capital} • {div.districtCount})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Detect Location Button */}
        <div className="md:col-span-2">
          <button
            onClick={handleLocateUserDistrict}
            disabled={isDetectingLocation}
            className="w-full py-3.5 px-3 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-300 rounded-2xl text-carbon-90 font-extrabold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            title="Auto-detect my location & map to nearest district"
          >
            {isDetectingLocation ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-carbon-90 border-t-transparent rounded-full animate-spin"></span>
                <span>Locating...</span>
              </>
            ) : (
              <>
                <MaterialIcon name="my_location" className="w-4 h-4 text-carbon-90 shrink-0" filled />
                <span>Map My District</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Detected Location Status Banner (when available) */}
      {detectedLocation && (
        <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-sans">
          <div className="flex items-center gap-2 text-carbon-90 font-medium">
            <span className="p-1 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
              <MaterialIcon name="my_location" className="w-4 h-4 text-carbon-90 shrink-0" filled />
            </span>
            <span>
              Location detected via <strong className="uppercase font-mono">{detectedLocation.method}</strong>: Mapped to <strong className="font-bold text-carbon-black">{detectedLocation.nearestDistrict.name} District</strong> ({detectedLocation.nearestDistrict.division} Division)
            </span>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 font-mono text-[11px] text-carbon-60">
            <span>{detectedLocation.distanceKm < 1 ? 'Inside district center' : `~${detectedLocation.distanceKm.toFixed(1)} km away`}</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-900 font-bold">
              {detectedLocation.lat.toFixed(2)}°N, {detectedLocation.lng.toFixed(2)}°E
            </span>
          </div>
        </div>
      )}

      {/* Active Selected District / Division Info Summary Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-carbon-05 rounded-2xl border border-carbon-20 text-xs sm:text-sm font-mono shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-nasa-red shrink-0"></span>
          <span className="text-carbon-60 font-medium">Active Location:</span>
          <strong className="text-carbon-90 font-extrabold text-sm">{currentDistrict.name} District</strong>
          <span className="text-carbon-30 hidden sm:inline">•</span>
          <span className="text-carbon-60 font-semibold">{currentDistrict.division} Division</span>

          {currentHomeDistrictId === currentDistrict.id ? (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-200 text-amber-950 border border-amber-300 flex items-center gap-1 shadow-2xs">
              <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" />
              <span>Home District</span>
            </span>
          ) : (
            <button
              onClick={() => handleSetCurrentAsHome(currentDistrict)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
              title="Set as my default home district for future visits"
            >
              <MaterialIcon name="home" className="w-4 h-4 inline-block mr-1" /><span>Set as Home</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-carbon-60">Hazard:</span>
          <span className="text-carbon-80 font-bold">{currentDistrict.hazardType}</span>
          <span className="text-carbon-30 hidden sm:inline">•</span>
          <span className="text-carbon-60">Crop:</span>
          <span className="text-carbon-80 font-bold">{currentDistrict.mainCrop}</span>
          <span className={`px-3 py-1 rounded-full font-bold text-xs ${
            currentDistrict.severity >= 0.8
              ? 'bg-rose-100 text-rose-800 border border-rose-200'
              : currentDistrict.severity >= 0.5
              ? 'bg-amber-100 text-amber-800 border border-amber-200'
              : 'bg-carbon-20 text-carbon-80 border border-carbon-30'
          }`}>
            {(currentDistrict.severity * 100).toFixed(0)}% Severity
          </span>
        </div>
      </div>

      {/* Quick Division Jump Chips */}
      <div className="space-y-2 pt-1">
        <span className="text-carbon-60 font-mono text-xs uppercase font-bold tracking-wider block">
          Quick Division Filter:
        </span>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-hide">
          {ALL_8_DIVISIONS.map((div) => {
            const isSelected = currentDistrict.division.toLowerCase() === div.capital.toLowerCase();
            return (
              <button
                key={div.id}
                onClick={() => {
                  setSelectedDivisionFilter(div.capital);
                  // Also select capital district
                  const cap = ALL_64_DISTRICTS.find((d) => d.name.toLowerCase() === div.capital.toLowerCase());
                  if (cap) onSelectDistrict(cap);
                }}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 border min-h-[38px] ${
                  isSelected
                    ? 'bg-nasa-red text-carbon-90 border-nasa-blue shadow-xs scale-[1.02]'
                    : 'bg-carbon-05 text-carbon-70 border-carbon-20 hover:text-carbon-90 hover:bg-carbon-10'
                }`}
              >
                {div.name.replace(' Division', '')} ({div.districtCount})
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
};

export default RegionSelector;
