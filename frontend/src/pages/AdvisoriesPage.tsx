import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ShieldAlert,
  ShieldCheck,
  PhoneCall,
  Mail,
  ExternalLink,
  BookOpen,
  Sparkles,
  Bot,
  AlertTriangle,
  Clock,
  MapPin,
  FileText,
  Copy,
  Printer,
  ChevronRight,
  Share2,
  CheckCircle2,
  HelpCircle,
  Wheat,
  Activity,
  Layers,
  Send,
  X,
} from 'lucide-react';

import MaterialIcon from '../components/MaterialIcon';
import { SECTOR_ADVISORIES, SectorAdvisoryData, TechnicalStep } from '../data/sectorAdvisoriesData';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { useKaggleAdvisories } from '../hooks/useKaggleAdvisories';
import { loadDistrictDaily, severityIndexOf, type DistrictDailyResult } from '../lib/dailyAdvisories';
import { Continuous15DayTrajectory } from '../components/district/Continuous15DayTrajectory';
import {
  advisorySignalOf,
  advisoryTierOf,
  buildForecastIndex,
  canonicalKey,
  forecastAgeHours,
  type ForecastHorizon,
  type ForecastRow,
} from '../lib/forecasts';
import { StructuredAdvisoryRenderer } from '../components/StructuredAdvisoryRenderer';
import { PrintQrCode } from '../components/PrintQrCode';
import { PdfExportButton } from '../components/PdfExportButton';
import { HazardGlyph } from '../components/apple/HazardGlyph';
import { AlertLevelBadge } from '../components/alerts/AlertLevelBadge';
import { StatusStrip } from '../components/StatusStrip';
import { useI18n } from '../hooks/useI18n';

const VALID_PHASES = ['all', 'pre-disaster', 'during-event', 'post-disaster'] as const;
type ProtocolPhase = (typeof VALID_PHASES)[number];

export const AdvisoriesPage: React.FC = () => {
  const { subCategory } = useParams<{ subCategory?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const prefersReducedMotion = useReducedMotion();
  const { formatDate, formatNumber } = useI18n();
  const fmt1 = (val: number) => formatNumber(val, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = (val: number) => formatNumber(val, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Active sector resolution
  const activeSectorId = subCategory && SECTOR_ADVISORIES[subCategory] ? subCategory : 'crops';
  const sector: SectorAdvisoryData = SECTOR_ADVISORIES[activeSectorId] || SECTOR_ADVISORIES['crops'];

  // Redirect /advisories to /advisories/crops for unique clean URL while preserving query params
  useEffect(() => {
    if (!subCategory || !SECTOR_ADVISORIES[subCategory]) {
      const qs = searchParams.toString();
      navigate(`/advisories/crops${qs ? `?${qs}` : ''}`, { replace: true });
    }
  }, [subCategory, navigate, searchParams]);

  // Hydration-safe print timestamp
  const [printTimestamp, setPrintTimestamp] = useState<string>('');
  useEffect(() => {
    const now = new Date();
    setPrintTimestamp(
      `${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} BST (GMT+6)`,
    );
  }, []);

  // Phase, district & horizon state synced to URL query params
  const rawPhase = searchParams.get('phase');
  const selectedPhase: ProtocolPhase = VALID_PHASES.includes(rawPhase as ProtocolPhase)
    ? (rawPhase as ProtocolPhase)
    : 'all';
  const setSelectedPhase = (nextPhase: ProtocolPhase) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextPhase === 'all') next.delete('phase');
        else next.set('phase', nextPhase);
        return next;
      },
      { replace: true },
    );
  };

  // Interactive Email Modal State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedDistrictForEmail, setSelectedDistrictForEmail] = useState<string>('Kurigram');
  const [affectedUpazilas, setAffectedUpazilas] = useState<string>('');
  const [customOfficerName, setCustomOfficerName] = useState<string>('');
  const [customOfficerPhone, setCustomOfficerPhone] = useState<string>('');
  const [customDamageArea] = useState<string>('');

  // Gemini Live AI Advisory Generator State
  const [showAiSynthesizer, setShowAiSynthesizer] = useState(false);
  const districtParam = searchParams.get('district');
  const resolvedDistrict = useMemo(() => {
    if (!districtParam) return 'Kurigram';
    const match = ALL_64_DISTRICTS.find(
      (d) => d.id === districtParam.toLowerCase() || canonicalKey(d.name) === canonicalKey(districtParam),
    );
    return match ? match.name : 'Kurigram';
  }, [districtParam]);
  const aiDistrict = resolvedDistrict;
  const setAiDistrict = (nextDistrict: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (canonicalKey(nextDistrict) === 'kurigram') next.delete('district');
        else next.set('district', nextDistrict);
        return next;
      },
      { replace: true },
    );
  };

  const kaggleHorizon: ForecastHorizon = searchParams.get('horizon') === '7_days' ? '7_days' : '15_days';
  const setKaggleHorizon = (nextHorizon: ForecastHorizon) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextHorizon === '15_days') next.delete('horizon');
        else next.set('horizon', nextHorizon);
        return next;
      },
      { replace: true },
    );
  };
  const [dailyDistrictResult, setDailyDistrictResult] = useState<DistrictDailyResult>({
    status: 'unavailable',
    source: 'none',
    run: null,
    advisories: [],
    fetchedAt: null,
  });
  useEffect(() => {
    const controller = new AbortController();
    loadDistrictDaily(aiDistrict, { now: new Date(), signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) setDailyDistrictResult(res);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDailyDistrictResult({ status: 'unavailable', source: 'none', run: null, advisories: [], fetchedAt: null });
        }
      });
    return () => controller.abort();
  }, [aiDistrict]);
  // Severity, confidence and hazard come from the daily Kaggle ingest (the
  // selected horizon row for the selected district). They are never read from
  // the static district table, and nothing is typed by hand.
  const kaggleQuery = useKaggleAdvisories(kaggleHorizon);
  const kaggle = kaggleQuery.data;
  const forecastIndex = useMemo(() => buildForecastIndex(kaggle?.rows ?? []), [kaggle]);
  const kaggleRow: ForecastRow | null = forecastIndex.get(canonicalKey(aiDistrict)) ?? null;
  const selectedDistrictMeta = useMemo(
    () => ALL_64_DISTRICTS.find((d) => canonicalKey(d.name) === canonicalKey(aiDistrict)) ?? ALL_64_DISTRICTS[0],
    [aiDistrict],
  );
  const kaggleTier = kaggleRow ? advisoryTierOf(kaggleRow) : null;
  const aiSeverity: number | null = kaggleRow ? advisorySignalOf(kaggleRow).final : null;
  const aiConfidence: number | null = kaggleRow && Number.isFinite(kaggleRow.confidence) ? kaggleRow.confidence : null;
  const aiHazard: string = kaggleRow?.hazard_type ?? '';
  const [aiCropContext, setAiCropContext] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiAdvisoryData, setAiAdvisoryData] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Filtered steps
  const filteredProtocols =
    selectedPhase === 'all' ? sector.phasedProtocols : sector.phasedProtocols.filter((p) => p.phase === selectedPhase);

  // Generate dynamic email body
  const generatePopulatedEmail = () => {
    let body = sector.emailTemplate.bodyStructure;
    body = body.replace(/\[DISTRICT_NAME\]/g, selectedDistrictForEmail);
    body = body.replace(/\[UPAZILAS_AFFECTED\]/g, affectedUpazilas || '[Upazilas]');
    body = body.replace(/\[AREA_IN_HECTARES\]/g, customDamageArea || '1,200');
    body = body.replace(/\[OFFICER_NAME\]/g, customOfficerName || 'Authorized Officer');
    body = body.replace(/\[OFFICER_PHONE\]/g, customOfficerPhone || '+8801XXXXXXXXX');
    body = body.replace(/\[YOUR_NAME_AND_DESIGNATION\]/g, customOfficerName || 'Authorized Disaster Focal Officer');
    body = body.replace(/\[PHONE_NUMBER\]/g, customOfficerPhone || '+8801XXXXXXXXX');
    return body;
  };

  const handleCopyEmail = () => {
    const emailText = `To: ${sector.emailTemplate.recipientDefault}\nSubject: ${sector.emailTemplate.subject.replace(/\[DISTRICT_NAME\]/g, selectedDistrictForEmail)}\n\n${generatePopulatedEmail()}`;
    navigator.clipboard.writeText(emailText);
    toast.success('Official emergency requisition email copied to clipboard!', {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
    });
  };

  const handleLaunchMailClient = () => {
    const to = encodeURIComponent(sector.emailTemplate.recipientDefault);
    const subject = encodeURIComponent(
      sector.emailTemplate.subject.replace(/\[DISTRICT_NAME\]/g, selectedDistrictForEmail),
    );
    const body = encodeURIComponent(generatePopulatedEmail());
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success(`Copied unique URL for ${sector.name} to clipboard!`, {
      icon: <Copy className="w-4 h-4 text-emerald-600" />,
    });
  };

  // Trigger Live AI Advisory Synthesis
  const handleGenerateAiAdvisory = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/advisory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_name: aiDistrict,
          hazard_type: aiHazard,
          severity_score: aiSeverity,
          confidence: aiConfidence,
          crop_context: aiCropContext,
          target_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI Engine error (${response.status})`);
      }

      const data = await response.json();
      setAiAdvisoryData(data);
      toast.success(`Drafted an AI advisory for ${aiDistrict}. Check it against BMD and FFWC before acting.`, {
        icon: <Sparkles className="w-4 h-4 text-amber-500" />,
      });
    } catch (err: any) {
      console.error('Failed to generate advisory:', err);
      setAiError(err.message || 'Failed to draft advisory.');
      setAiAdvisoryData(null);
      toast.error('The advisory service did not respond. No advisory was drafted.');
    } finally {
      setAiLoading(false);
    }
  };

  const sectorList = Object.values(SECTOR_ADVISORIES);

  return (
    <motion.div
      id="advisory-bulletin-container"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
      className="max-w-7xl mx-auto space-y-8 pb-16"
    >
      {/* PRINT-ONLY OFFICIAL EMERGENCY BULLETIN HEADER */}
      <div className="print-only mb-6 border-b-2 border-carbon-90 pb-4">
        <div className="flex items-center justify-between border-b border-carbon-30 pb-2 mb-3 text-[9pt] font-mono font-bold text-carbon-70">
          <span>HAZARDNET BANGLADESH</span>
          <span>Advisory reference</span>
          <span>Advisories</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-carbon-90 tracking-tight">
              HAZARDNET BANGLADESH • ADVISORY REFERENCE • NOT AN OFFICIAL WARNING
            </h1>
            <p className="text-xs text-carbon-80 font-bold mt-0.5">
              Sector: {sector.name} ({sector.code}) • Standard Operating Procedures & Technical Action Matrix
            </p>

            {/* Prominent 'Last Updated' Timestamp and Advisory Currency Validity Indicator */}
            <div className="flex flex-wrap items-center gap-2 mt-2 pt-1 border-t border-carbon-20 text-[8pt] font-mono">
              <span className="print-last-updated">
                <strong>LAST UPDATED:</strong> {printTimestamp || 'BST (GMT+6)'}
              </span>
              <span className="print-currency-tag">VALIDITY: 24-HOUR EARLY WARNING WINDOW</span>
            </div>
          </div>

          {/* Dedicated Vector QR Code for Physical Handouts */}
          <div className="shrink-0">
            <PrintQrCode
              url={`https://www.hazardnet.live/advisories/${activeSectorId}`}
              districtOrSector={sector.name}
              title="Live Sector Directive"
              subtitle="Scan for real-time telemetry & AI hazard forecasts"
              size={72}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-carbon-20 text-[8pt] font-mono text-carbon-60">
          <div>Agencies referenced: DAE / DLS / DoF / DGHS / MoDMR / FFWC</div>
          <div>Advisory Status: ACTIVE FIELD OPERATIONAL PROTOCOL</div>
        </div>
      </div>

      {/* 1. SECTOR ROUTE NAVIGATOR (Unique URL per Sector) */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-4 sm:p-6 shadow-md space-y-4 screen-only">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-carbon-90 tracking-tight">
              Sectoral Hazard Directives & Emergency Protocols
            </h1>
            <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-carbon-60">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>NATIONAL STANDARD OPERATING PROCEDURES (SOP)</span>
            </div>
            <p className="text-xs sm:text-sm text-carbon-60 mt-1 max-w-3xl">
              Official institutional guidelines, operational thresholds, and verified emergency assistance contacts for
              Bangladesh disaster management.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="ap-focusable inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-carbon-05 border border-carbon-20 text-carbon-70 text-xs font-bold hover:bg-carbon-10 hover:text-carbon-90 transition-colors cursor-pointer"
              title="Copy link to this sector"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share Sector URL</span>
            </button>
            <PdfExportButton
              elementId="advisory-bulletin-container"
              filename={`HazardNet_${sector.code}_Directive_{region}_{date}.pdf`}
              filenameTemplate="HazardNet_{docType}_{region}_{date}.pdf"
              documentType={`${sector.name} Sector Directive`}
              regionName={selectedDistrictForEmail || 'National'}
              districtName={selectedDistrictForEmail || 'National'}
              hazardType="Disaster_Protocol"
              title="Export PDF Bulletin"
              filenameContext={{
                region: selectedDistrictForEmail || 'National',
                district: selectedDistrictForEmail || 'National',
                docType: `${sector.code}_Directive`,
                documentType: `${sector.name} Sector Directive`,
                hazard: 'Sector_Protocol',
                hazardType: 'Sector_Protocol',
              }}
            />
          </div>
        </div>

        {/* Sector Navigation Bar - Each item links to its own unique URL */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
          {sectorList.map((sec) => {
            const isActive = activeSectorId === sec.id;
            return (
              <Link
                key={sec.id}
                to={{ pathname: `/advisories/${sec.id}`, search: searchParams.toString() ? `?${searchParams.toString()}` : '' }}
                aria-current={isActive ? 'page' : undefined}
                className={`ap-focusable flex flex-col items-start p-3.5 rounded-2xl border transition-[border-color,background-color,box-shadow] text-left group ${
                  isActive
                    ? 'bg-carbon-90 text-ap-on-inverse border-carbon-90 shadow-md ring-2 ring-amber-400/40'
                    : 'bg-carbon-05/80 text-carbon-70 border-carbon-20/80 hover:bg-white hover:border-carbon-30 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span
                    className={`text-xs font-mono font-black px-2 py-0.5 rounded-md ${
                      isActive ? 'bg-amber-400 text-carbon-black' : 'bg-carbon-20/80 text-carbon-70'
                    }`}
                  >
                    {sec.code}
                  </span>
                  <MaterialIcon
                    name={sec.iconName}
                    className={`text-lg ${isActive ? 'text-amber-400' : 'text-carbon-60 group-hover:text-carbon-70'}`}
                  />
                </div>
                <span className="text-xs font-extrabold leading-tight">{sec.name}</span>
                <span
                  className={`text-xs mt-1 line-clamp-1 font-medium ${isActive ? 'text-carbon-30' : 'text-carbon-60'}`}
                >
                  {sec.leadAuthorities[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Kaggle Daily District Advisory & Metrics Ledger */}
      <section
        aria-labelledby="kaggle-advisory-snapshot-heading"
        className="rounded-xl border border-carbon-20 bg-white p-5 sm:p-7 space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-carbon-20 pb-4">
          <div className="space-y-1 max-w-2xl">
            <h2 id="kaggle-advisory-snapshot-heading" className="text-xl sm:text-2xl font-bold text-carbon-90 tracking-tight">
              District forecast, weather drivers, and model metrics
            </h2>
            <p className="text-xs leading-relaxed text-carbon-60">
              Research model run across {kaggle?.rows.length ?? 64} districts ({kaggle?.dataset ?? 'ashifahmedshuvo/hazardnet-weekly-forecasts'}).
              Not an official government warning. Confirm active alerts with BMD, FFWC, and DDM; call 999 in emergencies.
            </p>
          </div>
          {kaggle?.rows && kaggle.rows.length > 0 && (
            <StatusStrip forecasts={kaggle.rows} horizon={kaggleHorizon} />
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full sm:w-72 space-y-1.5">
            <label htmlFor="advisories-district-select" className="block text-xs font-semibold text-carbon-70">
              Select district (64)
            </label>
            <select
              id="advisories-district-select"
              value={aiDistrict}
              onChange={(e) => setAiDistrict(e.target.value)}
              className="ap-focusable w-full min-h-[44px] px-3 py-2 rounded-xl bg-carbon-05 border border-carbon-20 text-carbon-90 text-sm font-semibold"
            >
              {ALL_64_DISTRICTS.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name} ({d.division})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-full border border-carbon-20 bg-carbon-05 p-1"
              role="group"
              aria-label="Forecast horizon"
            >
              <button
                type="button"
                onClick={() => setKaggleHorizon('7_days')}
                aria-pressed={kaggleHorizon === '7_days'}
                className={`ap-focusable min-h-[44px] px-4 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  kaggleHorizon === '7_days'
                    ? 'bg-white text-carbon-90 border border-carbon-20'
                    : 'text-carbon-70 hover:text-carbon-90'
                }`}
              >
                7-day window
              </button>
              <button
                type="button"
                onClick={() => setKaggleHorizon('15_days')}
                aria-pressed={kaggleHorizon === '15_days'}
                className={`ap-focusable min-h-[44px] px-4 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                  kaggleHorizon === '15_days'
                    ? 'bg-white text-carbon-90 border border-carbon-20'
                    : 'text-carbon-70 hover:text-carbon-90'
                }`}
              >
                15-day window
              </button>
            </div>
            <Link
              to={`/forecast/district/${selectedDistrictMeta.id}`}
              className="ap-focusable min-h-[44px] inline-flex items-center px-2 text-xs font-semibold text-ap-link underline underline-offset-4"
            >
              <span>Open 15-day daily outlook: {selectedDistrictMeta.name}</span>
            </Link>
          </div>
        </div>

        {kaggleQuery.isLoading ? (
          <p className="border-t border-carbon-20 pt-4 text-sm text-carbon-60">
            Loading latest district forecast run…
          </p>
        ) : kaggleRow ? (
          <div className="border-t border-carbon-20 pt-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-lg font-bold text-carbon-90">
                  <HazardGlyph hazard={kaggleRow.hazard_type} size={20} />
                  <span>{kaggleRow.district_name}: {kaggleRow.hazard_type}</span>
                </h3>
                <p className="text-xs tabular-nums text-carbon-60">
                  Issued <time dateTime={kaggleRow.prediction_date}>{formatDate(kaggleRow.prediction_date)}</time>,{' '}
                  <strong className="font-semibold text-carbon-90">
                    peak severe date <time dateTime={kaggleRow.target_date}>{formatDate(kaggleRow.target_date)}</time>
                  </strong>
                  {kaggleRow.model_version ? `, model v${kaggleRow.model_version}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {kaggleTier && <AlertLevelBadge level={kaggleTier} label={kaggleTier} size="lg" />}
                <div className="text-right tabular-nums">
                  <div className="text-xs text-carbon-60">Severity index</div>
                  <div className="text-base font-bold text-carbon-90">
                    {formatNumber(severityIndexOf(kaggleRow.severity_score))}/100 ({fmt2(kaggleRow.severity_score)})
                  </div>
                </div>
              </div>
            </div>

            {kaggleRow.requires_review && (
              <p className="rounded-lg border border-amber-300 bg-amber-50/90 px-3.5 py-2 text-xs font-medium text-amber-950" role="note">
                Unreviewed research output above the watch threshold ({kaggleTier}). Do not treat as an issued official warning; verify with BMD, FFWC, or DDM.
              </p>
            )}

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 border-t border-carbon-10 pt-4 text-xs">
              <div>
                <dt className="text-carbon-60">Rainfall</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.precipitation_mm !== undefined ? `${fmt1(kaggleRow.precipitation_mm)}\u00A0mm` : 'n/a'}
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Temperature range</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.temperature_min !== undefined && kaggleRow.temperature_max !== undefined
                    ? `${fmt1(kaggleRow.temperature_min)} to ${fmt1(kaggleRow.temperature_max)}\u00A0°C`
                    : kaggleRow.temperature_max !== undefined
                      ? `${fmt1(kaggleRow.temperature_max)}\u00A0°C`
                      : 'n/a'}
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Max wind</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.wind_max_kmh !== undefined ? `${fmt1(kaggleRow.wind_max_kmh)}\u00A0km/h` : 'n/a'}
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Model confidence</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {formatNumber(Math.round(kaggleRow.confidence * 100))}%
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Fused severity</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.final_severity !== undefined
                    ? `${formatNumber(Math.round(kaggleRow.final_severity * 100))}%`
                    : `${formatNumber(Math.round(kaggleRow.severity_score * 100))}%`}
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Model severity</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.model_severity !== undefined ? `${formatNumber(Math.round(kaggleRow.model_severity * 100))}%` : 'n/a'}
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Physics severity</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.physics_severity !== undefined ? `${formatNumber(Math.round(kaggleRow.physics_severity * 100))}%` : 'n/a'}
                </dd>
              </div>
              <div>
                <dt className="text-carbon-60">Top-3 class share</dt>
                <dd className="mt-0.5 text-sm font-semibold text-carbon-90 tabular-nums">
                  {kaggleRow.prob_top1 !== undefined
                    ? [kaggleRow.prob_top1, kaggleRow.prob_top2, kaggleRow.prob_top3]
                        .filter((p): p is number => p !== undefined)
                        .map((p) => `${formatNumber(Math.round(p * 100))}%`)
                        .join(' / ')
                    : 'n/a'}
                </dd>
              </div>
            </dl>

            {dailyDistrictResult.advisories.length > 0 && (
              <div className="border-t border-carbon-20 pt-4">
                <Continuous15DayTrajectory advisories={dailyDistrictResult.advisories} />
              </div>
            )}
          </div>
        ) : (
          <p className="border-t border-carbon-20 pt-4 text-sm text-carbon-60">
            No forecast record is currently available for {aiDistrict} in this horizon window.
          </p>
        )}
      </section>

      {/* 2. ACTIVE SECTOR EXECUTIVE INTELLIGENCE & MANDATE */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 max-w-4xl min-w-0 lg:flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                {sector.code}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
                {sector.badge}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-mono text-carbon-60 bg-carbon-10 border border-carbon-20">
                URL: /advisories/{sector.id}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-carbon-90 tracking-tight">{sector.fullTitle}</h2>

            <p className="text-xs sm:text-sm text-carbon-70 leading-relaxed font-normal">{sector.executiveSummary}</p>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 space-y-1">
              <span className="font-mono font-black uppercase tracking-wider text-xs block text-amber-900">
                Statutory Reference & Mandate:
              </span>
              <p className="font-semibold text-carbon-80 break-words">{sector.sodReference}</p>
            </div>
          </div>

          {/* Quick Action Box */}
          <div className="bg-carbon-90 text-carbon-05 rounded-2xl p-5 sm:p-6 lg:w-80 shrink-0 space-y-4 shadow-md border border-carbon-80">
            <div className="flex items-center gap-2 text-amber-300">
              <ShieldAlert className="w-5 h-5" />
              <span className="text-xs font-mono font-black tracking-wider uppercase">Emergency Action Desk</span>
            </div>
            <p className="text-xs text-carbon-30 leading-snug">
              Official coordination desk for immediate seed, vaccine, water purification, and evacuation logistics
              requisition.
            </p>
            <div className="space-y-2 pt-1 screen-only">
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(true)}
                className="ap-focusable w-full py-2.5 px-4 rounded-full bg-amber-400 text-carbon-black font-black text-xs hover:bg-amber-300 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Draft Emergency Requisition</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAiSynthesizer(!showAiSynthesizer)}
                aria-expanded={showAiSynthesizer}
                className={`ap-focusable w-full py-2 px-4 rounded-xl font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer ${
                  showAiSynthesizer
                    ? 'bg-carbon-80 text-amber-300 border border-amber-400/40'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-amber-300" />
                <span>{showAiSynthesizer ? 'Hide AI advisory' : 'Draft an AI advisory'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Issuing Authorities & Vulnerability Profiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-carbon-20">
          <div className="space-y-2">
            <span className="text-xs font-mono font-black text-carbon-90 uppercase tracking-wider block">
              Lead Issuing Authorities:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {sector.leadAuthorities.map((auth, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-carbon-10 border border-carbon-20 text-carbon-80 text-xs font-bold"
                >
                  {auth}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-mono font-black text-carbon-90 uppercase tracking-wider block">
              Hazard Vulnerability Profile:
            </span>
            <p className="text-xs text-carbon-60 leading-relaxed font-normal">{sector.hazardVulnerabilitySummary}</p>
          </div>
        </div>
      </div>

      {/* 3. LIVE GEMINI AI ADVISORY SYNTHESIZER (EXPANDABLE) */}
      <AnimatePresence>
        {showAiSynthesizer && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          >
            <div className="bg-carbon-90 text-carbon-05 rounded-3xl p-6 sm:p-8 border border-carbon-80 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-700">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-ap-on-inverse flex items-center gap-2">
                      <span>AI advisory drafting</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-400 text-carbon-black text-xs font-mono font-black">
                        LIVE
                      </span>
                    </h3>
                    <p className="text-xs text-carbon-30">
                      Real-time generative intelligence correlating district AEZ soil profiles, river stage thresholds,
                      and sector protocols.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAiSynthesizer(false)}
                  aria-label="Close AI advisory drafting panel"
                  className="ap-focusable min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-carbon-30 hover:text-white p-1 rounded-lg hover:bg-carbon-80 self-start sm:self-auto cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scenario inputs: typed by the user, not taken from a forecast run. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="ai-synthesizer-district-select" className="text-xs font-mono font-bold text-carbon-30">
                    TARGET DISTRICT (64):
                  </label>
                  <select
                    id="ai-synthesizer-district-select"
                    name="aiDistrict"
                    value={aiDistrict}
                    onChange={(e) => setAiDistrict(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-carbon-80 border border-carbon-70 text-carbon-05 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    {ALL_64_DISTRICTS.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} ({d.division})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-mono font-bold text-carbon-30">HAZARD (KAGGLE RECORD):</span>
                  <p className="text-xs font-mono text-carbon-05">{aiHazard || 'Not available for this district'}</p>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-mono font-bold text-carbon-30">
                    SEVERITY (KAGGLE DAILY RECORD):
                  </span>
                  <p className="text-xs font-mono tabular-nums text-carbon-05">
                    {aiSeverity == null ? 'Not available for this district' : fmt2(aiSeverity)}
                  </p>
                  <p className="text-xs text-carbon-30">
                    {kaggleRow && kaggle
                      ? `Fetched from the Kaggle Dataset API at ${kaggle.fetchedAt ?? 'an unknown time'} (UTC). Dataset generated ${kaggle.generatedAt ?? 'time not stated'}. Prediction ${formatDate(kaggleRow.prediction_date)}, target ${formatDate(kaggleRow.target_date)}.${
                          kaggle.status === 'stale'
                            ? ' Kaggle could not be reached on the last refresh. This is the last value fetched.'
                            : ''
                        }${
                          forecastAgeHours(kaggleRow.prediction_date) > 36
                            ? ` This record is ${formatNumber(Math.round(forecastAgeHours(kaggleRow.prediction_date) / 24))} days old. Check the daily dataset update before you draft.`
                            : ''
                        }`
                      : kaggleQuery.isError
                        ? 'The Kaggle advisory service could not be reached. No value is shown.'
                        : kaggle?.status === 'unavailable'
                          ? 'No Kaggle value is available yet. The advisory service has not fetched the dataset, so no value is shown.'
                          : kaggleQuery.isPending
                            ? 'Loading the latest value from the Kaggle Dataset API…'
                            : 'No Kaggle record for this district in the latest fetch.'}
                  </p>
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={handleGenerateAiAdvisory}
                    disabled={aiSeverity == null || aiConfidence == null || !aiHazard || aiLoading}
                    className="ap-focusable w-full py-2.5 px-4 rounded-xl bg-primary hover:bg-ap-primary-tint text-ap-action-fg font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-carbon-black border-t-transparent rounded-full animate-spin"></div>
                        <span>Drafting…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Draft advisory</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Advisory Result Output */}
              {aiLoading && (
                <div className="p-6 sm:p-8 rounded-2xl bg-carbon-80/80 border border-carbon-70 text-center space-y-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mx-auto"></div>
                  <p className="text-xs text-carbon-30 font-mono">
                    Drafting from the {aiDistrict} forecast record and the {sector.code} protocol…
                  </p>
                </div>
              )}

              {aiError && !aiLoading && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                  <p className="font-bold">Notice:</p>
                  <p>{aiError}</p>
                </div>
              )}

              {aiAdvisoryData && !aiLoading && (
                <div className="bg-white text-carbon-90 rounded-2xl p-5 sm:p-6 shadow-lg border border-carbon-20">
                  <div className="flex items-center justify-between border-b border-carbon-20 pb-3 mb-4">
                    <div>
                      <h4 className="text-sm font-black text-carbon-90">
                        AI-drafted advisory for {aiDistrict} ({aiHazard})
                      </h4>
                      <p className="text-xs text-carbon-60 font-mono">
                        Urgency: {aiAdvisoryData.urgency_tier || aiAdvisoryData.urgency_level || 'Not stated'} • Engine:{' '}
                        {aiAdvisoryData.provider_source || 'Not stated'}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-amber-100 text-amber-950 border border-amber-300">
                      CONFIDENCE: {aiConfidence == null ? 'NOT AVAILABLE' : `${Math.round(aiConfidence * 100)}%`}
                    </span>
                  </div>
                  <StructuredAdvisoryRenderer advisoryJson={aiAdvisoryData} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. STEP-BY-STEP TECHNICAL PHASED PROTOCOLS */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-carbon-90 text-carbon-05 flex items-center justify-center font-mono font-bold text-xs">
              SOP
            </div>
            <div>
              <h3 className="text-xl font-black text-carbon-90 tracking-tight">
                Step-by-Step Technical Standard Operating Procedures
              </h3>
              <p className="text-xs text-carbon-60">
                Draft protocol steps. Check them against the national protocol reference shown above before use.
              </p>
            </div>
          </div>

          {/* Phase Filter Tabs */}
          <div
            role="group"
            aria-label="Protocol phase filter"
            className="flex items-center gap-1.5 bg-carbon-10 p-1.5 rounded-2xl border border-carbon-20 shrink min-w-0 self-start sm:self-auto max-w-full overflow-x-auto"
          >
            {[
              { id: 'all' as const, label: 'All' },
              { id: 'pre-disaster' as const, label: 'Before' },
              { id: 'during-event' as const, label: 'During' },
              { id: 'post-disaster' as const, label: 'After' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={selectedPhase === tab.id}
                onClick={() => setSelectedPhase(tab.id)}
                className={`ap-focusable px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedPhase === tab.id
                    ? 'bg-white text-carbon-90 shadow-xs border border-carbon-20'
                    : 'text-carbon-60 hover:text-carbon-90'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step Cards Grid */}
        <div className="space-y-4">
          {filteredProtocols.map((step: TechnicalStep, idx: number) => {
            const phaseBadgeColor =
              step.phase === 'pre-disaster'
                ? 'bg-amber-100 text-amber-950 border-amber-300'
                : step.phase === 'during-event'
                  ? 'bg-rose-100 text-rose-950 border-rose-300'
                  : 'bg-emerald-100 text-emerald-950 border-emerald-300';

            const phaseLabel =
              step.phase === 'pre-disaster'
                ? 'Phase 1: Pre-Disaster Early Warning'
                : step.phase === 'during-event'
                  ? 'Phase 2: Acute Impact & Event Management'
                  : 'Phase 3: Post-Disaster Recovery & Rehabilitation';

            return (
              <motion.div
                key={idx}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.2, delay: prefersReducedMotion ? 0 : idx * 0.05 }}
                className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-7 shadow-md space-y-4 hover:border-carbon-30 transition-colors"
              >
                {/* Step Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-carbon-20 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-carbon-10 border border-carbon-20 flex items-center justify-center font-mono font-black text-xs text-carbon-90 shrink-0">
                      {step.stepNumber}
                    </span>
                    <div>
                      <h4 className="text-base font-black text-carbon-90 tracking-tight">{step.title}</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-xs font-semibold text-carbon-60">Lead: {step.leadAgency}</span>
                        <span className="text-carbon-60">•</span>
                        <span className="text-xs font-mono text-carbon-60 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-carbon-60" />
                          {step.timeline}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-mono font-black px-3 py-1 rounded-full border self-start sm:self-auto ${phaseBadgeColor}`}
                  >
                    {phaseLabel}
                  </span>
                </div>

                {/* Trigger Threshold Banner */}
                <div className="p-3.5 rounded-2xl bg-carbon-05 border border-carbon-20/80 flex items-start gap-3 text-xs">
                  <div className="p-1 rounded-lg bg-amber-100 text-amber-900 shrink-0 mt-0.5">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-mono font-black text-carbon-90 uppercase tracking-wider block text-xs">
                      Operational Trigger Threshold:
                    </span>
                    <p className="text-carbon-70 mt-0.5">{step.triggerThreshold}</p>
                  </div>
                </div>

                {/* Detailed Actionable Protocol */}
                <div className="text-xs sm:text-sm text-carbon-80 leading-relaxed font-normal space-y-2">
                  <p>{step.detailedProtocol}</p>
                </div>

                {/* Technical Specs & Equipment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Technical Specifications */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono font-black text-carbon-90 uppercase tracking-wider block">
                      Quantitative Technical Parameters:
                    </span>
                    <ul className="list-disc list-outside space-y-1 pl-4 text-xs text-carbon-60">
                      {step.technicalSpecs.map((spec, sIdx) => (
                        <li key={sIdx}>{spec}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Equipment & Logistics */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono font-black text-carbon-90 uppercase tracking-wider block">
                      Required Equipment & Logistics:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {step.equipmentNeeded.map((eq, eIdx) => (
                        <span
                          key={eIdx}
                          className="px-2.5 py-1 rounded-lg bg-carbon-10 border border-carbon-20 text-carbon-70 text-xs font-semibold"
                        >
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Critical Warning if any */}
                {step.criticalWarning && (
                  <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-xs text-rose-950">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Critical Safety Directive: </span>
                      <span>{step.criticalWarning}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* 5. TECHNICAL CULTIVARS, AGROCHEMICALS & MATERIAL SPECIFICATION MATRIX */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Wheat className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-carbon-90 tracking-tight">
                Recommended Stress-Tolerant Varieties & Input Dosage Specifications
              </h3>
              <p className="text-xs text-carbon-60">
                Peer-reviewed agricultural varieties, chemical dosing ratios, and biosecurity protocols.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1 rounded-lg">SPEC-MATRIX</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              {/* Repeated Emergency Protocol Header Row on Every Printed Page */}
              <tr className="print-table-emergency-header">
                <th colSpan={5} className="emergency-protocol-title">
                  <AlertTriangle className="mr-2 inline h-4 w-4 align-[-2px]" aria-hidden="true" />
                  PROTOCOL MATRIX • {sector.name.toUpperCase()} SECTOR
                </th>
              </tr>
              <tr className="border-b border-carbon-20 text-carbon-60 font-mono text-xs">
                <th className="py-3 px-4 font-bold">NAME / CULTIVAR</th>
                <th className="py-3 px-4 font-bold">CATEGORY</th>
                <th className="py-3 px-4 font-bold">TOLERANCE CAPACITY</th>
                <th className="py-3 px-4 font-bold">RECOMMENDED DOSAGE / SEED RATE</th>
                <th className="py-3 px-4 font-bold">TARGET HAZARD / ZONE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-10">
              {sector.technicalSpecs.map((item, i) => (
                <tr key={i} className="hover:bg-carbon-05/80 transition-colors">
                  <td className="py-3.5 px-4 font-extrabold text-carbon-90 whitespace-nowrap">{item.name}</td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-carbon-10 text-carbon-70 font-mono text-xs font-bold">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-carbon-70 font-medium max-w-xs">{item.toleranceLevel}</td>
                  <td className="py-3.5 px-4 font-mono text-carbon-90 font-bold max-w-xs">{item.recommendedDosage}</td>
                  <td className="py-3.5 px-4 text-carbon-60 max-w-xs">{item.targetCondition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. OFFICIAL DOCUMENTATION & HYPERLINKED PORTALS */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
        <div className="flex items-center justify-between border-b border-carbon-20 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-carbon-90 tracking-tight">
                Official portals, national documents and research references
              </h3>
              <p className="text-xs text-carbon-60">
                Direct external hyperlinks to Bangladesh government ministries and international UN repositories.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-carbon-60 bg-carbon-10 px-2.5 py-1 rounded-lg">
            HYPERLINKED REPOSITORY
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sector.officialDocumentation.map((doc, dIdx) => (
            <a
              key={dIdx}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ap-focusable p-5 rounded-2xl bg-carbon-05 border border-carbon-20/80 hover:border-blue-400 hover:bg-blue-50/30 transition-colors flex flex-col justify-between group cursor-pointer shadow-2xs space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-100 text-blue-950 border border-blue-200">
                    {doc.docType}
                  </span>
                  <ExternalLink className="w-4 h-4 text-carbon-60 group-hover:text-blue-600 transition-colors" />
                </div>
                <h4 className="text-sm font-black text-carbon-90 group-hover:text-blue-900 leading-snug">
                  {doc.title}
                </h4>
                <p className="text-xs text-carbon-60 leading-relaxed line-clamp-3">{doc.description}</p>
              </div>

              <div className="pt-2 border-t border-carbon-20/60 flex items-center justify-between text-xs">
                <span className="text-xs text-carbon-60 font-medium truncate max-w-[180px]">{doc.issuingBody}</span>
                <span className="text-xs font-bold text-blue-700 flex items-center gap-1 group-hover:underline">
                  <span>Visit Portal</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* 7. OFFICIAL CONTACT INFORMATION & EMERGENCY SUPPORT DIRECTORY */}
      <div className="bg-white border border-carbon-20/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-carbon-20 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-carbon-90 tracking-tight">
                Official Contacts & Direct Emergency Support Channels
              </h3>
              <p className="text-xs text-carbon-60">
                Direct phone hotlines, official desk emails, and physical headquarters for requisitioning government and
                UN emergency assistance.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsEmailModalOpen(true)}
            className="ap-focusable inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-carbon-90 text-carbon-05 text-xs font-bold hover:bg-carbon-80 transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
          >
            <Mail className="w-3.5 h-3.5 text-amber-300" />
            <span>Open Emergency Email Composer</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sector.emergencyContacts.map((contact, cIdx) => (
            <div
              key={cIdx}
              className="p-5 rounded-2xl bg-carbon-05 border border-carbon-20/90 flex flex-col justify-between space-y-4 hover:shadow-xs transition-shadow"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                      contact.scope === 'Government of Bangladesh'
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-200'
                        : 'bg-blue-50 text-blue-900 border border-blue-200'
                    }`}
                  >
                    {contact.scope}
                  </span>
                </div>
                <h4 className="text-sm font-black text-carbon-90 leading-snug">{contact.agencyName}</h4>
                <p className="text-xs font-semibold text-carbon-60">{contact.departmentOrCell}</p>
                <p className="text-xs text-carbon-60">Role: {contact.roleOrDesignation}</p>
              </div>

              <div className="space-y-2 pt-3 border-t border-carbon-20 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-carbon-60 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-carbon-60" />
                    <span>Hotline:</span>
                  </span>
                  <a
                    href={`tel:${contact.hotline.split(' ')[0]}`}
                    className="font-mono font-extrabold text-carbon-90 hover:text-emerald-700"
                  >
                    {contact.hotline}
                  </a>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-carbon-60 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-carbon-60" />
                    <span>Official Email:</span>
                  </span>
                  <a
                    href={`mailto:${contact.officialEmail}`}
                    className="font-mono text-blue-700 hover:underline font-bold text-xs"
                  >
                    {contact.officialEmail}
                  </a>
                </div>

                <div className="pt-1 text-xs text-carbon-60 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-carbon-60 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{contact.address}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PRINT-ONLY OFFICIAL BULLETIN FOOTER */}
      <div className="print-only mt-8 pt-4 border-t-2 border-carbon-90 text-[8.5pt] text-carbon-70 font-mono">
        <div className="grid grid-cols-2 gap-4 pb-2 border-b border-carbon-30">
          <div>
            <strong className="text-carbon-90 block mb-1">NATIONAL TOLL-FREE EMERGENCY HOTLINES:</strong>
            <div>• Disaster Management (DDM): 1090</div>
            <div>• National Emergency Services: 999 (Police, Fire, Medical)</div>
            <div>• Krishi Call Centre: 16123</div>
          </div>
          <div className="text-right">
            <strong className="text-carbon-90 block mb-1">Source</strong>
            <div>HazardNet Bangladesh. Not an official warning service.</div>
            <div>BMD: +880 2 41025705, info@bmd.gov.bd</div>
            <div>FFWC: +880 2 2222 30070, ffwc@bwdb.gov.bd</div>
            <div>For emergencies, call 999.</div>
          </div>
        </div>
        <div className="text-center pt-2 text-[7.5pt] text-carbon-60">
          Official Technical Directive issued for Bangladesh Disaster Management Committees (DMC) at National, District,
          Upazila, and Union levels.
        </div>
      </div>

      {/* PRINT-ONLY FIXED RUNNING FOOTER WITH DYNAMIC CSS PAGE NUMBERING */}
      <div className="print-only print-page-footer">
        <span>HAZARDNET BANGLADESH • ADVISORY REFERENCE</span>
        <span>
          SECTOR: {sector.name.toUpperCase()} ({sector.code})
        </span>
        <span className="print-page-number"></span>
      </div>

      {/* 8. EMERGENCY EMAIL REQUISITION MODAL */}
      <AnimatePresence>
        {isEmailModalOpen && (
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-3 sm:p-4 bg-carbon-black/70 backdrop-blur-xs">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="email-requisition-modal-title"
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
              className="bg-white rounded-3xl border border-carbon-20 max-w-3xl w-full max-h-[90dvh] overflow-y-auto overscroll-contain p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 border-b border-carbon-20 pb-4">
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-950">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 id="email-requisition-modal-title" className="text-base sm:text-lg font-black text-carbon-90 break-words">
                      Emergency Assistance Email Requisition Generator
                    </h3>
                    <p className="text-xs text-carbon-60 font-mono break-words">
                      Pre-formatted email draft. Review before sending.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="ap-focusable min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-xl text-carbon-60 hover:text-carbon-70 hover:bg-carbon-10 cursor-pointer shrink-0"
                  aria-label="Close email requisition generator"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Controls to Customize Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label htmlFor="requisition-district-select" className="text-xs font-bold text-carbon-90">
                    Select Affected District:
                  </label>
                  <select
                    id="requisition-district-select"
                    name="affectedDistrict"
                    value={selectedDistrictForEmail}
                    onChange={(e) => setSelectedDistrictForEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-carbon-20 bg-carbon-05 text-xs font-semibold text-carbon-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carbon-90"
                  >
                    {ALL_64_DISTRICTS.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} ({d.division})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label htmlFor="requisition-upazilas-input" className="text-xs font-bold text-carbon-90">
                    Affected Upazilas / Unions:
                  </label>
                  <input
                    id="requisition-upazilas-input"
                    name="affectedUpazilas"
                    type="text"
                    autoComplete="address-level2"
                    value={affectedUpazilas}
                    onChange={(e) => setAffectedUpazilas(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-carbon-20 bg-carbon-05 text-xs font-semibold text-carbon-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carbon-90"
                    placeholder="Chilmari, Ulipur, Roumari…"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="requisition-officer-name" className="text-xs font-bold text-carbon-90">
                    Coordinator / Officer Name & Role:
                  </label>
                  <input
                    id="requisition-officer-name"
                    name="officerName"
                    type="text"
                    autoComplete="name"
                    value={customOfficerName}
                    onChange={(e) => setCustomOfficerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-carbon-20 bg-carbon-05 text-xs font-semibold text-carbon-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carbon-90"
                    placeholder="Md. Rafiqul Islam (Upazila Coordinator)…"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="requisition-officer-phone" className="text-xs font-bold text-carbon-90">
                    Officer Phone / Hotline:
                  </label>
                  <input
                    id="requisition-officer-phone"
                    name="officerPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={customOfficerPhone}
                    onChange={(e) => setCustomOfficerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-carbon-20 bg-carbon-05 text-xs font-semibold text-carbon-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carbon-90"
                    placeholder="+8801712-345678…"
                  />
                </div>
              </div>

              {/* Preview of Email */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="requisition-email-preview" className="font-bold text-carbon-90">
                    Structured Requisition Body Preview:
                  </label>
                  <span className="font-mono text-carbon-60">Recipients: {sector.emailTemplate.recipientDefault}</span>
                </div>
                <textarea
                  id="requisition-email-preview"
                  name="emailPreview"
                  readOnly
                  rows={10}
                  value={generatePopulatedEmail()}
                  className="w-full p-4 rounded-2xl bg-carbon-90 text-carbon-10 font-mono text-xs leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 resize-none border border-carbon-80"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <span className="text-xs text-carbon-60">
                  Ready to send directly via mailto or copy to clipboard for official communications.
                </span>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="ap-focusable flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-carbon-30 text-carbon-90 text-xs font-bold hover:bg-carbon-10 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Structured Email</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLaunchMailClient}
                    className="ap-focusable flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-carbon-90 text-carbon-05 text-xs font-bold hover:bg-carbon-80 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Send className="w-4 h-4 text-amber-300" />
                    <span>Open in Email App</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AdvisoriesPage;
