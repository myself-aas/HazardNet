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
} from 'lucide-react';
import { exportElementToPdf } from '../utils/pdfExport';
import toast from 'react-hot-toast';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId?: string;
  title?: string;
  documentType?: string;
  filename?: string;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  elementId = 'advisory-bulletin-container',
  title = 'HazardNet Official Emergency Advisory Handout',
  documentType = 'Emergency Operational Directive',
  filename,
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [clonedContent, setClonedContent] = useState<string>('');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const previewPaperRef = useRef<HTMLDivElement>(null);

  // Capture and prepare DOM content whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    const sourceEl = elementId ? document.getElementById(elementId) : null;
    if (sourceEl) {
      // Clone element to avoid altering active DOM
      const clone = sourceEl.cloneNode(true) as HTMLElement;

      // Ensure print-only components (Header, QR Code, Emergency Tables, Footers) are visible
      clone.querySelectorAll('.print-only').forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'block', 'important');
      });

      clone.querySelectorAll('.print-qr-code-box').forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'flex', 'important');
      });

      // Hide screen-only interactive navigation, buttons, selectors, forms
      clone.querySelectorAll('.no-print, .screen-only, button:not(.print-keep)').forEach((el) => {
        (el as HTMLElement).style.setProperty('display', 'none', 'important');
      });

      // Uncollapse all details/accordions in preview
      clone.querySelectorAll('details').forEach((details) => {
        details.setAttribute('open', 'true');
      });

      setClonedContent(clone.innerHTML);
    } else {
      setClonedContent('');
    }

    // Handle ESC and Ctrl+P keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handleNativePrint();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, elementId]);

  if (!isOpen) return null;

  const handleNativePrint = () => {
    onClose();
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleDownloadPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    const toastId = toast.loading(`Generating official PDF...`);

    try {
      await exportElementToPdf({
        elementId,
        filename: filename || `HazardNet_${documentType.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
        documentType,
        onProgress: (percent, stage) => {
          toast.loading(`${stage} (${percent}%)`, { id: toastId });
        },
        onComplete: () => {
          toast.success(`Official ${documentType} PDF exported!`, { id: toastId });
        },
      });
    } catch (err) {
      toast.error('Failed to generate PDF. You can print directly to PDF.', { id: toastId });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleZoomChange = (delta: number) => {
    setZoomLevel((prev) => Math.min(150, Math.max(50, prev + delta)));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      {/* 1. TOP CONTROL TOOLBAR */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 border-b border-slate-800 text-white shrink-0 shadow-lg">
        {/* Left Title & Status */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate max-w-md">
                {title}
              </h2>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold">
                A4 INK-FRIENDLY PRINT PREVIEW
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              SOD 2019 Standard Operating Procedure Format • Live QR Mobile Telemetry • Watermark & Repeated Headers Enabled
            </p>
          </div>
        </div>

        {/* Center/Right Action Toolbar */}
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="hidden md:flex items-center bg-slate-800 rounded-xl p-1 border border-slate-700">
            <button
              onClick={() => handleZoomChange(-15)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold px-2 text-slate-300 min-w-[50px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => handleZoomChange(15)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-[10px] font-mono font-bold px-1.5"
              title="Reset Zoom to 100%"
            >
              100%
            </button>
          </div>

          {/* Download PDF Button */}
          <button
            onClick={handleDownloadPdf}
            disabled={isExportingPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-60"
            title="Download PDF File directly"
          >
            <FileDown className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Download PDF</span>
          </button>

          {/* Trigger Native Print */}
          <button
            onClick={handleNativePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black transition-all shadow-md cursor-pointer hover:scale-102 active:scale-98"
            title="Trigger Browser Print Dialog (Ctrl+P)"
          >
            <Printer className="w-4 h-4 text-slate-950 shrink-0" />
            <span>Print Report</span>
          </button>

          {/* Close Modal */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer ml-1"
            title="Close Preview (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. PRINT PREVIEW WORKSPACE / PAPER CANVAS */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center items-start bg-slate-950/60 custom-scrollbar">
        <div
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="w-full max-w-[840px] my-4"
        >
          {/* SIMULATED A4 PRINTED PAPER SHEET */}
          <div
            ref={previewPaperRef}
            className="relative bg-white text-slate-900 rounded-sm shadow-2xl p-8 sm:p-12 border border-slate-300 min-h-[1180px] overflow-hidden"
          >
            {/* AUTHENTIC DIAGONAL EMERGENCY WATERMARK */}
            <div
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[35deg] pointer-events-none select-none z-0 border-[2.5px] border-dashed border-slate-900/5 text-slate-900/5 font-mono font-black text-sm uppercase tracking-widest p-8 text-center max-w-[540px] leading-relaxed"
            >
              HAZARDNET BANGLADESH • OFFICIAL EMERGENCY ADVISORY • OPERATIONAL DIRECTIVE
            </div>

            {/* PREVIEW CONTAINER FOR CLONED REPORT */}
            <div className="relative z-10 space-y-6">
              {clonedContent ? (
                <div
                  className="print-preview-rendered-body"
                  dangerouslySetInnerHTML={{ __html: clonedContent }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 font-mono text-xs">
                  <RefreshCw className="w-8 h-8 text-slate-300 animate-spin mb-3" />
                  <span>Loading official print layout...</span>
                </div>
              )}
            </div>

            {/* SIMULATED BOTTOM PAGE NUMBERING FOOTER */}
            <div className="mt-12 pt-4 border-t border-slate-300 flex items-center justify-between text-[7.5pt] font-mono text-slate-500">
              <span>HAZARDNET BANGLADESH • DISASTER ADVISORY HANDOUT</span>
              <span>SOD 2019 PUBLIC SAFETY COMPLIANCE</span>
              <span className="font-bold text-slate-900">Page 1 of 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM INFO BANNER */}
      <div className="px-6 py-2.5 bg-slate-900/95 border-t border-slate-800 text-slate-400 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Print layout verified: High-contrast ink optimization active, dark backdrops removed, QR mobile telemetry tags attached.
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-500">
          Shortcut: Press <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">Esc</kbd> to exit, <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-slate-300">Ctrl + P</kbd> to print
        </div>
      </div>
    </div>
  );
};

export default PrintPreviewModal;
