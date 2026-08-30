import React, { useState, useEffect, useRef } from 'react';
import {
  FileDown,
  X,
  Sparkles,
  RotateCw,
  SunMedium,
  Check,
  Copy,
  Sliders,
  HelpCircle,
  FileText,
  Eye,
  Calendar,
  MapPin,
  AlertTriangle,
  Clock,
  Shield,
  Loader2,
  Bookmark,
} from 'lucide-react';
import {
  PdfFilenameContext,
  AVAILABLE_FILENAME_PLACEHOLDERS,
  FILENAME_PRESET_TEMPLATES,
  formatFilenameWithPlaceholders,
  exportElementToPdf,
} from '../utils/pdfExport';
import toast from 'react-hot-toast';

const STORAGE_KEY_TEMPLATE = 'hazardnet_pdf_filename_template_v1';
const STORAGE_KEY_ORIENTATION = 'hazardnet_pdf_orientation_v1';
const STORAGE_KEY_INKSAVER = 'hazardnet_pdf_inksaver_v1';

export interface PdfExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId?: string;
  customElement?: HTMLElement;
  title?: string;
  documentType?: string;
  defaultTemplate?: string;
  filenameContext?: PdfFilenameContext;
  onOpenPreview?: () => void;
}

export const PdfExportConfigModal: React.FC<PdfExportConfigModalProps> = ({
  isOpen,
  onClose,
  elementId,
  customElement,
  title = 'Export Official PDF',
  documentType = 'Emergency Advisory Bulletin',
  defaultTemplate,
  filenameContext = {},
  onOpenPreview,
}) => {
  // Compute initial context values
  const context: PdfFilenameContext = {
    documentType,
    docType: documentType,
    region: filenameContext.region || filenameContext.district || 'National',
    district: filenameContext.district || filenameContext.region || 'National',
    hazard: filenameContext.hazard || filenameContext.hazardType || 'Disaster_Alert',
    hazardType: filenameContext.hazardType || filenameContext.hazard || 'Disaster_Alert',
    ...filenameContext,
  };

  const initialTemplateFallback =
    defaultTemplate ||
    (context.region && context.region !== 'National'
      ? 'HazardNet_{region}_{hazard}_{docType}_{date}.pdf'
      : 'HazardNet_{docType}_{date}.pdf');

  const [template, setTemplate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEMPLATE);
      return saved || initialTemplateFallback;
    } catch {
      return initialTemplateFallback;
    }
  });

  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORIENTATION);
      return saved === 'landscape' ? 'landscape' : 'portrait';
    } catch {
      return 'portrait';
    }
  });

  const [inkSaver, setInkSaver] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_INKSAVER) === 'true';
    } catch {
      return false;
    }
  });

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{ percent: number; stage: string }>({
    percent: 0,
    stage: '',
  });
  const [copiedFilename, setCopiedFilename] = useState<boolean>(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsExporting(false);
      setExportProgress({ percent: 0, stage: '' });
      try {
        const saved = localStorage.getItem(STORAGE_KEY_TEMPLATE);
        if (saved) {
          setTemplate(saved);
        } else if (defaultTemplate) {
          setTemplate(defaultTemplate);
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [isOpen, defaultTemplate]);

  if (!isOpen) return null;

  // Real-time evaluated output filename
  const evaluatedFilename = formatFilenameWithPlaceholders(template, context);

  // Insert placeholder token at the current cursor position in the input field
  const handleInsertPlaceholder = (tag: string) => {
    const input = inputRef.current;
    if (!input) {
      setTemplate((prev) => `${prev.replace(/\.pdf$/i, '')}_${tag}.pdf`);
      return;
    }

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const currentValue = input.value;

    const newValue = currentValue.slice(0, start) + tag + currentValue.slice(end);
    setTemplate(newValue);
    setSelectedPresetId(null);

    // Save and re-focus cursor right after the inserted tag
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + tag.length, start + tag.length);
    }, 10);
  };

  const handleApplyPreset = (presetTemplate: string, presetId: string) => {
    setTemplate(presetTemplate);
    setSelectedPresetId(presetId);
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATE, presetTemplate);
    } catch {
      // Ignore
    }
    inputRef.current?.focus();
  };

  const handleResetToDefault = () => {
    setTemplate(initialTemplateFallback);
    setSelectedPresetId(null);
    try {
      localStorage.removeItem(STORAGE_KEY_TEMPLATE);
    } catch {
      // Ignore
    }
    toast.success('Reset filename template to system default');
  };

  const handleCopyEvaluatedFilename = () => {
    navigator.clipboard.writeText(evaluatedFilename);
    setCopiedFilename(true);
    toast.success('Filename copied to clipboard!');
    setTimeout(() => setCopiedFilename(false), 2000);
  };

  const handleTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTemplate(val);
    setSelectedPresetId(null);
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATE, val);
    } catch {
      // Ignore
    }
  };

  const handleOrientationChange = (newOrientation: 'portrait' | 'landscape') => {
    setOrientation(newOrientation);
    try {
      localStorage.setItem(STORAGE_KEY_ORIENTATION, newOrientation);
    } catch {
      // Ignore
    }
  };

  const handleInkSaverChange = (enabled: boolean) => {
    setInkSaver(enabled);
    try {
      localStorage.setItem(STORAGE_KEY_INKSAVER, String(enabled));
    } catch {
      // Ignore
    }
  };

  const handleStartExport = async () => {
    if (isExporting) return;
    setIsExporting(true);

    const toastId = toast.loading(`Generating official ${documentType} PDF...`);

    try {
      await exportElementToPdf({
        elementId,
        customElement,
        filename: evaluatedFilename,
        filenameTemplate: template,
        filenameContext: context,
        title,
        documentType,
        orientation,
        inkSaver,
        onProgress: (percent, stage) => {
          setExportProgress({ percent, stage });
          toast.loading(`${stage} (${percent}%)`, { id: toastId });
        },
        onComplete: () => {
          toast.success(`PDF exported successfully as "${evaluatedFilename}"!`, {
            id: toastId,
            duration: 4500,
            icon: '📄',
          });
          onClose();
        },
        onError: (err) => {
          console.error('PDF export failed:', err);
          toast.error(`PDF export failed: ${err.message || 'Unknown error'}`, {
            id: toastId,
            duration: 5000,
          });
        },
      });
    } catch (err: any) {
      toast.error(`PDF generation encountered an issue. You can use standard print preview as a fallback.`, {
        id: toastId,
        duration: 5000,
      });
    } finally {
      setIsExporting(false);
      setExportProgress({ percent: 0, stage: '' });
    }
  };

  const getPlaceholderIcon = (category: string) => {
    switch (category) {
      case 'location':
        return <MapPin className="w-3 h-3 text-emerald-500" />;
      case 'date':
        return <Calendar className="w-3 h-3 text-blue-500" />;
      case 'metadata':
      default:
        return <Shield className="w-3 h-3 text-amber-500" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-config-modal-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {/* Modal Container */}
      <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h3 id="pdf-config-modal-title" className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>PDF Export Configuration</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-amber-300 border border-slate-700">
                  SOD 2019
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Customize document filename, dynamic tags, and layout before downloading
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            title="Close dialog (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 custom-scrollbar text-slate-800">
          {/* Section 1: Filename Template Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="pdf-filename-template-input" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Filename Template</span>
              </label>

              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-[11px] text-slate-500 hover:text-slate-900 font-mono underline transition-colors cursor-pointer"
                title="Reset template to default pattern"
              >
                Reset Default
              </button>
            </div>

            <div className="relative">
              <input
                id="pdf-filename-template-input"
                ref={inputRef}
                type="text"
                value={template}
                onChange={handleTemplateChange}
                disabled={isExporting}
                placeholder="HazardNet_{docType}_{region}_{date}.pdf"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 focus:border-slate-900 focus:bg-white rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:ring-2 focus:ring-slate-900/20 outline-none transition-all"
              />
            </div>
          </div>

          {/* Section 2: Placeholder Chips (Click to Insert) */}
          <div className="space-y-2 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Available Placeholders</span>
              </span>
              <span className="text-[10px] text-slate-500">Click a tag to insert into template</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_FILENAME_PLACEHOLDERS.map((ph) => {
                const previewVal = ph.getExample(context);
                return (
                  <button
                    key={ph.tag}
                    type="button"
                    onClick={() => handleInsertPlaceholder(ph.tag)}
                    disabled={isExporting}
                    title={`${ph.description} • Example: "${previewVal}"`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-950 text-xs font-mono border border-slate-200 hover:border-amber-300 transition-all shadow-2xs cursor-pointer group"
                  >
                    {getPlaceholderIcon(ph.category)}
                    <strong className="font-bold text-slate-900 group-hover:text-amber-900">{ph.tag}</strong>
                    <span className="text-[10px] text-slate-400 font-sans">({previewVal})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Live Output Filename Preview */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Live Evaluated Filename</span>
              </span>
              <button
                type="button"
                onClick={handleCopyEvaluatedFilename}
                className="inline-flex items-center gap-1 text-[10px] text-emerald-700 hover:text-emerald-900 font-mono cursor-pointer"
                title="Copy evaluated filename"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedFilename ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="font-mono text-xs text-emerald-950 font-bold break-all selection:bg-emerald-200">
              {evaluatedFilename}
            </p>
          </div>

          {/* Section 4: Quick Presets */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Bookmark className="w-3.5 h-3.5 text-slate-500" />
              <span>Quick Filename Presets</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FILENAME_PRESET_TEMPLATES.map((preset) => {
                const isSelected = template === preset.template || selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.template, preset.id)}
                    disabled={isExporting}
                    className={`p-2.5 text-left rounded-xl border text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-bold">{preset.name}</div>
                    <div className={`font-mono text-[10px] truncate mt-0.5 ${isSelected ? 'text-amber-300' : 'text-slate-500'}`}>
                      {preset.template}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 5: Document Layout Options (Orientation & Ink-Saver) */}
          <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Page Orientation */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-700 block">Page Orientation</span>
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleOrientationChange('portrait')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    orientation === 'portrait'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Portrait (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOrientationChange('landscape')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Landscape (A4)</span>
                </button>
              </div>
            </div>

            {/* Ink-Saver High Contrast Switch */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-700 block">Printer Optimization</span>
              <button
                type="button"
                onClick={() => handleInkSaverChange(!inkSaver)}
                className={`w-full py-1.5 px-3 rounded-xl border font-bold text-xs transition-all flex items-center justify-between cursor-pointer ${
                  inkSaver
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <SunMedium className="w-3.5 h-3.5 text-amber-500" />
                  <span>Ink-Saver Mode</span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  inkSaver ? 'bg-amber-200 text-amber-900' : 'bg-slate-200 text-slate-600'
                }`}>
                  {inkSaver ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            {onOpenPreview && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPreview();
                }}
                disabled={isExporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <Eye className="w-3.5 h-3.5 text-slate-600" />
                <span>Open Print Preview</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleStartExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-md cursor-pointer hover:scale-102 active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
                  <span>{exportProgress.stage || 'Generating PDF...'}</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Export & Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfExportConfigModal;
