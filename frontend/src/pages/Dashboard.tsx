import MaterialIcon from '../components/MaterialIcon';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import Map from '../components/Map';
import StoredForecastPanel from '../components/StoredForecastPanel';
import { DataStateEmpty, DataStateError } from '../components/ui/DataState';
import { fetchStoredPrediction, type StoredPrediction } from '../lib/storedPrediction';
import { reasonFromError, type ForecastViewState } from '../lib/forecastView';
import AdvisoryPanel from '../components/AdvisoryPanel';
import OfflineBadge from '../components/OfflineBadge';
import RiskAnalytics from '../components/RiskAnalytics';
import ThirtyDayTrendChart from '../components/ThirtyDayTrendChart';
import RegionSelector from '../components/RegionSelector';
import DisasterDetailModal from '../components/DisasterDetailModal';
import NationalOverview from '../components/NationalOverview';
import { PdfExportButton } from '../components/PdfExportButton';
import { ALL_64_DISTRICTS, DistrictData, getDistrictById } from '../data/bangladeshDistricts';
import { useAuth } from '../context/AuthContext';
import { findNearestDistrict } from '../services/geolocationService';
import { AP_SPRING } from '../components/apple/motion';

type District = DistrictData;

const defaultDistricts: Record<string, District> = {
  kurigram: getDistrictById('kurigram')!,
  sunamganj: getDistrictById('sunamganj')!,
  sirajganj: getDistrictById('sirajganj')!,
  coxsbazar: getDistrictById('coxsbazar')!,
  satkhira: getDistrictById('satkhira')!,
  dhaka: getDistrictById('dhaka')!,
  rajshahi: getDistrictById('rajshahi')!,
};

interface DashboardProps {
  defaultTab?: 'gis' | 'analytics' | 'saved' | 'compare' | 'settings' | string;
  isFullScreen?: boolean;
}

/**
 * The console's own loading / empty / error / ready states for one district's stored forecast.
 *
 * `StoredForecastPanel` still owns loading and ready, but the two failure shapes are the page's,
 * because only the page knows the district it asked about and can offer the retry:
 *
 *   - empty  - the read answered "this district and horizon have no stored coverage" (HTTP 404,
 *              `StoredPredictionError.reason === 'uncovered'`). The console keeps the map and the
 *              district's static baseline on screen and says so, instead of showing a generic error;
 *   - error  - the read failed for a reason retrying can fix (offline / rate-limited / server /
 *              malformed payload). The retry control re-runs the same request.
 *
 * Before this, both shapes fell through `forecastViewStateFromLegacy`, which can only produce a
 * generic `server` error - the console could not tell "no coverage" from "the service is down"
 * (audit 2026-10-03 §9, the two `absent` Dashboard states).
 */
const DistrictForecastPanel: React.FC<{
  district: District;
  view: ForecastViewState;
  onRetry: () => void;
}> = ({ district, view, onRetry }) => {
  if (view.kind === 'uncovered') {
    return (
      <DataStateEmpty
        title={`No stored forecast for ${district.name} yet`}
        body="This district is in the console's coverage list but the published forecast archive holds no record for the requested horizon. The map, the district's static baseline and the advisory history remain available."
      />
    );
  }
  if (view.kind === 'error') {
    return (
      <DataStateError
        title={`The stored forecast for ${district.name} could not be read`}
        detail={view.reason}
        onRetry={onRetry}
        retryLabel="Try the forecast again"
      />
    );
  }
  return <StoredForecastPanel state={view} onRetry={onRetry} />;
};

const Dashboard: React.FC<DashboardProps> = ({ defaultTab = 'gis', isFullScreen = false }) => {
  const [searchParams] = useSearchParams();
  const { user, userProfile } = useAuth();
  const [activeView, setActiveView] = useState<'gis' | 'analytics' | 'saved' | 'compare' | 'settings'>(
    (defaultTab as any) || 'gis',
  );
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [loading, setLoading] = useState(false);
  const [storedForecast, setStoredForecast] = useState<StoredPrediction | null>(null);
  // The district-scoped read state the page renders (see `DistrictForecastPanel`).
  const [forecastView, setForecastView] = useState<ForecastViewState>({ kind: 'idle' });
  const requestSequence = useRef(0);
  const [severity, setSeverity] = useState<number>(0.78);

  // Provenance for the numbers above. `live` is set only when /api/predict
  // actually answered; the catch branch shows a static district baseline and
  // the UI must label it as such (UI-01/UX-12).
  const [predictionSource, setPredictionSource] = useState<'live' | 'baseline'>('baseline');
  const [liveSummary, setLiveSummary] = useState<{ hazard: string; confidence: number } | null>(null);

  // Offline storage management. Map tiles are deliberately NOT stored on device:
  // persisting OpenStreetMap tiles is exactly what the volunteer-run tile servers'
  // usage policy prohibits (osm.wiki/Tile_usage_policy). Only app-shell assets and
  // forecast responses may be cached; this panel lets users purge them.
  const [isClearingAllCache, setIsClearingAllCache] = useState(false);

  const handleClearAllCaches = async () => {
    setIsClearingAllCache(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        toast.success('All offline caches & pre-loaded assets cleared!', {
          icon: <MaterialIcon name="delete" className="w-4 h-4" />,
        });
      }
    } catch (err) {
      toast.error('Failed to purge caches.');
    } finally {
      setIsClearingAllCache(false);
    }
  };

  // Saved districts state & dynamic map height
  const [savedMapHeight, setSavedMapHeight] = useState<'compact' | 'standard' | 'tall' | 'dynamic'>('standard');
  const [savedDistricts, setSavedDistricts] = useState<District[]>(() => {
    try {
      // `shonchay_saved_districts` is the pre-rename brand key. Read it once so nobody loses the
      // districts they saved, then stop writing it: a legacy product name must not travel into
      // the native app, whose storage layer mirrors these keys (audit backlog item 18).
      const local =
        localStorage.getItem('hazardnet.savedDistricts') ?? localStorage.getItem('shonchay_saved_districts');
      if (local) return JSON.parse(local);
    } catch {
      // location lookup is optional — silently skip on failure
    }
    return [
      ALL_64_DISTRICTS.find((d) => d.id === 'kurigram') || ALL_64_DISTRICTS[0],
      ALL_64_DISTRICTS.find((d) => d.id === 'sunamganj') || ALL_64_DISTRICTS[1],
      ALL_64_DISTRICTS.find((d) => d.id === 'sylhet') || ALL_64_DISTRICTS[2],
      ALL_64_DISTRICTS.find((d) => d.id === 'sirajganj') || ALL_64_DISTRICTS[3],
      ALL_64_DISTRICTS.find((d) => d.id === 'rangpur') || ALL_64_DISTRICTS[4],
      ALL_64_DISTRICTS.find((d) => d.id === 'coxsbazar') || ALL_64_DISTRICTS[5],
    ];
  });

  const toggleSaveDistrict = (dist: District) => {
    setSavedDistricts((prev) => {
      const exists = prev.some((d) => d.id === dist.id);
      let updated: District[];
      if (exists) {
        updated = prev.filter((d) => d.id !== dist.id);
      } else {
        updated = [dist, ...prev];
      }
      try {
        localStorage.setItem('hazardnet.savedDistricts', JSON.stringify(updated));
      } catch {
        // storage write is best-effort — skip on quota/private mode
      }
      return updated;
    });
  };

  useEffect(() => {
    if (defaultTab) {
      setActiveView(defaultTab as any);
    }
  }, [defaultTab]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['gis', 'analytics', 'saved', 'compare', 'settings'].includes(tabParam)) {
      setActiveView(tabParam as any);
    }
  }, [searchParams]);

  // Slide-over AI Advisory Drawer state for FullScreen Earth view
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Granular Disaster Modal State
  const [isDisasterModalOpen, setIsDisasterModalOpen] = useState(false);
  const [modalDistrictId, setModalDistrictId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleOpenDisasterModal = (districtId: string) => {
    if (!districtId) return;
    navigate(`/forecast/district/${districtId}`);
  };

  // Synchronize URL search parameters with dashboard map & home district default
  useEffect(() => {
    const districtId = searchParams.get('district');
    const openReport = searchParams.get('report') === 'true';

    if (districtId) {
      const dist = getDistrictById(districtId);
      if (dist) {
        setSelectedDistrict(dist);
        setActiveView('gis');
        if (openReport) {
          setModalDistrictId(dist.id);
          setIsDisasterModalOpen(true);
        }
      }
    } else {
      // Default to user's saved Home District if configured in userProfile or localStorage
      const homeDistId = userProfile?.homeDistrictId || localStorage.getItem('hazardnet_home_district');
      if (homeDistId) {
        const homeDist = getDistrictById(homeDistId);
        if (homeDist) {
          setSelectedDistrict(homeDist);
          return;
        }
      }
      // Default UI: National Overview & Predictive AI Risk Analysis Mode
      setSelectedDistrict(null);
    }
  }, [searchParams, userProfile]);

  useEffect(() => {
    if (defaultTab === 'analytics' || defaultTab === 'gis') {
      setActiveView(defaultTab);
    }
  }, [defaultTab]);

  const runPrediction = useCallback(async (dist: District) => {
    const sequence = ++requestSequence.current;
    const selection = { districtId: dist.id, horizon: '7_days' as const };
    setLoading(true);
    setStoredForecast(null);
    setLiveSummary(null);
    setPredictionSource('baseline');
    setForecastView({ kind: 'loading', selection });
    try {
      const data = await fetchStoredPrediction(dist.id);
      if (sequence !== requestSequence.current) return;
      setStoredForecast(data);
      setSeverity(data.prediction.severity_score);
      setLiveSummary({ hazard: data.prediction.hazard, confidence: data.prediction.confidence });
      setPredictionSource('live');
      setForecastView({ kind: 'ready', selection, data, refreshing: false });
    } catch (error) {
      if (sequence !== requestSequence.current) return;
      console.warn('[HazardNet] stored forecast unavailable', error);
      setSeverity(dist.severity);
      const reason = reasonFromError(error);
      // A district with no stored coverage is an empty state; everything else is retryable.
      setForecastView(reason === 'uncovered' ? { kind: 'uncovered', selection } : { kind: 'error', selection, reason });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDistrict) runPrediction(selectedDistrict);
  }, [selectedDistrict, runPrediction]);

  useEffect(() => {
    const handleAction = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { type, payload } = customEvent.detail || {};
      if (type === 'TOGGLE_AI_DRAWER') {
        setIsDrawerOpen((prev) => !prev);
      } else if (type === 'EXPORT_CSV') {
        downloadReport();
      } else if (type === 'RE_ANALYZE') {
        if (selectedDistrict) runPrediction(selectedDistrict);
      } else if (type === 'SELECT_DISTRICT' && payload) {
        const found = ALL_64_DISTRICTS.find((d) => d.id === payload);
        if (found) setSelectedDistrict(found as District);
      }
    };
    window.addEventListener('hazardnet:action', handleAction);
    return () => window.removeEventListener('hazardnet:action', handleAction);
  }, [selectedDistrict, runPrediction]);

  const downloadReport = () => {
    if (!selectedDistrict) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Region,Latitude,Longitude,Risk,Main Crop,Severity Score,Source\n' +
      `${selectedDistrict.name},${selectedDistrict.lat},${selectedDistrict.lng},${selectedDistrict.risk},${selectedDistrict.mainCrop},${(severity * 100).toFixed(0)}%,${predictionSource === 'live' ? 'Stored forecast' : 'Static baseline (stored forecast unavailable)'}`;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `hazard_report_${selectedDistrict.name.toLowerCase()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dedicated Full-Page Google Earth View Mode
  if (isFullScreen && activeView === 'gis') {
    return (
      <div className="relative isolate flex h-full min-h-0 w-full flex-col overflow-hidden bg-carbon-05 font-mono text-carbon-90">
        <h1 className="sr-only">Live map: multi-hazard situational awareness</h1>

        {/* Reference-inspired operational header: compact, legible, and always available above the map.
            The clearance is `--navbar-height`, which carries the safe-area inset the navbar itself
            applies - the hard-coded `pt-16` (64px) was 39px short on a notched phone, so this
            header's status pill sat under the bar. From `sm` up the navbar only overlays the top
            of the stage on the home console, so the padding returns to the tighter value. */}
        {/* 2026-10-05 restyle: the stage title floats on the map as plain text,
            the way the reference apps float "Destination Ahead" — bold ink with
            a soft legibility shadow, no bounding card between it and the map. */}
        {/* Soft scrim behind the title block: fades map markers out of the header band
            without a card. Pointer-events none, so markers under it stay clickable. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-[var(--ap-z-sticky)] h-[calc(var(--navbar-height)+8.5rem)] bg-gradient-to-b from-surface-page/90 via-surface-page/50 to-transparent"
        />
        <header className="pointer-events-none absolute inset-x-0 top-0 z-[var(--ap-z-sticky)] flex items-start justify-between gap-3 px-3 pb-3 sm:px-5 sm:pb-5 pt-[calc(var(--navbar-height)+12px)] sm:pt-[calc(var(--navbar-height)+12px)]">
          <div className="pointer-events-auto min-w-0 [text-shadow:0_1px_2px_rgba(255,255,255,0.7),0_0_8px_rgba(255,255,255,0.5)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_0_8px_rgba(0,0,0,0.6)]">
            <p className="truncate font-sans text-xs font-bold uppercase leading-tight tracking-[0.12em] text-carbon-50">
              HazardNet / live
            </p>
            <p className="truncate font-sans text-xs font-semibold leading-tight tracking-tight text-carbon-90 dark:text-white">
              National situational map
            </p>
          </div>
          <div className="pointer-events-auto hidden items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-carbon-50 [text-shadow:0_1px_2px_rgba(255,255,255,0.7),0_0_8px_rgba(255,255,255,0.5)] dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_0_8px_rgba(0,0,0,0.6)] sm:flex">
            {predictionSource === 'live' ? 'Forecast synced' : 'Baseline coverage'}
          </div>
        </header>

        <div className="live-stage relative min-h-0 flex-1 overflow-hidden">
          <Map
            selectedDistrictId={selectedDistrict?.id}
            onOpenDisasterModal={handleOpenDisasterModal}
            onOpenAdvisory={() => setIsDrawerOpen(true)}
            pinpointLat={userProfile?.pinpointLat}
            pinpointLng={userProfile?.pinpointLng}
            isFullScreen={true}
            onSelectDistrict={(dist) => {
              if (!dist) {
                setSelectedDistrict(null);
                return;
              }
              const fullDistrict = ALL_64_DISTRICTS.find((d) => d.id === dist.id) || dist;
              setSelectedDistrict(fullDistrict as District);
            }}
          />

          {/*
            The selected-district bottom sheet used to live here. It duplicated the
            pinned forecast card (district, risk, hazard, crop, close/deselect) and,
            because it was painted on top of it, swallowed the card's primary action:
"View Detailed Disaster Analytics" was unclickable at the 1280x720 desktop
            height and on phones, where the card sits in flow at the bottom of the
            stage. The card is now the single selected-district surface; its
"Open district intelligence" action opens the AI advisory drawer, which
            this sheet used to be the only trigger for.
          */}

          {/* Slide-Over AI Prediction & Advisory Drawer */}
          <AnimatePresence>
            {isDrawerOpen && selectedDistrict && (
              <motion.div
                key="ai-advisory-drawer"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={AP_SPRING}
                className="absolute top-[calc(var(--navbar-height)+8px)] right-4 left-4 lg:left-auto bottom-4 lg:w-[360px] z-[var(--ap-z-modal)] bg-white border border-carbon-20 rounded-2xl shadow-lg p-4 overflow-y-auto flex flex-col gap-4 text-carbon-90 custom-scrollbar"
              >
                {/* Drawer Header */}
                <div className="flex items-center justify-between pb-4 border-b border-carbon-20">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider px-2 py-0.5 bg-carbon-10 text-carbon-70 border border-carbon-20 rounded">
                        AI
                      </span>
                      <h3 className="font-extrabold text-lg text-carbon-90">AI Advisory & Model Metrics</h3>
                    </div>
                    <p className="text-xs text-carbon-60 font-mono">
                      {selectedDistrict.name} District • {selectedDistrict.division} Division
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(false)}
                    className="tap-target w-11 h-11 rounded-control bg-carbon-05 hover:bg-carbon-10 text-carbon-70 border border-carbon-20 flex items-center justify-center touch-manipulation"
                    title="Close drawer"
                    aria-label="Close advisory drawer"
                  >
                    <MaterialIcon name="close" className="w-5 h-5" />
                  </button>
                </div>

                {/* Prediction Panel */}
                <DistrictForecastPanel
                  district={selectedDistrict}
                  view={forecastView}
                  onRetry={() => runPrediction(selectedDistrict)}
                />

                {/* Advisory Panel */}
                {storedForecast && (
                  <AdvisoryPanel
                    districtName={selectedDistrict.name}
                    hazardType={storedForecast.prediction.hazard}
                    severityScore={severity}
                    confidence={storedForecast.prediction.confidence}
                  />
                )}

                {/* 30-Day Severity Trend Chart */}
                <ThirtyDayTrendChart districtName={selectedDistrict.name} districtId={selectedDistrict.id} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Disaster Detail Modal */}
        <DisasterDetailModal
          districtId={modalDistrictId}
          isOpen={isDisasterModalOpen}
          onClose={() => setIsDisasterModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={
        isFullScreen
          ? 'w-full h-full min-h-dvh overflow-y-auto px-3 sm:px-6 lg:px-8 pt-20 sm:pt-24 custom-scrollbar bg-carbon-05 relative z-10'
          : 'w-full'
      }
    >
      <div id="dashboard-content" className="max-w-[1600px] mx-auto space-y-8 sm:space-y-10 md:space-y-12 pb-12">
        {/* Top Header Card — Modernized Mobile-First Design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.45 }}
          className="bg-transparent border-0 rounded-lg sm:rounded-xl md:rounded-xl p-4 sm:p-6 md:p-8 lg:p-10 shadow-none flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 md:gap-8"
        >
          <div className="space-y-2.5 sm:space-y-3 md:space-y-4 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="px-2.5 sm:px-3.5 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider bg-ap-primary/10 text-ap-link border border-ap-primary/20 flex items-center gap-1.5 shrink-0">
                <span className="hidden xs:inline">Live GIS</span>
                <span className="xs:hidden">GIS</span>
              </span>
              <span className="text-carbon-30 hidden sm:inline shrink-0">•</span>
              <span className="text-xs sm:text-sm font-mono text-carbon-60 line-clamp-1">
                <code className="text-carbon-90 font-bold bg-carbon-10 px-1.5 sm:px-2 py-0.5 border border-carbon-20 rounded">
                  FP32
                </code>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-black text-carbon-90 tracking-tight leading-tight">
              Multi-Hazard AI Classification
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-carbon-60 max-w-4xl leading-relaxed line-clamp-2 sm:line-clamp-none">
              Published district forecasts for agricultural decision support across Bangladesh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-3 shrink-0 pt-3 sm:pt-4 lg:pt-0 border-t lg:border-t-0 border-carbon-20 w-full lg:w-auto justify-start sm:justify-end">
            <OfflineBadge />
            <button
              onClick={() => setActiveView('settings')}
              className={`px-2 sm:px-3 md:px-4 py-2 sm:py-2.5 md:py-3 rounded-md sm:rounded-lg border text-xs font-extrabold transition-all duration-200 flex items-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-[44px] md:min-h-[48px] cursor-pointer ${
                activeView === 'settings'
                  ? 'bg-carbon-90 text-ap-on-inverse border-carbon-90 ring-2 ring-carbon-90/30'
                  : 'bg-carbon-10 hover:bg-carbon-20 text-carbon-80 border-carbon-20 hover:scale-[1.02]'
              }`}
              title="Settings"
            >
              <MaterialIcon name="settings" className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Settings</span>
            </button>

            <PdfExportButton
              elementId="dashboard-content"
              filename={`HazardNet_MultiHazard_AI_Report_{region}_{date}.pdf`}
              filenameTemplate="HazardNet_{docType}_{region}_{date}.pdf"
              title="Export PDF"
              documentType="Multi-Hazard AI Intelligence Report"
              regionName={selectedDistrict?.name || 'National'}
              districtName={selectedDistrict?.name || 'National'}
              hazardType={selectedDistrict?.hazardType || 'Multi-Hazard'}
              filenameContext={{
                region: selectedDistrict?.name || 'National',
                district: selectedDistrict?.name || 'National',
                division: selectedDistrict?.division || 'Bangladesh',
                hazard: selectedDistrict?.hazardType || 'Multi_Hazard_Risk',
                hazardType: selectedDistrict?.hazardType || 'Multi_Hazard_Risk',
                docType: 'AI_Intelligence_Report',
                documentType: 'Multi-Hazard AI Intelligence Report',
              }}
              className="h-[40px] sm:h-[44px] md:h-[48px] items-stretch rounded-md sm:rounded-lg overflow-hidden"
            />

            <button
              onClick={downloadReport}
              className="px-2 sm:px-3.5 md:px-5 py-2 sm:py-2.5 md:py-3 bg-carbon-10 hover:bg-carbon-20 border border-carbon-20 text-carbon-80 font-bold text-xs sm:text-sm rounded-md sm:rounded-lg transition-all duration-200 flex items-center gap-1.5 active:scale-98 hover:scale-[1.02] min-h-[40px] sm:min-h-[44px] md:min-h-[48px] cursor-pointer"
              title="Download CSV"
            >
              <MaterialIcon name="download" className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">CSV</span>
            </button>

            <button
              onClick={() => {
                if (selectedDistrict) runPrediction(selectedDistrict);
              }}
              disabled={loading}
              className="px-3 sm:px-5 md:px-6 py-2 sm:py-2.5 md:py-3 bg-primary hover:bg-primary-strong text-ap-action-fg font-black text-xs sm:text-sm rounded-md sm:rounded-lg transition-all duration-200 flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 active:scale-98 hover:scale-[1.02] min-h-[40px] sm:min-h-[44px] md:min-h-[48px] cursor-pointer touch-manipulation tap-target shrink-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-ap-action-fg" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span className="hidden sm:inline">Processing...</span>
                  <span className="sm:hidden">Run</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">Re-Analyze Spectrum</span>
                  <span className="sm:hidden">Analyze</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Control Switcher — Modernized Tab Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="bg-white border-b border-carbon-20 flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-none touch-scroll px-2 sm:px-4 py-0"
          role="tablist"
          aria-label="Console views"
        >
          {[
            { id: 'gis' as const, icon: 'satellite_alt', label: 'Map' },
            { id: 'saved' as const, icon: 'push_pin', label: `Saved (${savedDistricts.length})` },
            { id: 'analytics' as const, icon: 'analytics', label: 'Analytics' },
            { id: 'compare' as const, icon: 'balance', label: 'Compare' },
            { id: 'settings' as const, icon: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeView === tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`min-h-12 sm:h-13 px-3 sm:px-5 text-xs sm:text-sm md:text-base font-bold flex items-center justify-center gap-1.5 sm:gap-2 touch-manipulation whitespace-nowrap transition-all duration-200 rounded-t-md relative ${
                activeView === tab.id
                  ? 'text-ap-link bg-gradient-to-b from-ap-primary/5 to-transparent'
                  : 'text-carbon-60 hover:text-carbon-80 hover:bg-carbon-05'
              }`}
            >
              <MaterialIcon name={tab.icon} className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span className="font-semibold tracking-tight">{tab.label}</span>
              {/* Active-tab marker: a 2px bar drawn inside the button rather than a
                thick bottom border paired with a corner radius. The border variant
                is the border-accent-on-rounded anti-pattern (an accent border
                clashing with the radius); the bar keeps the same 2px weight. */}
              {activeView === tab.id && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          ))}
        </motion.div>

        {/* VIEW 1: NASA+ ANALYTICS */}
        {activeView === 'analytics' && (
          <RiskAnalytics
            onSelectDistrict={(dist) => {
              if (!dist) {
                setSelectedDistrict(null);
                return;
              }
              const fullDistrict = getDistrictById(dist.id) || ALL_64_DISTRICTS[0];
              setSelectedDistrict(fullDistrict);
              setActiveView('gis');
            }}
          />
        )}

        {/* VIEW 2: SAVED DISTRICTS PAGE WITH FULL-SCALE LIVEMAPVIEW PREVIEW */}
        {activeView === 'saved' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Saved Districts Page Banner Header — Modernized */}
            <div className="bg-carbon-90 rounded-lg sm:rounded-xl md:rounded-xl p-4 sm:p-6 md:p-8 text-carbon-05 border border-carbon-80 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 relative overflow-hidden">
              <div className="space-y-2 sm:space-y-3 relative z-10 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <span className="px-2.5 sm:px-3 py-1 rounded-md sm:rounded-full text-xs font-mono font-black uppercase tracking-wider bg-primary text-ap-action-fg whitespace-nowrap">
                    Cloud Sync
                  </span>
                  <span className="text-xs font-mono text-carbon-30">{savedDistricts.length} Pinned</span>
                </div>
                <h2 className="text-lg sm:text-2xl md:text-3xl font-black text-ap-on-inverse tracking-tight leading-tight">
                  Saved Districts & Map
                </h2>
                <p className="text-xs sm:text-sm text-carbon-30 leading-relaxed font-normal line-clamp-2">
                  GIS map focused on your saved agricultural districts. Select locations to inspect multi-hazard
                  boundaries.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:gap-3 relative z-10 w-full md:w-auto justify-start md:justify-end">
                {selectedDistrict && (
                  <button
                    onClick={() => toggleSaveDistrict(selectedDistrict)}
                    className={`px-5 py-3 text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
                      savedDistricts.some((d) => d.id === selectedDistrict.id)
                        ? 'bg-rose-600 hover:bg-rose-700 text-ap-on-sev'
                        : 'bg-primary hover:bg-primary-strong text-ap-action-fg'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <MaterialIcon name="push_pin" className="w-4 h-4 inline-block mr-1" />
                      {savedDistricts.some((d) => d.id === selectedDistrict.id)
                        ? 'Unpin Selected District'
                        : 'Pin Selected District'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Grid Layout: Left Column = Saved Drawer, Right Column = Full Scale Interactive LiveMapView Stage */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
              {/* Left Column: Saved Districts Drawer List */}
              <div className="lg:col-span-4 space-y-3 sm:space-y-4">
                <div className="ap-card space-y-3.5 sm:space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm sm:text-base font-black text-carbon-90 flex items-center gap-1.5 sm:gap-2">
                      <MaterialIcon name="push_pin" className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                      <span>Saved ({savedDistricts.length})</span>
                    </h3>
                    <button
                      onClick={() => setActiveView('gis')}
                      className="text-xs font-extrabold text-amber-700 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      + Add
                    </button>
                  </div>

                  <div className="space-y-2 sm:space-y-2.5 max-h-[420px] sm:max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
                    {savedDistricts.map((dist) => {
                      const isSelected = selectedDistrict?.id === dist.id;
                      return (
                        <div
                          key={dist.id}
                          onClick={() => setSelectedDistrict(dist)}
                          className={`p-3 sm:p-4 border rounded-lg transition-all cursor-pointer flex flex-col gap-2 relative ${
                            isSelected
                              ? 'bg-amber-50/80 border-ap-primary ring-2 ring-ap-primary/30'
                              : 'bg-carbon-05/60 border-carbon-20 hover:bg-carbon-10/80 hover:border-carbon-20'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs sm:text-sm font-black text-carbon-90 flex items-center gap-1.5 truncate">
                                <span className="truncate">{dist.name}</span>
                              </h4>
                              <p className="text-xs text-carbon-60 font-medium mt-0.5">
                                <span className="font-bold text-carbon-70">{dist.division}</span>
                              </p>
                            </div>
                            <span
                              className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-bold border whitespace-nowrap shrink-0 ${
                                dist.risk === 'High'
                                  ? 'bg-carbon-10 text-ap-link border-carbon-20'
                                  : dist.risk === 'Moderate'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-carbon-10 text-carbon-80 border-carbon-20'
                              }`}
                            >
                              {dist.risk}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs font-mono text-carbon-60 pt-1.5 sm:pt-2 border-t border-carbon-20/60 gap-2">
                            <span className="truncate">{dist.mainCrop}</span>
                            <span
                              className={`font-bold flex items-center gap-1 whitespace-nowrap ${isSelected ? 'text-amber-700' : 'text-carbon-60'}`}
                            >
                              {isSelected ? (
                                <>
                                  <MaterialIcon name="my_location" className="w-3.5 h-3.5 shrink-0" /> Centered
                                </>
                              ) : (
                                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Full Scale Interactive LiveMapView Stage */}
              <div className="lg:col-span-8 space-y-3 sm:space-y-4">
                <div className="ap-card space-y-3 sm:space-y-4">
                  <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2 px-1 sm:px-3 text-xs">
                    <div className="flex items-center gap-1.5 sm:gap-2 font-extrabold text-carbon-80 min-w-0">
                      <span className="truncate">GIS Map</span>
                      <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-1.5 sm:px-2 py-0.5 rounded hidden lg:inline truncate">
                        {selectedDistrict ? `${selectedDistrict.name}` : 'Active'}
                      </span>
                    </div>

                    {/* Dynamic Height Control Selector */}
                    <div className="flex items-center gap-0.5 sm:gap-1 bg-carbon-10 p-1 border border-carbon-20 rounded-full shrink-0 overflow-x-auto">
                      <span className="text-xs font-mono font-bold text-carbon-60 px-1.5 hidden md:inline">
                        HEIGHT:
                      </span>
                      <button
                        onClick={() => setSavedMapHeight('compact')}
                        className={`px-2.5 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                          savedMapHeight === 'compact'
                            ? 'bg-carbon-90 text-ap-on-inverse '
                            : 'text-carbon-60 hover:text-carbon-90 hover:bg-white/60'
                        }`}
                        title="Set map stage height to Compact (500px)"
                      >
                        <MaterialIcon name="smartphone" className="w-4 h-4 inline-block mr-1" /> 500px
                      </button>
                      <button
                        onClick={() => setSavedMapHeight('standard')}
                        className={`px-2.5 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                          savedMapHeight === 'standard'
                            ? 'bg-carbon-90 text-ap-on-inverse '
                            : 'text-carbon-60 hover:text-carbon-90 hover:bg-white/60'
                        }`}
                        title="Set map stage height to Standard (680px)"
                      >
                        <MaterialIcon name="desktop_windows" className="w-4 h-4 inline-block mr-1" /> 680px
                      </button>
                      <button
                        onClick={() => setSavedMapHeight('tall')}
                        className={`px-2.5 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                          savedMapHeight === 'tall'
                            ? 'bg-carbon-90 text-ap-on-inverse '
                            : 'text-carbon-60 hover:text-carbon-90 hover:bg-white/60'
                        }`}
                        title="Set map stage height to Ultra Tall (850px)"
                      >
                        <MaterialIcon name="straighten" className="w-4 h-4 inline-block mr-1" /> 850px
                      </button>
                      <button
                        onClick={() => setSavedMapHeight('dynamic')}
                        className={`px-2.5 py-1 rounded-full text-xs font-black transition-all cursor-pointer ${
                          savedMapHeight === 'dynamic'
                            ? 'bg-primary text-ap-action-fg '
                            : 'text-carbon-60 hover:text-carbon-90 hover:bg-white/60'
                        }`}
                        title="Auto Dynamic Screen Fit Height"
                      >
                        <MaterialIcon name="bolt" className="w-4 h-4 inline-block mr-1" /> Dynamic
                      </button>
                    </div>
                  </div>

                  {/* Map Container Stage with Dynamic Height */}
                  <div
                    className={`w-full rounded-xl overflow-hidden border border-carbon-20 relative bg-carbon-90 transition-all duration-300 ${
                      savedMapHeight === 'compact'
                        ? 'h-[500px]'
                        : savedMapHeight === 'standard'
                          ? 'h-[680px]'
                          : savedMapHeight === 'tall'
                            ? 'h-[850px]'
                            : 'h-[calc(100dvh-220px)] min-h-[550px] max-h-[900px]'
                    }`}
                  >
                    <Map
                      selectedDistrictId={selectedDistrict?.id || savedDistricts[0]?.id}
                      compactHeader={true}
                      customHeight={
                        savedMapHeight === 'compact'
                          ? 'h-[500px]'
                          : savedMapHeight === 'standard'
                            ? 'h-[680px]'
                            : savedMapHeight === 'tall'
                              ? 'h-[850px]'
                              : 'h-[calc(100dvh-220px)] min-h-[550px] max-h-[900px]'
                      }
                      onOpenDisasterModal={handleOpenDisasterModal}
                      pinpointLat={userProfile?.pinpointLat}
                      pinpointLng={userProfile?.pinpointLng}
                      onSelectDistrict={(dist) => {
                        if (!dist) {
                          setSelectedDistrict(null);
                          return;
                        }
                        const fullDistrict = ALL_64_DISTRICTS.find((d) => d.id === dist.id) || dist;
                        setSelectedDistrict(fullDistrict as District);
                      }}
                    />
                  </div>
                </div>

                {/* Selected District Telemetry Details Card */}
                {selectedDistrict && (
                  <div className="ap-card space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="text-xl font-black text-carbon-90">
                            {selectedDistrict.name} District Telemetry
                          </h3>
                          <span className="px-3 py-0.5 rounded-full text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                            {selectedDistrict.hazardType} Target Zone
                          </span>
                        </div>
                        <p className="text-xs text-carbon-60 mt-1">
                          {predictionSource === 'live' && liveSummary ? (
                            <>
                              Stored forecast as of {storedForecast?.provenance.prediction_date ?? 'date not recorded'}:{' '}
                              <strong className="text-carbon-80">
                                {liveSummary.hazard} · {(liveSummary.confidence * 100).toFixed(1)}% top-class score
                              </strong>
                            </>
                          ) : (
                            <>
                              Static baseline band: <strong className="text-carbon-80">{selectedDistrict.risk}</strong>:
                              stored forecast unavailable, showing the district's climatological prior (not a model
                              output)
                            </>
                          )}
                        </p>
                      </div>

                      <button
                        onClick={() => selectedDistrict?.id && handleOpenDisasterModal(selectedDistrict.id)}
                        className="px-5 py-2.5 bg-primary hover:bg-primary-strong text-ap-action-fg font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>Granular Report & Directives</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div className="rounded-xl p-3 bg-carbon-05 border border-carbon-20/80">
                        <span className="text-xs text-carbon-60 font-mono uppercase font-bold block">Division</span>
                        <strong className="text-sm font-black text-carbon-80">{selectedDistrict.division}</strong>
                      </div>
                      <div className="rounded-xl p-3 bg-carbon-05 border border-carbon-20/80">
                        <span className="text-xs text-carbon-60 font-mono uppercase font-bold block">Primary Crop</span>
                        <strong className="text-sm font-black text-carbon-80">{selectedDistrict.mainCrop}</strong>
                      </div>
                      <div className="rounded-xl p-3 bg-carbon-05 border border-carbon-20/80">
                        <span className="text-xs text-carbon-60 font-mono uppercase font-bold block">Coordinates</span>
                        <strong className="text-xs font-mono font-black text-carbon-80">
                          {selectedDistrict.lat}°N, {selectedDistrict.lng}°E
                        </strong>
                      </div>
                      <div className="rounded-xl p-3 bg-carbon-05 border border-carbon-20/80">
                        <span className="text-xs text-carbon-60 font-mono uppercase font-bold block">
                          Primary Hazard
                        </span>
                        <strong className="text-sm font-black text-amber-700">{selectedDistrict.hazardType}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: MULTI-DISTRICT COMPARISON */}
        {activeView === 'compare' && (
          <div className="space-y-6">
            <div className="ap-card space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-carbon-90">Multi-District Agricultural Hazard Comparison</h2>
                  <p className="text-xs text-carbon-60 mt-1">
                    Side-by-side assessment of neural risk scores, crop vulnerability, and primary climate hazards
                    across Bangladesh.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {savedDistricts.slice(0, 3).map((dist) => (
                  <div key={dist.id} className="p-5 bg-carbon-05 border border-carbon-20 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-black text-carbon-90">{dist.name}</h3>
                      <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800">
                        {dist.risk} Risk
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-carbon-60">Division:</span>
                        <span className="font-bold text-carbon-80">{dist.division}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-carbon-60">Main Crop:</span>
                        <span className="font-bold text-carbon-80">{dist.mainCrop}</span>
                      </div>
                      <div className="flex justify-between border-b pb-1">
                        <span className="text-carbon-60">Primary Hazard:</span>
                        <span className="font-bold text-amber-700">{dist.hazardType}</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="text-carbon-60">Coordinates:</span>
                        <span className="font-mono font-bold text-carbon-70">
                          {dist.lat}°N, {dist.lng}°E
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedDistrict(dist);
                        setActiveView('saved');
                      }}
                      className="w-full rounded-full py-2.5 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 font-black text-xs transition-all cursor-pointer"
                    >
                      <span className="inline-flex items-center justify-center gap-2">
                        Focus GIS Map Stage <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 5: SETTINGS & OFFLINE CACHE MANAGEMENT */}
        {activeView === 'settings' && (
          <div className="space-y-8">
            {/* Section Banner Header */}
            <div className="bg-carbon-90 rounded-xl p-6 sm:p-8 text-carbon-05 border border-carbon-80 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-ap-primary/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="space-y-2 relative z-10 max-w-2xl">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-primary text-ap-action-fg">
                    Storage & Offline Control
                  </span>
                  <span className="text-xs font-mono text-carbon-30">ServiceWorker Cache Engine</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-ap-on-inverse tracking-tight">
                  Offline Storage Settings
                </h2>
                <p className="text-xs sm:text-sm text-carbon-30 leading-relaxed font-normal">
                  HazardNet keeps map tiles in the normal browser cache only and never writes them to offline storage:
                  tile servers ask us not to bulk-download or persist their tiles. Forecast snapshots and app assets can
                  still be purged here at any time.
                </p>
              </div>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Tile policy card */}
              <div className="lg:col-span-7 ap-card space-y-6">
                <div className="flex items-center justify-between border-b border-carbon-20 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full w-12 h-12 bg-ap-primary/15 border border-ap-primary/30 text-amber-700 flex items-center justify-center font-bold text-xl">
                      <MaterialIcon name="public" className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-carbon-90">Map Tiles</h3>
                      <p className="text-xs text-carbon-60 font-mono">OpenTopoMap · OpenStreetMap data</p>
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-carbon-05 text-carbon-80 border border-carbon-20">
                    Not stored offline
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-mono">
                  <div className="rounded-2xl p-4 bg-carbon-05 border border-carbon-20">
                    <span className="text-xs text-carbon-60 font-bold uppercase block">Persisted Tiles</span>
                    <strong className="text-xl font-black text-carbon-90">0</strong>
                    <span className="text-xs text-carbon-60 block mt-0.5">by design</span>
                  </div>

                  <div className="rounded-2xl p-4 bg-carbon-05 border border-carbon-20">
                    <span className="text-xs text-carbon-60 font-bold uppercase block">Tile Source</span>
                    <strong className="text-sm font-black text-carbon-90">tile.opentopomap.org</strong>
                    <span className="text-xs text-carbon-60 block mt-0.5">renders OSM data</span>
                  </div>

                  <div className="p-4 bg-carbon-05 border border-carbon-20 rounded-2xl col-span-2 sm:col-span-1">
                    <span className="text-xs text-carbon-60 font-bold uppercase block">Caching</span>
                    <strong className="text-sm font-black text-carbon-90">Browser HTTP cache</strong>
                    <span className="text-xs text-carbon-60 block mt-0.5">honours server headers</span>
                  </div>
                </div>

                <div className="rounded-2xl p-4 bg-carbon-05 border border-amber-200 text-xs text-amber-900 space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <MaterialIcon name="lightbulb" className="w-4 h-4 inline-block mr-1" />
                    <span>Why tiles are not downloadable for offline use</span>
                  </div>
                  <p className="leading-relaxed">
                    Map tiles (rendered from OpenStreetMap data) are never bulk-downloaded or permanently stored: the
                    earlier OpenStreetMap tile servers IP-blocked this site after an old build pre-cached them, and that
                    lesson stuck. Tiles load on demand and live only in your browser's ordinary HTTP cache.
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleClearAllCaches}
                    disabled={isClearingAllCache}
                    className="px-5 py-3.5 bg-carbon-10 hover:bg-carbon-10 hover:text-ap-link hover:border-carbon-20 border border-carbon-20 rounded-full text-carbon-70 font-bold text-xs transition-all cursor-pointer"
                  >
                    {isClearingAllCache ? (
                      'Purging All Caches...'
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <MaterialIcon name="delete" className="w-3.5 h-3.5 text-ap-link" /> Purge All Offline Caches
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Application Cache Card */}
              <div className="lg:col-span-5 space-y-6">
                <div className="ap-card space-y-4">
                  <div className="flex items-center gap-3 border-b border-carbon-20 pb-3">
                    <div className="w-10 h-10 bg-carbon-10 text-carbon-80 flex items-center justify-center font-bold text-lg">
                      <MaterialIcon name="psychology" className="w-4 h-4 inline-block mr-1" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-carbon-90">Forecast Data & App Bundles</h4>
                      <p className="text-xs text-carbon-60 font-mono">Model weights remain server-side</p>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="p-3 bg-carbon-05 border border-carbon-20 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-bold text-carbon-80 block">HazardNet forecast product</span>
                        <span className="text-xs text-carbon-60 font-mono">Authorized prediction responses only</span>
                      </div>
                      <span className="px-2 py-0.5 bg-carbon-10 text-carbon-80 font-mono font-bold text-xs rounded">
                        Protected
                      </span>
                    </div>

                    <div className="p-3 bg-carbon-05 border border-carbon-20 rounded-xl flex items-center justify-between">
                      <div>
                        <span className="font-bold text-carbon-80 block">
                          Saved Districts ({savedDistricts.length})
                        </span>
                        <span className="text-xs text-carbon-60 font-mono">Pinned Locations LocalStorage</span>
                      </div>
                      <span className="px-2 py-0.5 bg-carbon-10 text-ap-link font-mono font-bold text-xs rounded">
                        Persisted
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 text-xs text-carbon-60 space-y-1">
                    <p>
                      <strong>Service Worker Status:</strong> Active & Registered
                    </p>
                    <p>
                      The Service Worker caches app assets only; map tiles are never persisted. Model weights and
                      preprocessing assets are never sent to or stored in the browser.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: PRIMARY GIS MAP — summary first on mobile; map stays mounted */}
        {activeView === 'gis' && (
          <>
            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
              <div className="order-1 lg:order-2 lg:w-[360px] shrink-0 space-y-4">
                <RegionSelector
                  selectedDistrictId={selectedDistrict?.id || ''}
                  onSelectDistrict={(dist) => setSelectedDistrict(dist)}
                />
                {selectedDistrict && (
                  <DistrictForecastPanel
                    district={selectedDistrict}
                    view={forecastView}
                    onRetry={() => runPrediction(selectedDistrict)}
                  />
                )}
              </div>
              <div className="order-2 lg:order-1 lg:flex-1 min-h-[360px] lg:min-h-[560px]">
                <Map
                  selectedDistrictId={selectedDistrict?.id}
                  onOpenDisasterModal={handleOpenDisasterModal}
                  pinpointLat={userProfile?.pinpointLat}
                  pinpointLng={userProfile?.pinpointLng}
                  onSelectDistrict={(dist) => {
                    if (!dist) {
                      setSelectedDistrict(null);
                      return;
                    }
                    const fullDistrict = ALL_64_DISTRICTS.find((d) => d.id === dist.id) || dist;
                    setSelectedDistrict(fullDistrict as District);
                  }}
                />
              </div>
            </div>

            {selectedDistrict ? (
              <>
                {/* Selected District HUD Banner */}

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                  className="bg-transparent border-0 rounded-xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-none"
                >
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-xl bg-transparent border-0 flex items-center justify-center font-bold text-carbon-80 text-xs shrink-0 shadow-none">
                      LOC
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl sm:text-3xl font-black text-carbon-90">
                          {selectedDistrict.name} District
                        </h2>
                        <span
                          className={`px-4 py-1 text-xs sm:text-sm font-extrabold rounded-full border ${
                            selectedDistrict.risk === 'High'
                              ? 'bg-carbon-10 text-ap-link border-carbon-20'
                              : selectedDistrict.risk === 'Moderate'
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-carbon-10 text-carbon-80 border-carbon-20'
                          }`}
                        >
                          {selectedDistrict.risk} Risk Category
                        </span>
                      </div>
                      <p className="text-sm text-carbon-60 leading-relaxed">
                        Division: <strong className="text-carbon-90 font-extrabold">{selectedDistrict.division}</strong>{' '}
                        | Primary Crop:{' '}
                        <strong className="text-carbon-90 font-extrabold">{selectedDistrict.mainCrop}</strong> | Primary
                        Hazard: <strong className="text-carbon-90 font-extrabold">{selectedDistrict.hazardType}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setSelectedDistrict(null)}
                      className="px-4 py-3 bg-carbon-90 hover:bg-carbon-80 text-carbon-05 border border-carbon-80 text-xs font-mono font-bold rounded-full transition-all flex items-center gap-2 active:scale-95 min-h-[48px] cursor-pointer"
                      title="Return to National Overview Mode"
                    >
                      <span className="inline-flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> National Overview
                      </span>
                    </button>

                    <div className="flex items-center gap-4 text-xs sm:text-sm font-mono bg-transparent px-4 py-3 border-0">
                      <div>
                        <span className="text-carbon-60 text-xs uppercase font-bold block">Coordinates</span>
                        <span className="text-carbon-80 font-bold">
                          {selectedDistrict.lat}°N, {selectedDistrict.lng}°E
                        </span>
                      </div>
                      <div className="w-px h-8 bg-carbon-20"></div>
                      <div>
                        <span className="text-carbon-60 text-xs uppercase font-bold block">Severity Head</span>
                        <span className="text-carbon-90 font-bold">Softmax + Severity</span>
                      </div>
                    </div>

                    <button
                      onClick={() => selectedDistrict?.id && handleOpenDisasterModal(selectedDistrict.id)}
                      className="px-5 py-3 bg-primary hover:bg-primary-strong text-ap-action-fg font-extrabold text-sm rounded-full transition-all duration-200 flex items-center gap-2 active:scale-98 hover:scale-[1.02] min-h-[48px] cursor-pointer"
                    >
                      <span>Granular Data Report</span>
                    </button>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
                >
                  <div className="lg:col-span-12">
                    {storedForecast && (
                      <AdvisoryPanel
                        districtName={selectedDistrict.name}
                        hazardType={storedForecast.prediction.hazard}
                        severityScore={severity}
                        confidence={storedForecast.prediction.confidence}
                      />
                    )}
                  </div>
                </motion.div>

                {/* Historical 30-Day Severity Trend Recharts Component */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                >
                  <ThirtyDayTrendChart districtName={selectedDistrict.name} districtId={selectedDistrict.id} />
                </motion.div>

                {/* National Overview Comparison Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                >
                  <NationalOverview
                    onSelectDistrict={(dist) => setSelectedDistrict(dist ? (dist as District) : null)}
                  />
                </motion.div>
              </>
            ) : (
              <div className="space-y-8">
                {/* Primary National Overview Component */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                >
                  <NationalOverview
                    onSelectDistrict={(dist) => setSelectedDistrict(dist ? (dist as District) : null)}
                  />
                </motion.div>

                {/* National Predictive AI Risk Analysis & Advisory Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                  className="space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2">
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-carbon-90 flex items-center gap-2.5">
                        <span>National Predictive AI Risk Analysis & Advisory</span>
                      </h3>
                      <p className="text-xs text-carbon-60 font-mono mt-0.5">
                        Hazard Probability Matrix & Agricultural Emergency Directives (National Aggregate)
                      </p>
                    </div>
                    <span className="text-xs font-mono text-amber-900 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200 shrink-0">
                      Stored Forecast • Published Results
                    </span>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-7">
                      <StoredForecastPanel forecast={storedForecast} loading={loading} requested={false} />
                    </div>
                    <div className="lg:col-span-5">
                      {storedForecast && (
                        <AdvisoryPanel
                          districtName="National Overview (Bangladesh)"
                          hazardType="Monsoon Flood & Cyclone"
                          severityScore={severity}
                          confidence={0.92}
                        />
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* National 30-Day Historical Telemetry Trend Component */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45 }}
                >
                  <ThirtyDayTrendChart districtName="National Overview (64 Districts)" districtId="kurigram" />
                </motion.div>
              </div>
            )}
          </>
        )}

        {/* Interactive Granular Disaster Data Modal */}
        <DisasterDetailModal
          districtId={modalDistrictId}
          isOpen={isDisasterModalOpen}
          onClose={() => setIsDisasterModalOpen(false)}
        />
      </div>
      {/* Dashboard container closer */}
    </div>
  );
};

export default Dashboard;
