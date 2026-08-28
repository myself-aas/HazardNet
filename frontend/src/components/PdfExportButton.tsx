import React, { useState } from 'react';
import { FileDown, Printer, Loader2, CheckCircle2, ChevronDown, Eye } from 'lucide-react';
import { exportElementToPdf, PdfExportOptions } from '../utils/pdfExport';
import { PrintPreviewModal } from './PrintPreviewModal';
import toast from 'react-hot-toast';

interface PdfExportButtonProps {
  filename?: string;
  elementId?: string;
  customElement?: HTMLElement;
  title?: string;
  documentType?: string;
  variant?: 'primary' | 'secondary' | 'compact' | 'split';
  className?: string;
}

export const PdfExportButton: React.FC<PdfExportButtonProps> = ({
  filename,
  elementId,
  customElement,
  title = 'Export PDF',
  documentType = 'Emergency Advisory Bulletin',
  variant = 'secondary',
  className = '',
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progressStage, setProgressStage] = useState<string>('');
  const [isOpenMenu, setIsOpenMenu] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleExportPdf = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setIsOpenMenu(false);

    const toastId = toast.loading(`Generating official ${documentType} PDF...`);

    try {
      await exportElementToPdf({
        filename: filename || `HazardNet_${documentType.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`,
        elementId,
        customElement,
        onProgress: (percent, stage) => {
          setProgressStage(stage);
          toast.loading(`${stage} (${percent}%)`, { id: toastId });
        },
        onComplete: () => {
          toast.success(`Official ${documentType} PDF exported successfully!`, {
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
        <button
          onClick={handleOpenPreview}
          title={`Print Preview & Handout Layout`}
          className={`inline-flex items-center justify-center p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all shadow-xs cursor-pointer ${className}`}
        >
          <Eye className="w-4 h-4 text-slate-700" />
        </button>

        <PrintPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          elementId={elementId}
          title={title}
          documentType={documentType}
          filename={filename}
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
            title="Preview how this report looks before printing"
          >
            <Eye className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span>Print Preview</span>
          </button>
          
          <button
            onClick={handleExportPdf}
            disabled={isExporting}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
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

        <PrintPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          elementId={elementId}
          title={title}
          documentType={documentType}
          filename={filename}
        />
      </>
    );
  }

  // Default Split / Dual action: Print Preview, Download PDF or Print Handout
  return (
    <>
      <div className={`relative inline-flex rounded-xl shadow-xs ${className}`}>
        {/* Direct Print Preview Button */}
        <button
          onClick={handleOpenPreview}
          title="Print Preview: Inspect physical A4 layout, QR codes, repeated headers & watermarks"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-l-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 text-xs font-bold transition-all cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span>Print Preview</span>
        </button>

        {/* Dropdown for Download PDF & Direct Print */}
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
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1.5 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                Official Report Publishing
              </div>
              <button
                onClick={handleOpenPreview}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-amber-50 hover:text-amber-950 font-medium text-left cursor-pointer transition-colors"
              >
                <Eye className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Print Preview & Sheet Layout</div>
                  <div className="text-[10px] text-slate-500">View A4 page, watermark & QR code</div>
                </div>
              </button>
              <button
                onClick={handleExportPdf}
                disabled={isExporting}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium text-left cursor-pointer transition-colors"
              >
                <FileDown className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Download Official PDF</div>
                  <div className="text-[10px] text-slate-500">A4 layout with vector QR & timestamps</div>
                </div>
              </button>
              <button
                onClick={handleNativePrint}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium text-left cursor-pointer transition-colors"
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

      {/* Render Modal */}
      <PrintPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        elementId={elementId}
        title={title}
        documentType={documentType}
        filename={filename}
      />
    </>
  );
};

export default PdfExportButton;

