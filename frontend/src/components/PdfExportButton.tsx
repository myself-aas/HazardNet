import React, { useState } from 'react';
import { FileDown, Printer, Loader2, ChevronDown, Eye, Sliders } from 'lucide-react';
import { exportElementToPdf, PdfFilenameContext, formatFilenameWithPlaceholders } from '../utils/pdfExport';
import { PrintPreviewModal } from './PrintPreviewModal';
import { PdfExportConfigModal } from './PdfExportConfigModal';
import toast from 'react-hot-toast';

export interface PdfExportButtonProps {
  filename?: string;
  filenameTemplate?: string;
  elementId?: string;
  customElement?: HTMLElement;
  title?: string;
  documentType?: string;
  regionName?: string;
  districtName?: string;
  hazardType?: string;
  filenameContext?: PdfFilenameContext;
  variant?: 'primary' | 'secondary' | 'compact' | 'split';
  className?: string;
  skipConfigModal?: boolean;
}

export const PdfExportButton: React.FC<PdfExportButtonProps> = ({
  filename,
  filenameTemplate,
  elementId,
  customElement,
  title = 'Export PDF',
  documentType = 'Emergency Advisory Bulletin',
  regionName,
  districtName,
  hazardType,
  filenameContext = {},
  variant = 'secondary',
  className = '',
  skipConfigModal = false,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progressStage, setProgressStage] = useState<string>('');
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Compute merged context for placeholders
  const resolvedRegion = regionName || districtName || filenameContext.region || filenameContext.district || 'National';
  const resolvedHazard = hazardType || filenameContext.hazard || filenameContext.hazardType || 'Disaster_Alert';

  const mergedContext: PdfFilenameContext = {
    documentType,
    docType: documentType,
    region: resolvedRegion,
    district: resolvedRegion,
    hazard: resolvedHazard,
    hazardType: resolvedHazard,
    ...filenameContext,
  };

  const initialTemplate =
    filenameTemplate ||
    filename ||
    (resolvedRegion && resolvedRegion !== 'National'
      ? 'HazardNet_{docType}_{region}_{date}.pdf'
      : 'HazardNet_{docType}_{date}.pdf');

  const handleOpenConfig = () => {
    setIsOpenMenu(false);
    setIsConfigOpen(true);
  };

  const handleDirectQuickExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setIsOpenMenu(false);

    const evaluated = formatFilenameWithPlaceholders(initialTemplate, mergedContext);
    const toastId = toast.loading(`Generating official ${documentType} PDF...`);

    try {
      await exportElementToPdf({
        filename: evaluated,
        filenameTemplate: initialTemplate,
        filenameContext: mergedContext,
        elementId,
        customElement,
        title,
        documentType,
        onProgress: (percent, stage) => {
          setProgressStage(stage);
          toast.loading(`${stage} (${percent}%)`, { id: toastId });
        },
        onComplete: () => {
          toast.success(`Official PDF exported as "${evaluated}"!`, {
            id: toastId,
            duration: 4000,
            icon: '📄',
          });
        },
        onError: (err) => {
          console.error('PDF generation error:', err);
          toast.error(`Failed to generate PDF: ${err.message || 'Unknown error'}`, {
            id: toastId,
            duration: 5000,
          });
        },
      });
    } catch (err: any) {
      toast.error(`PDF Export Failed. You can use standard Print to PDF as fallback.`, {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setIsExporting(false);
      setProgressStage('');
    }
  };

  const handlePrimaryClick = () => {
    if (skipConfigModal) {
      handleDirectQuickExport();
    } else {
      handleOpenConfig();
    }
  };

  const handleNativePrint = () => {
    setIsOpenMenu(false);
    window.print();
  };

  const handleOpenPreview = () => {
    setIsOpenMenu(false);
    setIsPreviewOpen(true);
  };

  if (variant === 'compact') {
    return (
      <>
        <div className="relative inline-flex items-center">
          <button
            onClick={handleOpenConfig}
            title="Configure and Export PDF (Customize Filename, Date & Region tags)"
            className={`inline-flex items-center justify-center p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-2xs cursor-pointer ${className}`}
          >
            <FileDown className="w-4 h-4 text-slate-700" />
          </button>
        </div>

        <PdfExportConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          elementId={elementId}
          customElement={customElement}
          title={title}
          documentType={documentType}
          defaultTemplate={initialTemplate}
          filenameContext={mergedContext}
          onOpenPreview={() => setIsPreviewOpen(true)}
        />

        <PrintPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          elementId={elementId}
          customElement={customElement}
          title={title}
          documentType={documentType}
          filename={initialTemplate}
          filenameContext={mergedContext}
          regionName={resolvedRegion}
          hazardType={resolvedHazard}
          onOpenConfigModal={() => setIsConfigOpen(true)}
        />
      </>
    );
  }

  if (variant === 'primary') {
    return (
      <>
        <div className="relative inline-flex gap-2">
          <button
            onClick={handleOpenPreview}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-300 cursor-pointer"
            title="Preview physical A4 handout before exporting"
          >
            <Eye className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span>Print Preview</span>
          </button>

          <button
            onClick={handlePrimaryClick}
            disabled={isExporting}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
            title="Configure Filename & Download PDF"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                <span>{progressStage || 'Generating PDF...'}</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{title}</span>
              </>
            )}
          </button>
        </div>

        <PdfExportConfigModal
          isOpen={isConfigOpen}
          onClose={() => setIsConfigOpen(false)}
          elementId={elementId}
          customElement={customElement}
          title={title}
          documentType={documentType}
          defaultTemplate={initialTemplate}
          filenameContext={mergedContext}
          onOpenPreview={() => setIsPreviewOpen(true)}
        />

        <PrintPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          elementId={elementId}
          customElement={customElement}
          title={title}
          documentType={documentType}
          filename={initialTemplate}
          filenameContext={mergedContext}
          regionName={resolvedRegion}
          hazardType={resolvedHazard}
          onOpenConfigModal={() => setIsConfigOpen(true)}
        />
      </>
    );
  }

  // Default Split / Dual action: Print Preview, Download PDF (with Filename Config) or Quick Print
  return (
    <>
      <div className={`relative inline-flex rounded-xl shadow-2xs ${className}`}>
        {/* Main Action: Open PDF Configuration Step */}
        <button
          onClick={handleOpenConfig}
          title="Configure Filename (Date, Region & Hazard placeholders) & Export PDF"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-l-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs font-bold transition-all cursor-pointer"
        >
          <FileDown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>{title}</span>
        </button>

        {/* Dropdown for Preview, Presets & Direct Print */}
        <button
          onClick={() => setIsOpenMenu(!isOpenMenu)}
          className="inline-flex items-center px-2 py-2 rounded-r-xl bg-white border-y border-r border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all cursor-pointer"
          title="More print & export options"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        {isOpenMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpenMenu(false)} />
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 flex items-center justify-between">
                <span>Official PDF & Print</span>
                <span className="text-amber-600 font-bold">SOD 2019</span>
              </div>

              {/* Configure Filename & Download */}
              <button
                onClick={handleOpenConfig}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-amber-50 hover:text-amber-950 font-medium text-left cursor-pointer transition-colors"
              >
                <Sliders className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Configure Filename & Export</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-mono">Custom</span>
                  </div>
                  <div className="text-[10px] text-slate-500">Add {`{date}`}, {`{region}`} or {`{hazard}`} tags</div>
                </div>
              </button>

              {/* Print Preview */}
              <button
                onClick={handleOpenPreview}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium text-left cursor-pointer transition-colors"
              >
                <Eye className="w-4 h-4 text-blue-500 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Print Preview & Sheet Layout</div>
                  <div className="text-[10px] text-slate-500">Inspect multi-page A4 & QR tags</div>
                </div>
              </button>

              {/* Quick Download (Direct) */}
              <button
                onClick={handleDirectQuickExport}
                disabled={isExporting}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium text-left cursor-pointer transition-colors"
              >
                <FileDown className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Quick Download PDF</div>
                  <div className="text-[10px] text-slate-500">Save immediately with default template</div>
                </div>
              </button>

              {/* Native Print */}
              <button
                onClick={handleNativePrint}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium text-left cursor-pointer transition-colors border-t border-slate-100 mt-1"
              >
                <Printer className="w-4 h-4 text-slate-700 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Browser Print / Physical Sheet</div>
                  <div className="text-[10px] text-slate-500">Native browser print dialog</div>
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Configuration Dialog */}
      <PdfExportConfigModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        elementId={elementId}
        customElement={customElement}
        title={title}
        documentType={documentType}
        defaultTemplate={initialTemplate}
        filenameContext={mergedContext}
        onOpenPreview={() => setIsPreviewOpen(true)}
      />

      {/* Print Preview Modal */}
      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        elementId={elementId}
        customElement={customElement}
        title={title}
        documentType={documentType}
        filename={initialTemplate}
        filenameContext={mergedContext}
        regionName={resolvedRegion}
        hazardType={resolvedHazard}
        onOpenConfigModal={() => setIsConfigOpen(true)}
      />
    </>
  );
};

export default PdfExportButton;
