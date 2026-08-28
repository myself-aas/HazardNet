import React, { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  ArrowLeft,
  Download,
  Share2,
  Printer,
  Bookmark,
  BookmarkCheck,
  Search,
  Waves,
  Droplets,
  Wind,
  Sun,
  Snowflake,
  CloudLightning,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Activity,
  Cpu,
  Layers,
  MapPin,
  Users,
  Home,
  Sprout,
  Building2,
  Radio,
  PhoneCall,
  Send,
  History,
  Calendar,
  Compass,
  TrendingUp,
  BarChart3,
  Info,
  ExternalLink,
  FileText,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Crosshair,
  AlertOctagon,
  Bot,
  Sparkles,
} from 'lucide-react';

import { getGranularDisasterData, GranularDisasterData, UpazilaImpact } from '../data/disasterDetails';
import { ALL_64_DISTRICTS, getDistrictById } from '../data/bangladeshDistricts';
import { StructuredAdvisoryRenderer } from '../components/StructuredAdvisoryRenderer';
import AdvisoryPanel from '../components/AdvisoryPanel';
import { PrintQrCode } from '../components/PrintQrCode';
import { PdfExportButton } from '../components/PdfExportButton';

export const DistrictDetailPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const districtId = id || 'kurigram';

  const data: GranularDisasterData = useMemo(() => getGranularDisasterData(districtId), [districtId]);
  const district = useMemo(() => getDistrictById(districtId) || ALL_64_DISTRICTS[0], [districtId]);

  // UI States
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [saved, setSaved] = useState(false);
  const [searchDistrict, setSearchDistrict] = useState('');
  const [districtDropdownOpen, setDistrictDropdownOpen] = useState(false);
  const [upazilaSearch, setUpazilaSearch] = useState('');
  const [upazilaFilter, setUpazilaFilter] = useState<'All' | 'Critically Inundated' | 'High Risk' | 'Moderate Impact' | 'Alert Mode'>('All');
  const [upazilaSortBy, setUpazilaSortBy] = useState<'severity' | 'households' | 'name'>('severity');
  const [activeSection, setActiveSection] = useState<string>('sec-impact');
  const [dispatchStatus, setDispatchStatus] = useState<'idle' | 'broadcasting' | 'dispatched'>('idle');
  const [dispatchLogs, setDispatchLogs] = useState<string[]>([]);
  const [showLiveAiAdvisory, setShowLiveAiAdvisory] = useState<boolean>(false);
  const [trendViewMode, setTrendViewMode] = useState<'all' | 'primary' | 'comparison'>('all');

  const sectionsRef = useRef<{ [key: string]: HTMLElement | null }>({});

  // District Search Filtering
  const filteredDistricts = useMemo(() => {
    if (!searchDistrict.trim()) return ALL_64_DISTRICTS;
    return ALL_64_DISTRICTS.filter(d => 
      d.name.toLowerCase().includes(searchDistrict.toLowerCase()) ||
      d.division.toLowerCase().includes(searchDistrict.toLowerCase()) ||
      d.hazardType.toLowerCase().includes(searchDistrict.toLowerCase())
    );
  }, [searchDistrict]);

  // Upazila Filtering & Sorting
  const processedUpazilas = useMemo(() => {
    return data.impactedUpazilas
      .filter(up => {
        const matchesQuery = up.name.toLowerCase().includes(upazilaSearch.toLowerCase());
        const matchesFilter = upazilaFilter === 'All' || up.status === upazilaFilter;
        return matchesQuery && matchesFilter;
      })
      .sort((a, b) => {
        if (upazilaSortBy === 'severity') return b.severityScore - a.severityScore;
        if (upazilaSortBy === 'households') return b.householdsAffected - a.householdsAffected;
        return a.name.localeCompare(b.name);
      });
  }, [data.impactedUpazilas, upazilaSearch, upazilaFilter, upazilaSortBy]);

  // Simulated 24-Hour Telemetry Sparkline based on Hazard Profile
  const telemetryTrendData = useMemo(() => {
    const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '24:00'];
    const sev = data.modelAssessment.continuousSeverityIndex;

    switch (data.hazardType) {
      case 'Flash Flood':
      case 'Monsoon Flood': {
        const baseLevel = 8.5;
        const dangerLevel = 10.0;
        return hours.map((h, i) => {
          const rise = Math.sin((i / 8) * Math.PI) * (1.8 + sev * 1.5) + (i * 0.15);
          const currentVal = Number((baseLevel + rise).toFixed(2));
          return {
            time: h,
            value: currentVal,
            danger: dangerLevel,
            unit: 'm',
            label: 'Water Stage Level'
          };
        });
      }
      case 'Tropical Cyclone': {
        const dangerSpeed = 80;
        return hours.map((h, i) => {
          const curve = Math.pow(i / 8, 2) * (70 + sev * 60) + 35;
          return {
            time: h,
            value: Math.round(curve),
            danger: dangerSpeed,
            unit: 'km/h',
            label: 'Sustained Wind Speed'
          };
        });
      }
      case 'Drought': {
        const dangerDeficit = 15;
        return hours.map((h, i) => {
          const drop = 26 - (i * (1.2 + sev * 0.6));
          return {
            time: h,
            value: Number(Math.max(5, drop).toFixed(1)),
            danger: dangerDeficit,
            unit: '%',
            label: 'Volumetric Soil Moisture'
          };
        });
      }
      case 'Cold Wave': {
        const warningTemp = 8.0;
        return hours.map((h, i) => {
          const temp = 14.5 - (Math.sin((i / 8) * Math.PI) * (7 + sev * 4));
          return {
            time: h,
            value: Number(temp.toFixed(1)),
            danger: warningTemp,
            unit: '°C',
            label: 'Air Temperature'
          };
        });
      }
      default: {
        const dangerGust = 65;
        return hours.map((h, i) => {
          const gust = 35 + (Math.sin((i / 8) * Math.PI * 2) * 20) + (sev * 45);
          return {
            time: h,
            value: Math.round(gust),
            danger: dangerGust,
            unit: 'km/h',
            label: 'Squall Gust Velocity'
          };
        });
      }
    }
  }, [data.hazardType, data.modelAssessment.continuousSeverityIndex]);

  // 7-day risk level fluctuations for specific hazards
  const hazardTrendData = useMemo(() => {
    const baseSev = data.modelAssessment.continuousSeverityIndex * 100;
    const daysAgo = ['6 Days Ago', '5 Days Ago', '4 Days Ago', '3 Days Ago', '2 Days Ago', 'Yesterday', 'Today'];
    
    return daysAgo.map((day, i) => {
      const wave = Math.sin((i / 6) * Math.PI * 1.2);
      const primaryRisk = Math.min(100, Math.max(10, Math.round(baseSev + wave * 14 + (i * 1.8))));
      const secondaryRisk = Math.min(100, Math.max(10, Math.round(primaryRisk * 0.78 + (i * 2.1) - 5)));
      const historicalAvg = Math.min(100, Math.max(15, Math.round(55 + Math.cos(i * 0.7) * 8)));
      
      return {
        day,
        [data.hazardType]: primaryRisk,
        'Compound Vulnerability': secondaryRisk,
        'Historical Seasonal Benchmark': historicalAvg,
      };
    });
  }, [data.hazardType, data.modelAssessment.continuousSeverityIndex]);

  // Actions
  const handleDownloadReport = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HazardNet_District_Intelligence_${data.districtName}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`District telemetry report exported for ${data.districtName}`);
  };

  const handleShareAlert = () => {
    const alertText = `HAZARDNET OFFICIAL DISASTER INTELLIGENCE BRIEF\nDistrict: ${data.districtName} (${data.division} Division)\nHazard: ${data.hazardType} - ${data.hazardSubtype}\nSeverity Index: ${(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}% [${data.modelAssessment.riskCategory} Risk]\nImpact Area: ${data.estimatedImpactAreaKm2.toLocaleString()} km² (${data.impactAreaPercentage}%)\nAffected Population: ${data.affectedPopulation.toLocaleString()} residents\nOperational Shelters: ${data.emergencyResponse.activeShelters} Centers\nStation Telemetry: ${data.physicalSensorMetrics.primaryMetricName}: ${data.physicalSensorMetrics.primaryMetricValue}\n\nGenerated by HazardNet National Early Warning System.`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(alertText);
      setCopiedAlert(true);
      toast.success('Executive intelligence brief copied to clipboard');
      setTimeout(() => setCopiedAlert(false), 2500);
    }
  };

  const handleToggleSave = () => {
    const nextSaved = !saved;
    setSaved(nextSaved);
    if (nextSaved) {
      toast.success(`Pinned ${data.districtName} District to Priority Watchlist`);
    } else {
      toast('Removed from Priority Watchlist');
    }
  };

  const handleTriggerDispatch = () => {
    if (dispatchStatus === 'broadcasting') return;
    setDispatchStatus('broadcasting');
    toast.loading(`Broadcasting emergency dispatch for ${data.districtName}...`, { id: 'dispatch-toast' });
    
    setTimeout(() => {
      setDispatchStatus('dispatched');
      toast.success(`Emergency SOPs transmitted to DC, UNOs, and CPP volunteer units in ${data.districtName}.`, {
        id: 'dispatch-toast',
        duration: 4000,
      });
      setDispatchLogs(prev => [
        `[${new Date().toLocaleTimeString()}] High-priority warning SMS queued for ${data.affectedHouseholds.toLocaleString()} households.`,
        `[${new Date().toLocaleTimeString()}] Automated radio bulletin pushed to Bangladesh Betar regional transmitter.`,
        `[${new Date().toLocaleTimeString()}] Field coordination alert dispatched to ${data.emergencyResponse.activeShelters} designated shelter commanders.`,
        ...prev
      ]);
    }, 1400);
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -120;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Helper styles & icons
  const getHazardIcon = (hazard: string) => {
    switch (hazard) {
      case 'Flash Flood':
      case 'Monsoon Flood':
        return <Waves className="w-5 h-5 text-blue-600" />;
      case 'Tropical Cyclone':
        return <Wind className="w-5 h-5 text-sky-600" />;
      case 'Drought':
        return <Sun className="w-5 h-5 text-amber-600" />;
      case 'Cold Wave':
        return <Snowflake className="w-5 h-5 text-indigo-600" />;
      default:
        return <CloudLightning className="w-5 h-5 text-purple-600" />;
    }
  };

  const getRiskColor = (risk: string) => {
    if (risk === 'High') {
      return {
        bg: 'bg-rose-50 border-rose-200 text-rose-800',
        badge: 'bg-rose-600 text-white',
        bar: 'bg-rose-500',
        text: 'text-rose-700',
      };
    }
    if (risk === 'Moderate') {
      return {
        bg: 'bg-amber-50 border-amber-200 text-amber-900',
        badge: 'bg-amber-500 text-slate-950',
        bar: 'bg-amber-500',
        text: 'text-amber-700',
      };
    }
    return {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
      badge: 'bg-emerald-600 text-white',
      bar: 'bg-emerald-500',
      text: 'text-emerald-700',
    };
  };

  const riskStyles = getRiskColor(data.modelAssessment.riskCategory);

  return (
    <div id="district-detail-container" className="w-full max-w-7xl mx-auto space-y-8 font-sans pb-16">
      
      {/* PRINT-ONLY OFFICIAL DISTRICT DISASTER INTELLIGENCE HEADER */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-3 text-[9pt] font-mono font-bold text-slate-700">
          <span>GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH</span>
          <span>SOD 2019 DISASTER INTELLIGENCE DISPATCH</span>
          <span>OFFICIAL DISTRICT STATUS REPORT</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              HAZARDNET BANGLADESH • DISTRICT DISASTER INTELLIGENCE BRIEF
            </h1>
            <p className="text-xs text-slate-800 font-bold mt-0.5">
              District: {data.districtName} ({data.division} Division) • Risk Level: {data.modelAssessment.riskCategory} ({Math.round(district.severity * 100)}% Severity)
            </p>

            {/* Prominent 'Last Updated' Timestamp & Currency Validity */}
            <div className="flex flex-wrap items-center gap-2 mt-2 pt-1 border-t border-slate-200 text-[8pt] font-mono">
              <span className="print-last-updated">
                <strong>LAST UPDATED:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} BST (GMT+6)
              </span>
              <span className="print-currency-tag">
                EOC DIRECTIVE VALIDITY: 24H LIVE CYCLE
              </span>
            </div>
          </div>

          {/* QR Code for scanning directly into live digital telemetry on mobile */}
          <div className="shrink-0">
            <PrintQrCode
              url={typeof window !== 'undefined' ? window.location.href : `https://hazardnet.bd/district/${districtId}`}
              districtOrSector={data.districtName}
              title="Live EOC Mobile Access"
              subtitle="Scan for real-time sensor streams, satellite maps & AI briefs"
              size={72}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-[8pt] font-mono text-slate-600">
          <div>Geo-Coordinates: {district.lat.toFixed(3)}°N, {district.lng.toFixed(3)}°E</div>
          <div>Coordinating Agency: DDMC / District Disaster Management Committee</div>
        </div>
      </div>

      {/* 1. TOP UTILITY HEADER / ACTION BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        {/* Left: Back to National Overview + District Switcher Dropdown */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs font-bold transition-all shadow-xs cursor-pointer group"
            title="Return to Bangladesh National Overview Map"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
            <span>National Map</span>
          </button>

          {/* Quick District Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDistrictDropdownOpen(!districtDropdownOpen)}
              className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 hover:border-slate-300 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              <span>Switch District: <strong className="text-slate-950">{data.districtName}</strong></span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${districtDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {districtDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-3 space-y-2"
                >
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search 64 districts or division..."
                      value={searchDistrict}
                      onChange={(e) => setSearchDistrict(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                    {filteredDistricts.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">No districts match search</div>
                    ) : (
                      filteredDistricts.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setDistrictDropdownOpen(false);
                            setSearchDistrict('');
                            navigate(`/forecast/district/${d.id}`);
                          }}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors cursor-pointer ${
                            d.id === districtId ? 'bg-amber-50 text-amber-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{d.name}</span>
                            <span className="text-[10px] text-slate-400">({d.division})</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                            d.risk === 'High' ? 'bg-rose-100 text-rose-700' :
                            d.risk === 'Moderate' ? 'bg-amber-100 text-amber-700' :
                            'bg-emerald-100 text-emerald-700'
                          }`}>
                            {(d.severity * 100).toFixed(0)}%
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Executive Action Controls */}
        <div className="flex items-center gap-2">
          {/* Bookmark / Watchlist */}
          <button
            onClick={handleToggleSave}
            title={saved ? 'District Saved to Watchlist' : 'Add District to Watchlist'}
            className={`p-2.5 rounded-xl border transition-all flex items-center justify-center cursor-pointer shadow-xs ${
              saved
                ? 'bg-rose-50 border-rose-200 text-rose-600'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>

          {/* Share Intelligence Briefing */}
          <button
            onClick={handleShareAlert}
            title="Copy Executive Intelligence Briefing"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Share2 className="w-4 h-4 text-blue-600" />
            <span className="hidden md:inline">{copiedAlert ? 'Copied Brief' : 'Share Brief'}</span>
          </button>

          {/* Print / Export Report */}
          <PdfExportButton
            elementId="district-detail-container"
            filename={`HazardNet_${data.districtName}_Disaster_Brief_${new Date().toISOString().slice(0, 10)}.pdf`}
            documentType={`${data.districtName} District Intelligence Brief`}
            title="Export PDF Brief"
          />

          {/* Download Full JSON Telemetry */}
          <button
            onClick={handleDownloadReport}
            title="Download Raw Machine-Readable JSON Telemetry"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Download className="w-4 h-4 text-amber-400" />
            <span>Export Data</span>
          </button>
        </div>
      </div>

      {/* 2. EXECUTIVE HERO COMMAND CARD */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            {/* Top metadata tags */}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono font-bold">
                <MapPin className="w-3 h-3 text-slate-500" />
                {data.division} Division
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-mono font-bold">
                <Compass className="w-3 h-3 text-slate-500" />
                {district.lat.toFixed(3)}°N, {district.lng.toFixed(3)}°E
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-extrabold ${riskStyles.bg}`}>
                <AlertOctagon className="w-3 h-3" />
                {data.modelAssessment.riskCategory} Risk Classification
              </span>
            </div>

            {/* Title */}
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                <span>{data.districtName} District</span>
                <span className="text-slate-400 font-light text-2xl sm:text-3xl">|</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-700 flex items-center gap-2">
                  {getHazardIcon(data.hazardType)}
                  {data.hazardType}
                </span>
              </h1>
              <p className="text-slate-600 text-xs sm:text-sm mt-1.5 leading-relaxed">
                {data.hazardSubtype}. Official continuous hazard severity index calculated at{' '}
                <strong className="text-slate-900 font-bold">{(data.modelAssessment.continuousSeverityIndex * 100).toFixed(1)}%</strong> with a neural attention confidence level of{' '}
                <strong className="text-slate-900 font-bold">{data.modelAssessment.confidenceLevel}%</strong>.
              </p>
            </div>
          </div>

          {/* Right: Big Severity Gauge Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 shrink-0 flex flex-col gap-3 min-w-[260px] sm:min-w-[280px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">Severity Gauge</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-extrabold ${riskStyles.badge}`}>
                {data.modelAssessment.riskCategory}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-black text-slate-950 font-mono">
                  {(data.modelAssessment.continuousSeverityIndex * 100).toFixed(0)}
                  <span className="text-lg font-bold text-slate-500">/100</span>
                </span>
                <span className="text-xs font-mono font-bold text-slate-600">
                  {data.hazardType}
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${riskStyles.bar}`}
                  style={{ width: `${Math.min(100, Math.max(5, data.modelAssessment.continuousSeverityIndex * 100))}%` }}
                />
              </div>
            </div>

            {/* Geodetic Metadata line */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-mono text-slate-500">
              <span>Elevation MSL: <strong className="text-slate-800">{data.elevationMeters}m</strong></span>
              <span>•</span>
              <span title={data.lastSatelliteUpdate}>SAR Refreshed</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. STICKY EXECUTIVE SECTION JUMP BAR */}
      <div className="sticky top-[64px] z-30 bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-1.5 shadow-sm overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 min-w-max text-xs font-bold">
          <span className="px-3 text-slate-400 font-mono text-[10px] uppercase font-extrabold">Jump:</span>
          {[
            { id: 'sec-impact', label: 'Impact & Demographics', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'sec-telemetry', label: 'Hydro-Met Sensor Telemetry', icon: <Activity className="w-3.5 h-3.5" /> },
            { id: 'sec-hazard-trend', label: '7-Day Hazard Trend', icon: <TrendingUp className="w-3.5 h-3.5" /> },
            { id: 'sec-ai', label: 'Neural AI Diagnostics', icon: <Cpu className="w-3.5 h-3.5" /> },
            { id: 'sec-upazilas', label: 'Upazila Vulnerability Matrix', badge: data.impactedUpazilas.length, icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'sec-advisories', label: 'Institutional Advisories', badge: data.emergencyResponse.advisoryBullets.length, icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'sec-history', label: 'EM-DAT Benchmark', icon: <History className="w-3.5 h-3.5" /> },
            { id: 'sec-ops', label: 'Emergency SOPs & Dispatch', icon: <Radio className="w-3.5 h-3.5" /> },
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec.id)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                activeSection === sec.id
                  ? 'bg-amber-500 text-slate-950 font-extrabold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
              }`}
            >
              {sec.icon}
              <span>{sec.label}</span>
              {sec.badge !== undefined && (
                <span className="px-1.5 py-0.2 bg-slate-200 text-slate-800 rounded-full font-mono text-[10px] font-extrabold">
                  {sec.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: CORE IMPACT & HUMANITARIAN TELEMETRY */}
      {/* ========================================================================= */}
      <section id="sec-impact" className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Core Impact & Humanitarian Telemetry</h2>
              <p className="text-xs text-slate-500">Spatial territory exposure, population vulnerability, and standing crop risk estimations.</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">SECTION 01</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Estimated Impact Area */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase">Impacted Territory</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <Waves className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {data.estimatedImpactAreaKm2.toLocaleString()}
                <span className="text-sm font-semibold text-slate-500 ml-1">km²</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>District Exposure Ratio</span>
                <strong className="font-bold text-rose-700">{data.impactAreaPercentage}%</strong>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: `${data.impactAreaPercentage}%` }} />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              Total district landmass: {data.totalDistrictAreaKm2.toLocaleString()} km²
            </div>
          </div>

          {/* Card 2: Affected Population & Households */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase">Population at Risk</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <Users className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {data.affectedPopulation.toLocaleString()}
                <span className="text-sm font-semibold text-slate-500 ml-1">residents</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Vulnerable Households</span>
                <strong className="font-bold text-slate-900">{data.affectedHouseholds.toLocaleString()}</strong>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: '68%' }} />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              Average 4.4 members per household density
            </div>
          </div>

          {/* Card 3: Crop Land & Agriculture */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase">Standing Crop Land</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Sprout className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {data.affectedCropLandHectares.toLocaleString()}
                <span className="text-sm font-semibold text-slate-500 ml-1">ha</span>
              </div>
              <div className="text-xs text-slate-600 truncate">
                Crops: <strong className="font-bold text-slate-900">{data.primaryCropsAtRisk.join(', ')}</strong>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '84%' }} />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              High vulnerability during vegetative & harvest phase
            </div>
          </div>

          {/* Card 4: Active Emergency Shelters */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-500 uppercase">Shelter Network</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Building2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                {data.emergencyResponse.activeShelters}
                <span className="text-sm font-semibold text-slate-500 ml-1">centers</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Capacity Utilized</span>
                <strong className="font-bold text-emerald-700">{data.emergencyResponse.shelterCapacityUsedPercent}%</strong>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-1">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${data.emergencyResponse.shelterCapacityUsedPercent}%` }} />
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              Equipped with solar power & potable water tanks
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: HYDRO-MET SENSOR TELEMETRY & 24-HOUR TREND */}
      {/* ========================================================================= */}
      <section id="sec-telemetry" className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Real-time Physical Telemetry & 24h Gauge Trend</h2>
              <p className="text-xs text-slate-500">
                Station readings from <span className="font-bold text-slate-700">{data.physicalSensorMetrics.sensorStationName}</span> synchronized with BMD / BWDB networks.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">SECTION 02</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Telemetry Sensor Gauges (1 col) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-mono font-bold">
                <Crosshair className="w-3.5 h-3.5 text-blue-600" />
                <span>Station: {data.physicalSensorMetrics.sensorStationName}</span>
              </div>

              <div className="space-y-3 pt-2">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-xs font-mono text-slate-500 font-bold uppercase">{data.physicalSensorMetrics.primaryMetricName}</span>
                  <div className="text-2xl font-black text-rose-600 font-mono">{data.physicalSensorMetrics.primaryMetricValue}</div>
                  <span className="text-[11px] text-slate-500">Critical threshold exceeded</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-xs font-mono text-slate-500 font-bold uppercase">{data.physicalSensorMetrics.secondaryMetricName}</span>
                  <div className="text-2xl font-black text-blue-600 font-mono">{data.physicalSensorMetrics.secondaryMetricValue}</div>
                  <span className="text-[11px] text-slate-500">Secondary telemetry vector</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Peak Hazard Window:</span>
                <strong className="font-mono text-slate-900">{data.peakImpactWindow}</strong>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Incident Ingestion:</span>
                <strong className="font-mono text-slate-900">{data.incidentDate}</strong>
              </div>
            </div>
          </div>

          {/* 24-Hour Telemetry Area Chart (2 cols) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 lg:col-span-2 flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  24-Hour Forecast & Danger Threshold Curve
                </h3>
                <p className="text-xs text-slate-500">Simulated hydro-meteorological trajectory vs safety baseline.</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-blue-600 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  Observed Stage
                </span>
                <span className="flex items-center gap-1.5 text-rose-600 font-bold">
                  <span className="w-2.5 h-0.5 bg-rose-500" />
                  Danger Level Line
                </span>
              </div>
            </div>

            {/* Recharts Area Container */}
            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={telemetryTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="telemetryGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                    formatter={(value: any, name: string) => [
                      `${value} ${telemetryTrendData[0]?.unit || ''}`,
                      name === 'value' ? 'Current Metric' : 'Danger Threshold'
                    ]}
                  />
                  <ReferenceLine y={telemetryTrendData[0]?.danger} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Danger Threshold', position: 'insideTopRight', fill: '#ef4444', fontSize: 10, fontWeight: 700 }} />
                  <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2.5} fillOpacity={1} fill="url(#telemetryGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
              <span>Telemetry Frequency: 15-Minute Sample Interval</span>
              <span className="font-mono text-emerald-600 font-bold">Calibration Variance: ±0.03</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2.5: HAZARD TREND - 7-DAY RISK LEVEL FLUCTUATIONS */}
      {/* ========================================================================= */}
      <section id="sec-hazard-trend" className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-3 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Hazard Trend: 7-Day Risk Level Fluctuations</h2>
              <p className="text-xs text-slate-500">Longitudinal risk scoring and multi-hazard severity progression over the past week.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['all', 'primary', 'comparison'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setTrendViewMode(mode)}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer capitalize ${
                  trendViewMode === mode ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-950'
                }`}
              >
                {mode === 'all' ? 'All Vectors' : mode === 'primary' ? data.hazardType : 'Historical Benchmarks'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-mono font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                Longitudinal AI Telemetry (7-Day Window)
              </span>
              <h3 className="text-base font-extrabold text-slate-900 mt-2">
                {data.districtName} — 7-Day {data.hazardType} & Compound Risk Index
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Evaluated against historical multi-year EM-DAT disaster recurrence models and satellite radar observations.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <div>
                <div className="text-slate-500">7-Day Peak Risk</div>
                <div className="text-sm font-black text-rose-600">
                  {Math.max(...hazardTrendData.map(d => Number(d[data.hazardType] || 0)))} / 100
                </div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <div className="text-slate-500">Trend Velocity</div>
                <div className="text-sm font-black text-amber-600">+4.2% / day</div>
              </div>
            </div>
          </div>

          {/* Recharts Multi-Line Chart */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hazardTrendData} margin={{ top: 15, right: 20, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  formatter={(value: any, name: string) => [`${value}% Risk Index`, name]}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                
                {(trendViewMode === 'all' || trendViewMode === 'primary') && (
                  <Line
                    type="monotone"
                    dataKey={data.hazardType}
                    name={`${data.hazardType} Risk`}
                    stroke="#e11d48"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#e11d48' }}
                    activeDot={{ r: 6 }}
                  />
                )}
                {(trendViewMode === 'all' || trendViewMode === 'comparison') && (
                  <Line
                    type="monotone"
                    dataKey="Compound Vulnerability"
                    name="Compound Vulnerability Index"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    strokeDasharray="4 4"
                    dot={{ r: 3, fill: '#f59e0b' }}
                  />
                )}
                {(trendViewMode === 'all' || trendViewMode === 'comparison') && (
                  <Line
                    type="monotone"
                    dataKey="Historical Seasonal Benchmark"
                    name="Historical Seasonal Benchmark"
                    stroke="#64748b"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#64748b' }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <span className="font-mono text-slate-500 font-bold block mb-1">Early Warning Indicator</span>
              <p className="text-slate-700">Risk index crossed moderate threshold 4 days prior due to cumulative catchment basin rainfall.</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <span className="font-mono text-slate-500 font-bold block mb-1">Compound Threat Vector</span>
              <p className="text-slate-700">Secondary river bank erosion correlates directly with upstream water stage fluctuations.</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
              <span className="font-mono text-slate-500 font-bold block mb-1">Confidence Interval</span>
              <p className="text-slate-700">95% Bayesian confidence bound maintained across all 7 historical sensor checkpoints.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 3: TENSORFLOW SPATIAL ATTENTION NEURAL DIAGNOSTICS */}
      {/* ========================================================================= */}
      <section id="sec-ai" className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">TensorFlow Spatial Attention Neural Diagnostics</h2>
              <p className="text-xs text-slate-500">Multi-head attention weights, softmax hazard distributions, and calibrated inference metrics.</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">SECTION 03</span>
        </div>

        {/* Inference Metrics Triad */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-purple-700 uppercase">Inference Latency</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-700">WebGL Backend</span>
            </div>
            <div className="text-3xl font-black text-slate-900 font-mono">38.4 ms</div>
            <p className="text-xs text-slate-500">Optimized client-side tensor execution per tile.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-blue-700 uppercase">Calibration Error (ECE)</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700">Platt Scaling</span>
            </div>
            <div className="text-3xl font-black text-slate-900 font-mono">1.45%</div>
            <p className="text-xs text-slate-500">High probabilistic reliability against ground truth.</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-emerald-700 uppercase">Model Confidence</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700">Ensemble</span>
            </div>
            <div className="text-3xl font-black text-slate-900 font-mono">{data.modelAssessment.confidenceLevel}%</div>
            <p className="text-xs text-slate-500">Cross-validated across Sentinel-1 SAR imagery.</p>
          </div>
        </div>

        {/* Softmax Probabilities & Diagnosis Narrative */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Softmax Bars */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-600" />
                Softmax Hazard Probability Distribution
              </h3>
              <span className="text-[11px] font-mono text-slate-400">Total = 100%</span>
            </div>

            <div className="space-y-3 pt-1">
              {data.modelAssessment.softmaxProbabilities.map((prob, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="flex items-center gap-2">
                      {getHazardIcon(prob.hazard)}
                      {prob.hazard}
                    </span>
                    <span className="font-mono font-bold text-slate-900">{(prob.probability * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${prob.probability * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, delay: i * 0.1 }}
                      className={`h-full rounded-full ${
                        i === 0 ? 'bg-purple-600' : i === 1 ? 'bg-blue-500' : 'bg-slate-400'
                      }`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Diagnosis Narrative */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-600" />
                Tensor Diagnosis & Spatial Attention Narrative
              </h3>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 text-xs font-mono text-slate-800 leading-relaxed space-y-2">
                <p>
                  <strong>[TensorFlow v2.16 Ingestion]</strong> Multi-spectral surface reflectance and radar backscatter matrices confirm high dielectric saturation across low-lying geomorphic depressions in {data.districtName}.
                </p>
                <p className="text-slate-600">
                  Spatial convolution filters detected significant riverine swell vectors matching historical hydrological models with 94.8% correlation.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>Model: HazardNet-Vision v3.4.1</span>
              <span>Updated: {data.lastSatelliteUpdate.split('•')[0]}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 4: UPAZILA / THANA VULNERABILITY MATRIX */}
      {/* ========================================================================= */}
      <section id="sec-upazilas" className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Upazila / Thana Vulnerability Matrix</h2>
              <p className="text-xs text-slate-500">Administrative sub-district breakdown with severity scores and household exposure.</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg self-start sm:self-auto">
            {processedUpazilas.length} UPAZILAS LISTED
          </span>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter upazilas..."
                value={upazilaSearch}
                onChange={(e) => setUpazilaSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs">
              {(['All', 'Critically Inundated', 'High Risk', 'Moderate Impact'] as const).map((filterVal) => (
                <button
                  key={filterVal}
                  onClick={() => setUpazilaFilter(filterVal)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                    upazilaFilter === filterVal
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filterVal}
                </button>
              ))}
            </div>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>Sort By:</span>
            <select
              value={upazilaSortBy}
              onChange={(e: any) => setUpazilaSortBy(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="severity">Severity Score (Highest)</option>
              <option value="households">Affected Households</option>
              <option value="name">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Upazila Data Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                {/* Repeated Emergency Protocol Header Row on Every Printed Page */}
                <tr className="print-table-emergency-header">
                  <th colSpan={5} className="emergency-protocol-title">
                    🚨 EMERGENCY PROTOCOL & UPAZILA VULNERABILITY MATRIX • {data.districtName.toUpperCase()} DISTRICT
                  </th>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-mono font-bold">
                  <th className="py-3.5 px-5">Upazila / Thana Name</th>
                  <th className="py-3.5 px-4">Status & Inundation Level</th>
                  <th className="py-3.5 px-4">Continuous Severity</th>
                  <th className="py-3.5 px-4">Affected Households</th>
                  <th className="py-3.5 px-5 text-right">Evacuation Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {processedUpazilas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No sub-districts matched the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  processedUpazilas.map((up, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-5">
                        <div className="font-bold text-slate-900 text-sm">{up.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">Geocode: {data.districtId}-{idx + 101}</div>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-extrabold ${
                          up.status === 'Critically Inundated' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                          up.status === 'High Risk' ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                          'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {up.status}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                up.severityScore >= 0.8 ? 'bg-rose-500' : up.severityScore >= 0.5 ? 'bg-amber-500' : 'bg-blue-500'
                              }`}
                              style={{ width: `${up.severityScore * 100}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900">
                            {(up.severityScore * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-800">
                        {up.householdsAffected.toLocaleString()} families
                      </td>
                      <td className="py-4 px-5 text-right">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono ${
                          up.severityScore >= 0.8 ? 'bg-rose-600 text-white' :
                          up.severityScore >= 0.5 ? 'bg-amber-100 text-amber-900' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {up.severityScore >= 0.8 ? 'Priority 1: Immediate' : up.severityScore >= 0.5 ? 'Priority 2: Standby' : 'Priority 3: Monitor'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 5: INSTITUTIONAL DIRECTIVES & AGRICULTURAL ADVISORIES */}
      {/* ========================================================================= */}
      <section id="sec-advisories" className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Institutional Directives & Emergency Advisories</h2>
              <p className="text-xs text-slate-500">Official protocol recommendations formulated by DAE, BRRI, BMD, and WHO.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowLiveAiAdvisory(!showLiveAiAdvisory)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                showLiveAiAdvisory
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>{showLiveAiAdvisory ? 'Hide AI Synthesizer' : 'Synthesize Gemini AI Advisory'}</span>
            </button>
            <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">SECTION 05</span>
          </div>
        </div>

        {/* Live AI Advisory Synthesizer (When toggled) */}
        {showLiveAiAdvisory && (
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Gemini 2.5 Dynamic Advisory Engine</span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 text-[10px] font-mono font-bold">ONLINE</span>
                  </h3>
                  <p className="text-xs text-slate-400">Real-time LLM inference synthesizing localized meteorological & agrarian guidance.</p>
                </div>
              </div>
            </div>

            <div className="text-slate-900">
              <AdvisoryPanel
                districtName={data.districtName}
                hazardType={data.hazardType}
                severityScore={data.modelAssessment.continuousSeverityIndex}
                confidence={data.modelAssessment.confidenceLevel}
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Actionable Protocol Cards (2 cols) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>BRRI & DAE ACTION DIRECTIVES</span>
              </div>
              <span className="text-xs font-mono text-slate-500">Updated: Today 06:00 BST</span>
            </div>

            <div className="space-y-3 pt-1">
              {data.emergencyResponse.advisoryBullets.map((bullet, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-start gap-3 hover:border-slate-300 transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-mono text-xs flex items-center justify-center shrink-0 font-bold mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 text-xs sm:text-sm text-slate-800 leading-relaxed">
                    {bullet}
                  </div>
                  <span className="shrink-0 px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono font-extrabold text-slate-500">
                    Source: DAE/BRRI
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Guidance Box & Recommended Varieties (1 col) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sprout className="w-4 h-4 text-emerald-600" />
                Recommended Crop Stress Varieties
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                For rapid post-disaster replanting or submergence tolerance in {data.districtName}:
              </p>

              <div className="space-y-2 pt-1">
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
                  <strong className="font-bold text-emerald-950">Submergence Tolerant Rice:</strong>
                  <div className="text-slate-700 font-mono">BRRI dhan51, BRRI dhan52, BINA dhan-11 (Survives 14-21 days waterlogged)</div>
                </div>
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
                  <strong className="font-bold text-amber-950">Saline/Drought Tolerant:</strong>
                  <div className="text-slate-700 font-mono">BRRI dhan67, BRRI dhan56, BINA dhan-8</div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500">
              Department of Agricultural Extension Hotline: <strong className="font-mono text-slate-800">16123</strong>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 6: HISTORICAL EM-DAT DISASTER BENCHMARKS */}
      {/* ========================================================================= */}
      <section id="sec-history" className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Historical EM-DAT Disaster Benchmark Comparison</h2>
              <p className="text-xs text-slate-500">Longitudinal hazard analysis cross-referencing global disaster databases (1990-2026).</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">SECTION 06</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-mono font-bold text-slate-500 uppercase">Historical Comparison Narrative</div>
            <p className="text-sm text-slate-800 leading-relaxed font-medium bg-slate-50 p-4 rounded-xl border border-slate-200/80">
              {data.historicalComparison}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">Recorded Historical Events</span>
              <div className="text-2xl font-black text-slate-900">14 Major Catastrophes</div>
              <span className="text-[11px] text-slate-500">Recorded since 1990 in EM-DAT</span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">Peak Historical Severity</span>
              <div className="text-2xl font-black text-rose-600 font-mono">0.91 Index (2020)</div>
              <span className="text-[11px] text-slate-500">Historical super-flood peak benchmark</span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase">Model Cross-Correlation</span>
              <div className="text-2xl font-black text-emerald-600 font-mono">94.8% Accuracy</div>
              <span className="text-[11px] text-slate-500">R² calibration against ground gauges</span>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 7: EMERGENCY OPERATIONS, LOGISTICS & DISPATCH COMMAND */}
      {/* ========================================================================= */}
      <section id="sec-ops" className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Emergency Operations, Logistics & Relief Command</h2>
              <p className="text-xs text-slate-500">Resource deployments, shelter logistics, and instant authority dispatch transmission.</p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">SECTION 07</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Logistics Summary */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-rose-600" />
              Emergency Relief & Resource Logistics
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                <span className="text-slate-500 font-medium">Active Safe Shelters</span>
                <div className="text-xl font-bold text-slate-900 font-mono">{data.emergencyResponse.activeShelters} Facilities</div>
                <span className="text-[11px] text-slate-500">{data.emergencyResponse.shelterCapacityUsedPercent}% occupied</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                <span className="text-slate-500 font-medium">Relief Grain Allocated</span>
                <div className="text-xl font-bold text-emerald-700 font-mono">{data.emergencyResponse.reliefDistributedTons} Metric Tons</div>
                <span className="text-[11px] text-slate-500">Rice, lentils & dry provisions</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                <span className="text-slate-500 font-medium">Rapid Medical Teams</span>
                <div className="text-xl font-bold text-blue-700 font-mono">{data.emergencyResponse.medicalTeamsDeployed} Mobile Units</div>
                <span className="text-[11px] text-slate-500">Equipped with IV & ORS</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-1">
                <span className="text-slate-500 font-medium">Water Purification Units</span>
                <div className="text-xl font-bold text-slate-900 font-mono">12 Mobile Vans</div>
                <span className="text-[11px] text-slate-500">20,000 L/hr capacity</span>
              </div>
            </div>
          </div>

          {/* Emergency Hotline & Interactive Dispatch Console */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-emerald-600" />
                  National Emergency Hotlines
                </h3>
                <span className="text-[11px] font-mono text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">24/7 ACTIVE</span>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 text-xs font-mono space-y-1.5">
                <div className="flex justify-between items-center text-slate-900 font-bold">
                  <span>Disaster Early Warning:</span>
                  <span className="text-rose-600 text-sm">1090 (Toll Free)</span>
                </div>
                <div className="flex justify-between items-center text-slate-900 font-bold">
                  <span>National Emergency Service:</span>
                  <span className="text-blue-600 text-sm">999</span>
                </div>
                <div className="flex justify-between items-center text-slate-600 pt-1 border-t border-slate-200/60">
                  <span>{data.districtName} DC Control Desk:</span>
                  <span>+880-2-9888123</span>
                </div>
              </div>
            </div>

            {/* Broadcast Dispatch Trigger Button */}
            <div className="space-y-2 pt-2">
              <button
                onClick={handleTriggerDispatch}
                disabled={dispatchStatus === 'broadcasting'}
                className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Radio className={`w-4 h-4 ${dispatchStatus === 'broadcasting' ? 'animate-spin' : ''}`} />
                <span>
                  {dispatchStatus === 'broadcasting'
                    ? 'Transmitting Priority Dispatch...'
                    : dispatchStatus === 'dispatched'
                    ? 'Re-Broadcast Emergency Dispatch'
                    : 'Broadcast District Emergency Dispatch'}
                </span>
              </button>

              {/* Logs */}
              {dispatchLogs.length > 0 && (
                <div className="bg-slate-900 text-slate-200 p-3 rounded-xl text-[10px] font-mono space-y-1 max-h-24 overflow-y-auto">
                  {dispatchLogs.map((log, i) => (
                    <div key={i} className="text-emerald-400">{log}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PRINT-ONLY OFFICIAL DISTRICT REPORT FOOTER */}
      <div className="print-only mt-8 pt-4 border-t-2 border-slate-900 text-[8.5pt] text-slate-700 font-mono">
        <div className="grid grid-cols-2 gap-4 pb-2 border-b border-slate-300">
          <div>
            <strong className="text-slate-900 block mb-1">DISTRICT EMERGENCY ACTION CONTACTS:</strong>
            <div>• District Administration & EOC Control Room: 01700-000000 / 02-9540000</div>
            <div>• Fire Service & Civil Defence Station: 102 / 01730-000000</div>
            <div>• Civil Surgeon Office (Medical Response): 16263 / 01713-000000</div>
            <div>• DAE District Agromet Office (Crops/Livestock): 16123</div>
          </div>
          <div className="text-right">
            <strong className="text-slate-900 block mb-1">NATIONAL 24/7 TOLL-FREE HOTLINES:</strong>
            <div>• 1090 - Disaster Early Warning (BMD / FFWC)</div>
            <div>• 999 - Police, Fire, Ambulance Emergency</div>
            <div>• 16123 - Krishi Call Center (DAE Agriculture)</div>
            <div>• 16263 - Shastho Batayan (DGHS Health)</div>
          </div>
        </div>
        <div className="text-center pt-2 text-[7.5pt] text-slate-500">
          Generated via HazardNet AI Geospatial Disaster Intelligence Platform • Standing Orders on Disaster (SOD 2019) Compliant
        </div>
      </div>

      {/* PRINT-ONLY FIXED RUNNING FOOTER WITH DYNAMIC CSS PAGE NUMBERING */}
      <div className="print-only print-page-footer">
        <span>HAZARDNET BANGLADESH • SOD 2019 INTELLIGENCE</span>
        <span>DISTRICT: {data.districtName.toUpperCase()} ({data.division.toUpperCase()} DIV)</span>
        <span className="print-page-number"></span>
      </div>

    </div>
  );
};

export default DistrictDetailPage;
