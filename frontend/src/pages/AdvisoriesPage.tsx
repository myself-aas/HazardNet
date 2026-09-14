import { AccessibleDialog } from '../components/ui/AccessibleDialog';
import { useHazardContext } from '../hooks/useHazardContext';
import { districtFor, dhakaTime } from '../lib/hazardUx';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  X
} from 'lucide-react';

import MaterialIcon from '../components/MaterialIcon';
import { SECTOR_ADVISORIES, SectorAdvisoryData, TechnicalStep } from '../data/sectorAdvisoriesData';
import { ALL_64_DISTRICTS } from '../data/bangladeshDistricts';
import { StructuredAdvisoryRenderer } from '../components/StructuredAdvisoryRenderer';
import { PrintQrCode } from '../components/PrintQrCode';
import { PdfExportButton } from '../components/PdfExportButton';

export const AdvisoriesPage: React.FC = () => {
  const { subCategory } = useParams<{ subCategory?: string }>();
  const navigate = useNavigate();
  const { horizon, district: contextDistrict, params } = useHazardContext();
  const contextName = districtFor(contextDistrict)?.name || '';


  // Active sector resolution
  const activeSectorId = subCategory && SECTOR_ADVISORIES[subCategory] ? subCategory : 'crops';
  const sector: SectorAdvisoryData = SECTOR_ADVISORIES[activeSectorId] || SECTOR_ADVISORIES['crops'];

  // Redirect /advisories to /advisories/crops for unique clean URL
  useEffect(() => {
    if (!subCategory || !SECTOR_ADVISORIES[subCategory]) {
      navigate(`/advisories/crops?${params.toString()}`, { replace: true });
    }
  }, [subCategory, navigate]);

  // Phase filtering state
  const [selectedPhase, setSelectedPhase] = useState<'all' | 'pre-disaster' | 'during-event' | 'post-disaster'>('all');
  
  // Interactive Email Modal State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedDistrictForEmail, setSelectedDistrictForEmail] = useState<string>(contextName);
  const [affectedUpazilas, setAffectedUpazilas] = useState<string>('');
  const [customOfficerName, setCustomOfficerName] = useState<string>('');
  const [customOfficerPhone, setCustomOfficerPhone] = useState<string>('');
  const [customDamageArea, setCustomDamageArea] = useState<string>('');

  // Gemini Live AI Advisory Generator State
  const [showAiSynthesizer, setShowAiSynthesizer] = useState(false);
  const [aiDistrict, setAiDistrict] = useState<string>(contextName);
  const [aiHazard, setAiHazard] = useState<string>('Monsoon Flood');
  const [aiSeverity, setAiSeverity] = useState<number>(0.85);
  const [aiConfidence, setAiConfidence] = useState<number>(0.92);
  const [aiCropContext, setAiCropContext] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiAdvisoryData, setAiAdvisoryData] = useState<any | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => { setSelectedDistrictForEmail(contextName); setAiDistrict(contextName); setAffectedUpazilas(''); }, [contextName]);
  useEffect(() => { requestRef.current?.abort(); setAiAdvisoryData(null); setAiLoading(false); return () => requestRef.current?.abort(); }, [aiDistrict, aiHazard, aiSeverity, aiConfidence, aiCropContext, horizon]);

  // Filtered steps
  const filteredProtocols = selectedPhase === 'all'
    ? sector.phasedProtocols
    : sector.phasedProtocols.filter(p => p.phase === selectedPhase);

  // Generate dynamic email body
  const generatePopulatedEmail = () => {
    let body = sector.emailTemplate.bodyStructure;
    body = body.replace(/\[DISTRICT_NAME\]/g, selectedDistrictForEmail || '[Select district]');
    body = body.replace(/\[UPAZILAS_AFFECTED\]/g, affectedUpazilas || '[Upazilas]');
    body = body.replace(/\[AREA_IN_HECTARES\]/g, customDamageArea || 'Unknown / not assessed');
    body = body.replace(/\[OFFICER_NAME\]/g, customOfficerName || '[Your name and role]');
    body = body.replace(/\[OFFICER_PHONE\]/g, customOfficerPhone || '+8801XXXXXXXXX');
    body = body.replace(/\[YOUR_NAME_AND_DESIGNATION\]/g, customOfficerName || '[Your name and role]');
    body = body.replace(/\[PHONE_NUMBER\]/g, customOfficerPhone || '+8801XXXXXXXXX');
    return `UNSENT DRAFT — review all facts and verify the recipient. Not a government directive.\n\n${body}`;
  };

  const handleCopyEmail = async () => {
    const emailText = `To: ${sector.emailTemplate.recipientDefault}\nSubject: ${sector.emailTemplate.subject.replace(/\[DISTRICT_NAME\]/g, selectedDistrictForEmail)}\n\n${generatePopulatedEmail()}`;
    try { await navigator.clipboard.writeText(emailText); } catch { toast.error('Copy failed. Select and copy the preview below.'); return; }
    toast.success('Unsent draft copied. Nothing has been sent.', {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />
    });
  };

  const handleLaunchMailClient = () => {
    const to = encodeURIComponent(sector.emailTemplate.recipientDefault);
    const subject = encodeURIComponent(sector.emailTemplate.subject.replace(/\[DISTRICT_NAME\]/g, selectedDistrictForEmail));
    const body = encodeURIComponent(generatePopulatedEmail());
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const handleCopyUrl = async () => {
    try { await navigator.clipboard.writeText(window.location.href); } catch { toast.error('Copy failed. Copy the address from your browser.'); return; }
    toast.success(`Copied unique URL for ${sector.name} to clipboard!`, {
      icon: <Copy className="w-4 h-4 text-emerald-600" />
    });
  };

  // Trigger Live AI Advisory Synthesis
  const handleGenerateAiAdvisory = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      if (!aiDistrict) throw new Error('Choose a district before generating guidance.');
      requestRef.current?.abort();
      const controller = new AbortController(); requestRef.current = controller;
      const response = await fetch('/api/advisory', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          district_name: aiDistrict,
          hazard_type: aiHazard,
          severity_score: aiSeverity,
          confidence: aiConfidence,
          crop_context: aiCropContext,
          target_date: new Date(Date.now() + (horizon === '15_days' ? 15 : 7) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        })
      });

      if (!response.ok) {
        throw new Error(`AI Engine error (${response.status})`);
      }

      const data = await response.json();
      if (controller.signal.aborted) return;
      setAiAdvisoryData(data);
      toast.success(`Generated experimental scenario guidance for ${aiDistrict}!`, {
        icon: <Sparkles className="w-4 h-4 text-amber-500" />
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Failed to generate advisory:', err);
      setAiError(err.message || 'Failed to synthesize advisory.');
      toast.error('Could not reach Gemini API. Reference guidance remains available. Retry when connected.');
    } finally {
      setAiLoading(false);
    }
  };

  const sectorList = Object.values(SECTOR_ADVISORIES);

  return (
    <motion.div
      id="advisory-bulletin-container"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="max-w-7xl mx-auto space-y-8 pb-16"
    >
      <section className="hn-panel"><h2>What to do · {contextName || 'Choose your district'}</h2><p>Selected forecast period: {horizon === '15_days' ? '15 days' : '7 days'}. Reference guidance is not a current official warning. AI inputs below are editable scenario assumptions, not observed facts. Verify the district, hazard, severity and crop before generating guidance.</p></section>
      {/* PRINT-ONLY OFFICIAL EMERGENCY BULLETIN HEADER */}
      <div className="print-only mb-6 border-b-2 border-slate-900 pb-4">
        <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-3 text-[9pt] font-mono font-bold text-slate-700">
          <span>HAZARDNET · INDEPENDENT EXPERIMENTAL GUIDANCE</span>
          <span>REFERENCE MATERIAL — VERIFY WITH OFFICIAL SOURCES</span>
          <span>NOT AN EMERGENCY DISPATCH</span>
        </div>
        
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              HAZARDNET · REFERENCE GUIDANCE (NOT GOVERNMENT-ISSUED)
            </h1>
            <p className="text-xs text-slate-800 font-bold mt-0.5">
              Sector: {sector.name} ({sector.code}) • Standard Operating Procedures & Technical Action Matrix
            </p>

            {/* Prominent 'Last Updated' Timestamp and Advisory Currency Validity Indicator */}
            <div className="flex flex-wrap items-center gap-2 mt-2 pt-1 border-t border-slate-200 text-[8pt] font-mono">
              <span className="print-last-updated">
                <strong>DOCUMENT PREPARED:</strong> {dhakaTime(new Date().toISOString())}
              </span>
              <span className="print-currency-tag">
                VALIDITY: 24-HOUR EARLY WARNING WINDOW
              </span>
            </div>
          </div>

          {/* Dedicated Vector QR Code for Physical Handouts */}
          <div className="shrink-0">
            <PrintQrCode
              url={new URL(`/advisories/${activeSectorId}?${params.toString()}`, window.location.origin).href}
              districtOrSector={sector.name}
              title="Live Sector Directive"
              subtitle="Scan for real-time telemetry & AI hazard forecasts"
              size={72}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-[8pt] font-mono text-slate-600">
          <div>Coordinating Authority: DAE / DLS / DoF / DGHS / MoDMR / FFWC</div>
          <div>Advisory Status: ACTIVE FIELD OPERATIONAL PROTOCOL</div>
        </div>
      </div>

      {/* 1. SECTOR ROUTE NAVIGATOR (Unique URL per Sector) */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-4 sm:p-6 shadow-md space-y-4 screen-only">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-800 text-xs font-mono font-bold mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>NATIONAL STANDARD OPERATING PROCEDURES (SOP)</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Sectoral Hazard Directives & Emergency Protocols
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
              Reference guidance and contact links. Verify current instructions and contact details with the responsible institution before use.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer"
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
                to={`/advisories/${sec.id}`}
                className={`flex flex-col items-start p-3.5 rounded-2xl border transition-all text-left group ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-amber-400/40'
                    : 'bg-slate-50/80 text-slate-700 border-slate-200/80 hover:bg-white hover:border-slate-300 hover:shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span
                    className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-md ${
                      isActive ? 'bg-amber-400 text-slate-950' : 'bg-slate-200/80 text-slate-700'
                    }`}
                  >
                    {sec.code}
                  </span>
                  <MaterialIcon
                    name={sec.iconName}
                    className={`text-lg ${isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-700'}`}
                  />
                </div>
                <span className="text-xs font-extrabold leading-tight">{sec.name}</span>
                <span
                  className={`text-[10.5px] mt-1 line-clamp-1 font-medium ${
                    isActive ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {sec.leadAuthorities[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 2. ACTIVE SECTOR EXECUTIVE INTELLIGENCE & MANDATE */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                {sector.code}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-900 border border-emerald-200">
                {sector.badge}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-mono text-slate-500 bg-slate-100 border border-slate-200">
                URL: /advisories/{sector.id}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {sector.fullTitle}
            </h2>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
              {sector.executiveSummary}
            </p>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-950 space-y-1">
              <span className="font-mono font-black uppercase tracking-wider text-[11px] block text-amber-900">
                Statutory Reference & Mandate:
              </span>
              <p className="font-semibold text-slate-800">{sector.sodReference}</p>
            </div>
          </div>

          {/* Quick Action Box */}
          <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 lg:w-80 shrink-0 space-y-4 shadow-md border border-slate-800">
            <div className="flex items-center gap-2 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
              <span className="text-xs font-mono font-black tracking-wider uppercase">Emergency Action Desk</span>
            </div>
            <p className="text-[11.5px] text-slate-300 leading-snug">
              Reference coordination contacts; verify availability independently. HazardNet does not operate a coordination desk.
            </p>
            <div className="space-y-2 pt-1 screen-only">
              <button
                onClick={() => setIsEmailModalOpen(true)}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-400 text-slate-950 font-black text-xs hover:bg-amber-300 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Draft Emergency Requisition</span>
              </button>
              <button
                onClick={() => setShowAiSynthesizer(!showAiSynthesizer)}
                className={`w-full py-2 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  showAiSynthesizer
                    ? 'bg-slate-800 text-amber-300 border border-amber-400/40'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-amber-400" />
                <span>{showAiSynthesizer ? 'Hide AI Synthesizer' : 'Synthesize Gemini Advisory'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Issuing Authorities & Vulnerability Profiles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div className="space-y-2">
            <span className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider block">
              Lead Issuing Authorities:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {sector.leadAuthorities.map((auth, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold"
                >
                  {auth}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-mono font-black text-slate-900 uppercase tracking-wider block">
              Hazard Vulnerability Profile:
            </span>
            <p className="text-xs text-slate-600 leading-relaxed font-normal">
              {sector.hazardVulnerabilitySummary}
            </p>
          </div>
        </div>
      </div>

      {/* 3. LIVE GEMINI AI ADVISORY SYNTHESIZER (EXPANDABLE) */}
      <AnimatePresence>
        {showAiSynthesizer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                      <span>Generate scenario guidance</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-mono font-black">SCENARIO</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Experimental guidance based on the inputs below, not live observations. Review every recommendation.
                    </p>
                  </div>
                </div>
                <button
                  aria-label="Close scenario generator" onClick={() => setShowAiSynthesizer(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 self-start sm:self-auto cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Simulation Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono font-bold text-slate-300">TARGET DISTRICT (64):</label>
                  <select
                    value={aiDistrict}
                    onChange={(e) => setAiDistrict(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Select district</option>
                    {ALL_64_DISTRICTS.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} ({d.division})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono font-bold text-slate-300">HAZARD PROFILE:</label>
                  <select
                    value={aiHazard}
                    onChange={(e) => setAiHazard(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-amber-400"
                  >
                    <option value="Monsoon Flood">Monsoon Riverine Flood</option>
                    <option value="Flash Flood">Northeastern Flash Flood (Haor)</option>
                    <option value="Tropical Cyclone">Tropical Cyclone & Storm Surge</option>
                    <option value="Salinity Intrusion">Coastal Salinity Shock</option>
                    <option value="Drought">Barind Drought & Heatwave</option>
                    <option value="Cold Wave">Winter Dense Fog & Cold Wave</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono font-bold text-slate-300">SEVERITY INDEX ({aiSeverity}):</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={aiSeverity}
                    onChange={(e) => setAiSeverity(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>Watch (0.1)</span>
                    <span>Warning (0.5)</span>
                    <span className="text-rose-400 font-bold">Emergency (1.0)</span>
                  </div>
                </div>

                <div className="space-y-1.5 flex flex-col justify-end">
                  <button
                    onClick={handleGenerateAiAdvisory}
                    disabled={aiLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>Inferencing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Synthesize AI Advisory</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* AI Advisory Result Output */}
              {aiLoading && (
                <div className="p-6 sm:p-8 rounded-2xl bg-slate-800/80 border border-slate-700 text-center space-y-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin mx-auto"></div>
                  <p className="text-xs text-slate-300 font-mono">Querying Gemini 2.5 API with {aiDistrict} agro-ecological context & {sector.code} directives...</p>
                </div>
              )}

              {aiError && !aiLoading && (
                <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-200 text-xs">
                  <p className="font-bold">Notice:</p>
                  <p>{aiError}</p>
                </div>
              )}

              {aiAdvisoryData && !aiLoading && (
                <div className="bg-white text-slate-900 rounded-2xl p-5 sm:p-6 shadow-lg border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                    <div>
                      <h4 className="text-sm font-black text-slate-900">
                        Synthesized AI Advisory for {aiDistrict} ({aiHazard})
                      </h4>
                      <p className="text-xs text-slate-500 font-mono">
                        Urgency: {aiAdvisoryData.urgency_tier || aiAdvisoryData.urgency_level || 'HIGH'} • Engine: {aiAdvisoryData.provider_source || 'Gemini'}
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-black bg-amber-100 text-amber-950 border border-amber-300">
                      CONFIDENCE: {Math.round(aiConfidence * 100)}%
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-mono font-bold text-xs">
              SOP
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">
                Step-by-Step Technical Standard Operating Procedures
              </h3>
              <p className="text-xs text-slate-500">
                Actionable execution directives formulated by national research directorates and line ministries.
              </p>
            </div>
          </div>

          {/* Phase Filter Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 shrink min-w-0 self-start sm:self-auto max-w-full overflow-x-auto">
            {[
              { id: 'all', label: 'All Phases' },
              { id: 'pre-disaster', label: '1. Pre-Disaster (T-72h)' },
              { id: 'during-event', label: '2. During Event (T-0)' },
              { id: 'post-disaster', label: '3. Post Recovery (T+3d)' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedPhase(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  selectedPhase === tab.id
                    ? 'bg-white text-slate-950 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.05 }}
                className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-md space-y-4 hover:border-slate-300 transition-all"
              >
                {/* Step Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center font-mono font-black text-xs text-slate-900 shrink-0">
                      {step.stepNumber}
                    </span>
                    <div>
                      <h4 className="text-base font-black text-slate-900 tracking-tight">
                        {step.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-semibold text-slate-500">
                          Lead: {step.leadAgency}
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-[11px] font-mono text-slate-600 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {step.timeline}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span className={`text-[11px] font-mono font-black px-3 py-1 rounded-full border self-start sm:self-auto ${phaseBadgeColor}`}>
                    {phaseLabel}
                  </span>
                </div>

                {/* Trigger Threshold Banner */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-start gap-3 text-xs">
                  <div className="p-1 rounded-lg bg-amber-100 text-amber-900 shrink-0 mt-0.5">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-mono font-black text-slate-900 uppercase tracking-wider block text-[10.5px]">
                      Operational Trigger Threshold:
                    </span>
                    <p className="text-slate-700 mt-0.5">{step.triggerThreshold}</p>
                  </div>
                </div>

                {/* Detailed Actionable Protocol */}
                <div className="text-xs sm:text-sm text-slate-800 leading-relaxed font-normal space-y-2">
                  <p>{step.detailedProtocol}</p>
                </div>

                {/* Technical Specs & Equipment */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Technical Specifications */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono font-black text-slate-900 uppercase tracking-wider block">
                      Quantitative Technical Parameters:
                    </span>
                    <ul className="space-y-1 text-xs text-slate-600">
                      {step.technicalSpecs.map((spec, sIdx) => (
                        <li key={sIdx} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1.5"></span>
                          <span>{spec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Equipment & Logistics */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono font-black text-slate-900 uppercase tracking-wider block">
                      Required Equipment & Logistics:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {step.equipmentNeeded.map((eq, eIdx) => (
                        <span
                          key={eIdx}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold"
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
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <Wheat className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Recommended Stress-Tolerant Varieties & Input Dosage Specifications
              </h3>
              <p className="text-xs text-slate-500">
                Peer-reviewed agricultural varieties, chemical dosing ratios, and biosecurity protocols.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
            SPEC-MATRIX
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              {/* Repeated Emergency Protocol Header Row on Every Printed Page */}
              <tr className="print-table-emergency-header">
                <th colSpan={5} className="emergency-protocol-title">
                  🚨 EMERGENCY PROTOCOL & TECHNICAL SPECIFICATION MATRIX (SOD 2019) • {sector.name.toUpperCase()} SECTOR
                </th>
              </tr>
              <tr className="border-b border-slate-200 text-slate-500 font-mono text-[11px]">
                <th className="py-3 px-4 font-bold">NAME / CULTIVAR</th>
                <th className="py-3 px-4 font-bold">CATEGORY</th>
                <th className="py-3 px-4 font-bold">TOLERANCE CAPACITY</th>
                <th className="py-3 px-4 font-bold">RECOMMENDED DOSAGE / SEED RATE</th>
                <th className="py-3 px-4 font-bold">TARGET HAZARD / ZONE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sector.technicalSpecs.map((item, i) => (
                <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4 font-extrabold text-slate-900 whitespace-nowrap">
                    {item.name}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10.5px] font-bold">
                      {item.category}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700 font-medium max-w-xs">
                    {item.toleranceLevel}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-900 font-bold max-w-xs">
                    {item.recommendedDosage}
                  </td>
                  <td className="py-3.5 px-4 text-slate-600 max-w-xs">
                    {item.targetCondition}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. OFFICIAL DOCUMENTATION & HYPERLINKED PORTALS */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Official Portals, National Gazettes & Verified Research Docs
              </h3>
              <p className="text-xs text-slate-500">
                Direct external hyperlinks to Bangladesh government ministries and international UN repositories.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">
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
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col justify-between group cursor-pointer shadow-2xs space-y-3"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-md text-[10.5px] font-mono font-bold bg-blue-100 text-blue-950 border border-blue-200">
                    {doc.docType}
                  </span>
                  <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                </div>
                <h4 className="text-sm font-black text-slate-900 group-hover:text-blue-900 leading-snug">
                  {doc.title}
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                  {doc.description}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-500 font-medium truncate max-w-[180px]">
                  {doc.issuingBody}
                </span>
                <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1 group-hover:underline">
                  <span>Visit Portal</span>
                  <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* 7. OFFICIAL CONTACT INFORMATION & EMERGENCY SUPPORT DIRECTORY */}
      <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                Official Contacts & Direct Emergency Support Channels
              </h3>
              <p className="text-xs text-slate-500">
                Direct phone hotlines, official desk emails, and physical headquarters for requisitioning government and UN emergency assistance.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsEmailModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-xs self-start sm:self-auto"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            <span>Open Emergency Email Composer</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sector.emergencyContacts.map((contact, cIdx) => (
            <div
              key={cIdx}
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col justify-between space-y-4 hover:shadow-xs transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10.5px] font-mono font-bold px-2 py-0.5 rounded-md ${
                      contact.scope === 'Government of Bangladesh'
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-200'
                        : 'bg-indigo-100 text-indigo-950 border border-indigo-200'
                    }`}
                  >
                    {contact.scope}
                  </span>
                </div>
                <h4 className="text-sm font-black text-slate-900 leading-snug">
                  {contact.agencyName}
                </h4>
                <p className="text-xs font-semibold text-slate-600">
                  {contact.departmentOrCell}
                </p>
                <p className="text-[11px] text-slate-500">
                  Role: {contact.roleOrDesignation}
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-200 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5 text-slate-400" />
                    <span>Hotline:</span>
                  </span>
                  <a
                    href={`tel:${contact.hotline.split(' ')[0]}`}
                    className="font-mono font-extrabold text-slate-900 hover:text-emerald-700"
                  >
                    {contact.hotline}
                  </a>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Official Email:</span>
                  </span>
                  <a
                    href={`mailto:${contact.officialEmail}`}
                    className="font-mono text-blue-700 hover:underline font-bold text-[11px]"
                  >
                    {contact.officialEmail}
                  </a>
                </div>

                <div className="pt-1 text-[11px] text-slate-500 flex items-start gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{contact.address}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PRINT-ONLY OFFICIAL BULLETIN FOOTER */}
      <div className="print-only mt-8 pt-4 border-t-2 border-slate-900 text-[8.5pt] text-slate-700 font-mono">
        <div className="grid grid-cols-2 gap-4 pb-2 border-b border-slate-300">
          <div>
            <strong className="text-slate-900 block mb-1">NATIONAL TOLL-FREE EMERGENCY HOTLINES:</strong>
            <div>• Disaster Early Warning: 1090 (24/7 Toll-Free BMD/FFWC)</div>
            <div>• National Emergency Services: 999 (Police, Fire, Medical)</div>
            <div>• Agriculture Call Center: 16123 (Krishi Desk DAE)</div>
            <div>• Livestock & Veterinary: 16358 | Health Hotline: 16263</div>
          </div>
          <div className="text-right">
            <strong className="text-slate-900 block mb-1">UNSENT REFERENCE DOCUMENT:</strong>
            <div>HazardNet Bangladesh Disaster Intelligence System</div>
            <div>Statutory Alignment: Standing Orders on Disaster (SOD 2019)</div>
            <div>Experimental guidance — independently verify before use</div>
          </div>
        </div>
        <div className="text-center pt-2 text-[7.5pt] text-slate-500">
          HazardNet reference material. Not issued by a government agency and not a dispatch receipt.
        </div>
      </div>

      {/* PRINT-ONLY FIXED RUNNING FOOTER WITH DYNAMIC CSS PAGE NUMBERING */}
      <div className="print-only print-page-footer">
        <span>HAZARDNET · REFERENCE GUIDANCE</span>
        <span>SECTOR: {sector.name.toUpperCase()} ({sector.code})</span>
        <span className="print-page-number"></span>
      </div>

      {/* 8. EMERGENCY EMAIL REQUISITION MODAL */}
      <AnimatePresence>
        {isEmailModalOpen && (
          <AccessibleDialog title="Unsent assistance email draft" onClose={() => setIsEmailModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl border border-slate-200 max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-950">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      Emergency Assistance Email Requisition Generator
                    </h3>
                    <p className="text-xs text-slate-500 font-mono">
                      Pre-formatted official communication aligned with SOD 2019 standards
                    </p>
                  </div>
                </div>
                <button
                  aria-label="Close email draft" onClick={() => setIsEmailModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Controls to Customize Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700" htmlFor="draft-selectedDistrictForEmail">Select Affected District:</label>
                  <select
                    id="draft-selectedDistrictForEmail" value={selectedDistrictForEmail}
                    onChange={(e) => { setSelectedDistrictForEmail(e.target.value); setAffectedUpazilas(''); }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                  >
                    <option value="">Select district</option>
                    {ALL_64_DISTRICTS.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} ({d.division})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700" htmlFor="draft-affectedUpazilas">Affected Upazilas / Unions:</label>
                  <input
                    type="text"
                    id="draft-affectedUpazilas" value={affectedUpazilas}
                    onChange={(e) => setAffectedUpazilas(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                    placeholder="e.g. Chilmari, Ulipur, Roumari"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700" htmlFor="draft-customOfficerName">Coordinator / Officer Name & Role:</label>
                  <input
                    type="text"
                    id="draft-customOfficerName" value={customOfficerName}
                    onChange={(e) => setCustomOfficerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                    placeholder="e.g. Md. Rafiqul Islam (Upazila Coordinator)"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700" htmlFor="draft-customOfficerPhone">Officer Phone / Hotline:</label>
                  <input
                    type="text"
                    id="draft-customOfficerPhone" value={customOfficerPhone}
                    onChange={(e) => setCustomOfficerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-900"
                    placeholder="e.g. +8801712-345678"
                  />
                </div>
              </div>

              {/* Preview of Email */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">Structured Requisition Body Preview:</span>
                  <span className="font-mono text-slate-500">Recipients: {sector.emailTemplate.recipientDefault}</span>
                </div>
                <textarea
                  aria-label="Unsent email preview"
                  readOnly
                  rows={10}
                  value={generatePopulatedEmail()}
                  className="w-full p-4 rounded-2xl bg-slate-900 text-slate-100 font-mono text-xs leading-relaxed focus:outline-none resize-none border border-slate-800"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <span className="text-xs text-slate-500">
                  Unsent draft. Verify all fields and recipient. Opening your mail app does not send this request.
                </span>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={handleCopyEmail}
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Structured Email</span>
                  </button>

                  <button
                    onClick={handleLaunchMailClient}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Send className="w-4 h-4 text-amber-400" />
                    <span>Open in Email App</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </AccessibleDialog>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default AdvisoriesPage;
