import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  FileDown,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ShieldAlert,
  QrCode,
  Clock,
  Smartphone,
  Eye,
  CheckCircle2,
  RefreshCw,
  Copy,
  Layers,
  Sparkles,
  SunMedium,
  Moon,
  RotateCw,
  FileSpreadsheet,
  AlertTriangle,
  Radio,
  Sliders,
} from 'lucide-react';
import { exportElementToPdf, PdfFilenameContext, formatFilenameWithPlaceholders } from '../utils/pdfExport';
import { PdfExportConfigModal } from './PdfExportConfigModal';
import toast from 'react-hot-toast';

export interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId?: string;
  customElement?: HTMLElement;
  title?: string;
  documentType?: string;
  filename?: string;
  regionName?: string;
  districtName?: string;
  hazardType?: string;
  filenameContext?: PdfFilenameContext;
  onOpenConfigModal?: () => void;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  elementId = 'advisory-bulletin-container',
  customElement,
  title = 'HazardNet Official Emergency Advisory Handout',
  documentType = 'Emergency Operational Directive',
  filename,
  regionName,
  districtName,
  hazardType,
  filenameContext = {},
  onOpenConfigModal,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [clonedContent, setClonedContent] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; stage: string }>({ percent: 0, stage: '' });
  const [viewMode, setViewMode] = useState<'a4-sheet' | 'continuous'>('a4-sheet');
  const [inkSaverMode, setInkSaverMode] = useState<boolean>(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  
  const previewPaperRef = useRef<HTMLDivElement>(null);
  const dispatchRef = useRef<string>(`HN-BD-${new Date().getFullYear()}-${Date.now().toString(36).slice(-5).toUpperCase()}`);

  const resolvedRegion = regionName || districtName || filenameContext.region || filenameContext.district || 'National';
  const resolvedHazard = hazardType || filenameContext.hazard || filenameContext.hazardType || 'Disaster_Alert';

  const mergedContext: PdfFilenameContext = {
    documentType,
    docType: documentType,
    region: resolvedRegion,
    district: resolvedRegion,
    hazard: resolvedHazard,
    hazardType: resolvedHazard,
    dispatchRef: dispatchRef.current,
    ...filenameContext,
  };

  const initialTemplate =
    filename ||
    (resolvedRegion && resolvedRegion !== 'National'
      ? 'HazardNet_{docType}_{region}_{date}.pdf'
      : 'HazardNet_{docType}_{date}.pdf');

  // Capture, sanitize and prepare DOM content whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    let sourceEl: HTMLElement | null = null;
    if (customElement) {
      sourceEl = customElement;
    } else if (elementId) {
      sourceEl = document.getElementById(elementId);
    } else {
      sourceEl = (document.querySelector('.max-w-[840px]') ||
        document.querySelector('.max-w-7xl') ||
        document.body) as HTMLElement;
    }

    if (sourceEl) {
      // Clone element cleanly
      const clone = sourceEl.cloneNode(true) as HTMLElement;

      // 1. Remove duplicate inner print-only headers and inner footers because
      // PrintPreviewModal renders the official master A4 header & footer!
      clone.querySelectorAll('.print-only.border-b-2, .print-only.print-page-footer, .print-only.mt-8, .print-only.p-4.border-2').forEach((el) => {
        el.remove();
      });

      // 2. Force show remaining print-only elements (e.g. uncollapsed details, tables, QR codes)
      clone.querySelectorAll('.print-only').forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'block', 'important');
      });

      clone.querySelectorAll('.print-qr-code-box').forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'flex', 'important');
      });

      // 3. Remove screen-only interactive navigation, buttons, selectors, tabs, chatbot
      clone.querySelectorAll('.no-print, .screen-only, button:not(.print-keep), input, select, textarea').forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'none', 'important');
      });

      // 4. Uncollapse all details/accordions
      clone.querySelectorAll('details').forEach((details) => {
        details.setAttribute('open', 'true');
      });
      clone.querySelectorAll('[hidden]').forEach((hiddenEl) => {
        hiddenEl.removeAttribute('hidden');
      });

      // 5. Reset scroll heights on inner containers
      clone.querySelectorAll('[class*="overflow-y-auto"], [class*="max-h-"]').forEach((scrollEl) => {
        (scrollEl as HTMLElement).style.setProperty('max-height', 'none', 'important');
        (scrollEl as HTMLElement).style.setProperty('overflow', 'visible', 'important');
      });

      setClonedContent(clone.innerHTML);
    } else {
      setClonedContent('');
    }

    // Keyboard shortcuts: ESC, Ctrl+P, +/-, 0
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        handleNativePrint();
      } else if (e.key === '+' || (e.ctrlKey && e.key === '=')) {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(160, prev + 15));
      } else if (e.key === '-' || (e.ctrlKey && e.key === '-')) {
        e.preventDefault();
        setZoomLevel((prev) => Math.max(50, prev - 15));
      } else if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setZoomLevel(100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, elementId, customElement]);

  if (!isOpen) return null;

  const handleNativePrint = () => {
    window.print();
  };

  const handleOpenConfigureExport = () => {
    if (onOpenConfigModal) {
      onClose();
      onOpenConfigModal();
    } else {
      setIsConfigOpen(true);
    }
  };

  const handleQuickDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setExportProgress({ percent: 10, stage: 'Preparing PDF...' });
    const evaluated = formatFilenameWithPlaceholders(initialTemplate, mergedContext);
    const toastId = toast.loading(`Generating official ${documentType} PDF...`);

    try {
      await exportElementToPdf({
        elementId,
        customElement,
        filename: evaluated,
        filenameTemplate: initialTemplate,
        filenameContext: mergedContext,
        documentType,
        orientation,
        inkSaver: inkSaverMode,
        onProgress: (percent, stage) => {
          setExportProgress({ percent, stage });
          toast.loading(`${stage} (${percent}%)`, { id: toastId });
        },
        onComplete: () => {
          toast.success(`Official PDF exported as "${evaluated}"!`, { id: toastId, duration: 4000 });
        },
      });
    } catch (err) {
      toast.error('Failed to generate PDF. You can print directly to PDF via Browser Print.', { id: toastId });
    } finally {
      setIsExportingPdf(false);
      setExportProgress({ percent: 0, stage: '' });
    }
  };

  const handleCopySummary = () => {
    if (!previewPaperRef.current) return;
    const plainText = previewPaperRef.current.innerText || '';
    navigator.clipboard.writeText(plainText);
    setCopiedText(true);
    toast.success('Document text summary copied to clipboard for field radio dispatch!');
    setTimeout(() => setCopiedText(false), 3000);
  };

  const handleZoomChange = (delta: number) => {
    setZoomLevel((prev) => Math.min(160, Math.max(50, prev + delta)));
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-preview-modal-title"
        className="print-preview-modal-root fixed inset-0 z-[9999] flex flex-col bg-carbon-black/90 backdrop-blur-md animate-in fade-in duration-200"
      >
        {/* 1. TOP CONTROL TOOLBAR */}
        <div className="print-preview-toolbar screen-only flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-2.5 bg-carbon-90 border-b border-carbon-80 text-white shrink-0 shadow-lg">
          {/* Left: Title, Badges & Verification */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 shrink-0">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="print-preview-modal-title" className="text-sm sm:text-base font-black text-white tracking-tight truncate max-w-sm sm:max-w-md">
                  {title}
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  SOD 2019 VERIFIED
                </span>
                <span className="hidden lg:inline-flex px-2 py-0.5 rounded-md bg-carbon-80 border border-carbon-70 text-carbon-30 text-[10px] font-mono">
                  REF: {dispatchRef.current}
                </span>
              </div>
              <p className="text-[11px] text-carbon-60 font-mono truncate">
                {orientation === 'portrait' ? 'A4 Portrait (210×297mm)' : 'A4 Landscape (297×210mm)'} • Real-time QR Mobile Telemetry • High-Contrast Field Standard
              </p>
            </div>
          </div>

          {/* Center/Right: Layout, View & Export Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: A4 Sheets vs Continuous */}
            <div className="hidden sm:flex items-center bg-carbon-80/90 rounded-xl p-0.5 border border-carbon-70">
              <button
                onClick={() => setViewMode('a4-sheet')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'a4-sheet'
                    ? 'bg-carbon-70 text-white shadow-xs'
                    : 'text-carbon-60 hover:text-carbon-20'
                }`}
                title="View as simulated A4 printed sheets with margins"
              >
                A4 Sheet
              </button>
              <button
                onClick={() => setViewMode('continuous')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'continuous'
                    ? 'bg-carbon-70 text-white shadow-xs'
                    : 'text-carbon-60 hover:text-carbon-20'
                }`}
                title="View continuous document stream"
              >
                Continuous
              </button>
            </div>

            {/* Orientation Toggle */}
            <button
              onClick={() => setOrientation((prev) => (prev === 'portrait' ? 'landscape' : 'portrait'))}
              className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-carbon-80 hover:bg-carbon-70 border border-carbon-70 text-carbon-30 text-xs font-bold transition-colors cursor-pointer"
              title={`Switch to ${orientation === 'portrait' ? 'Landscape' : 'Portrait'} layout`}
            >
              <RotateCw className="w-3.5 h-3.5 text-amber-400" />
              <span className="capitalize">{orientation}</span>
            </button>

            {/* Ink Saver Toggle */}
            <button
              onClick={() => setInkSaverMode(!inkSaverMode)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                inkSaverMode
                  ? 'bg-amber-400/20 border-amber-400/50 text-amber-300'
                  : 'bg-carbon-80 hover:bg-carbon-70 border-carbon-70 text-carbon-30'
              }`}
              title="Toggle high-contrast ink-saver mode for thermal and dot-matrix printers"
            >
              <SunMedium className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Ink Saver</span>
            </button>

            {/* Zoom Controls */}
            <div className="hidden lg:flex items-center bg-carbon-80 rounded-xl p-1 border border-carbon-70">
              <button
                onClick={() => handleZoomChange(-15)}
                className="p-1 rounded-lg text-carbon-30 hover:text-white hover:bg-carbon-70 transition-colors"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono font-bold px-2 text-carbon-30 min-w-[44px] text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => handleZoomChange(15)}
                className="p-1 rounded-lg text-carbon-30 hover:text-white hover:bg-carbon-70 transition-colors"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="p-1 rounded-lg text-carbon-30 hover:text-white hover:bg-carbon-70 transition-colors text-[10px] font-mono font-bold px-1.5"
                title="Reset Zoom to 100% (0)"
              >
                100%
              </button>
            </div>

            {/* Copy Text Summary */}
            <button
              onClick={handleCopySummary}
              className="hidden xl:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-carbon-80 hover:bg-carbon-70 border border-carbon-70 text-carbon-30 text-xs font-bold transition-all cursor-pointer"
              title="Copy document plain-text for radio dispatch & field SMS"
            >
              <Copy className="w-3.5 h-3.5 text-carbon-60" />
              <span>{copiedText ? 'Copied!' : 'Copy Text'}</span>
            </button>

            {/* Configure & Download PDF Action */}
            <button
              onClick={handleOpenConfigureExport}
              disabled={isExportingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-carbon-80 hover:bg-carbon-70 border border-carbon-70 text-carbon-20 text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-60"
              title="Customize filename template with date and region placeholders before downloading"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Export PDF...</span>
            </button>

            {/* Trigger Native Print (Primary Action) */}
            <button
              onClick={handleNativePrint}
              className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-nasa-red hover:bg-nasa-red-tint text-carbon-black text-xs font-black transition-all shadow-md cursor-pointer hover:scale-102 active:scale-98"
              title="Trigger Browser Print Dialog (Ctrl+P)"
            >
              <Printer className="w-4 h-4 text-carbon-black shrink-0" />
              <span>Print Report</span>
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl bg-carbon-80 hover:bg-carbon-70 text-carbon-40 hover:text-white transition-colors cursor-pointer"
              title="Close Preview (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. PRINT PREVIEW WORKSPACE / SIMULATED A4 PAPER SHEET */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 flex justify-center items-start bg-carbon-black/70 custom-scrollbar">
          <div
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
            className={`w-full my-2 transition-all ${
              orientation === 'landscape' ? 'max-w-[1140px]' : 'max-w-[840px]'
            }`}
          >
            {/* SIMULATED A4 PRINTED PAPER SHEET */}
            <div
              ref={previewPaperRef}
              className={`print-preview-paper relative bg-white text-carbon-90 rounded-sm shadow-2xl p-6 sm:p-10 md:p-12 border border-carbon-30 min-h-[1160px] overflow-hidden ${
                inkSaverMode ? 'ink-saver-active' : ''
              }`}
            >
              {/* OFFICIAL EMBLEM & DIRECTIVE BANNER FOR A4 DOCUMENT */}
              <div className="border-b-2 border-carbon-90 pb-4 mb-6">
                <div className="flex items-center justify-between border-b border-carbon-30 pb-2 mb-3 text-[8.5pt] font-mono font-bold text-carbon-70">
                  <span>GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH</span>
                  <span>SOD 2019 OPERATIONAL DISPATCH</span>
                  <span>PUBLIC SAFETY COMPLIANT</span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-carbon-90 text-white font-mono text-[7.5pt] font-extrabold uppercase mb-1">
                      OFFICIAL DISASTER EARLY WARNING DIRECTIVE
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-carbon-90 tracking-tight uppercase">
                      HAZARDNET BANGLADESH • {documentType.toUpperCase()}
                    </h1>
                    <p className="text-xs text-carbon-80 font-bold mt-1">
                      National Disaster Management Authority (NDMA) & Agro-Meteorological Advisory Desk
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-1 border-t border-carbon-20 text-[7.5pt] font-mono">
                      <span className="print-last-updated">
                        <strong>GENERATED:</strong> {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} BST
                      </span>
                      <span className="print-currency-tag">
                        DISPATCH REF: {dispatchRef.current}
                      </span>
                      <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold border border-emerald-300">
                        STATUS: ACTIVE OPERATIONAL BULLETIN
                      </span>
                    </div>
                  </div>

                  {/* Vector QR Code Stamp for Live Mobile Telemetry Verification */}
                  <div className="shrink-0">
                    <div className="flex flex-col items-center p-2 bg-carbon-05 border border-carbon-30 rounded-xl">
                      <QrCode className="w-12 h-12 text-carbon-90" />
                      <span className="text-[7pt] font-mono font-black text-carbon-90 mt-1">LIVE DIGITAL FEED</span>
                      <span className="text-[6pt] font-mono text-carbon-60">Scan via Smartphone</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* AUTHENTIC WATERMARK */}
              <div
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[32deg] pointer-events-none select-none z-0 border-2 border-dashed border-carbon-90/4 text-carbon-90/5 font-mono font-black text-sm uppercase tracking-widest p-8 text-center max-w-[560px] leading-relaxed"
              >
                HAZARDNET BANGLADESH • OFFICIAL EMERGENCY ADVISORY • SOD 2019 OPERATIONAL DIRECTIVE • UNRESTRICTED FIELD DISTRIBUTION
              </div>

              {/* PREVIEW CONTAINER FOR CLONED REPORT */}
              <div className="relative z-10 space-y-6">
                {clonedContent ? (
                  <div
                    className="print-preview-rendered-body"
                    dangerouslySetInnerHTML={{ __html: clonedContent }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-24 text-carbon-60 font-mono text-xs">
                    <RefreshCw className="w-8 h-8 text-carbon-30 animate-spin mb-3" />
                    <span>Loading official printable document layout...</span>
                  </div>
                )}
              </div>

              {/* OFFICIAL A4 FOOTER & SIGN-OFF */}
              <div className="mt-12 pt-4 border-t-2 border-carbon-90 flex flex-wrap items-center justify-between gap-3 text-[7.5pt] font-mono text-carbon-60">
                <div className="space-y-0.5">
                  <span className="font-bold text-carbon-90">HAZARDNET BANGLADESH DISASTER OPERATIONS</span>
                  <p>Ministry of Disaster Management and Relief (MoDMR) • Department of Agricultural Extension (DAE)</p>
                </div>
                <div className="text-right">
                  <span className="font-bold text-carbon-90">HOTLINES: 999 (National) • 1090 (Disaster) • 16123 (Krishi)</span>
                  <p>Official Directive Page 1 of 1 • SOD 2019 Public Safety Standard</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. BOTTOM STATUS & SHORTCUTS FOOTER */}
        <div className="print-preview-footer screen-only px-4 sm:px-6 py-2 bg-carbon-90 border-t border-carbon-80 text-carbon-40 text-xs flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] sm:text-xs">
              Print layout verified: High-contrast ink optimization active, dark backdrops sanitized, vector QR tags attached.
            </span>
          </div>
          <div className="text-[11px] font-mono text-carbon-60 hidden sm:block">
            Shortcuts: <kbd className="px-1.5 py-0.5 bg-carbon-80 border border-carbon-70 rounded text-carbon-30">Ctrl + P</kbd> Print • <kbd className="px-1.5 py-0.5 bg-carbon-80 border border-carbon-70 rounded text-carbon-30">+</kbd> / <kbd className="px-1.5 py-0.5 bg-carbon-80 border border-carbon-70 rounded text-carbon-30">-</kbd> Zoom • <kbd className="px-1.5 py-0.5 bg-carbon-80 border border-carbon-70 rounded text-carbon-30">Esc</kbd> Exit
          </div>
        </div>
      </div>

      {/* Configuration Modal */}
      <PdfExportConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        elementId={elementId}
        customElement={customElement}
        title={title}
        documentType={documentType}
        defaultTemplate={initialTemplate}
        filenameContext={mergedContext}
      />
    </>
  );
};

export default PrintPreviewModal;
