import React, { useEffect, useRef } from 'react';
import { isValidGlide } from '../lib/glide';

export interface DisasterMasterEvent {
  event_id?: number | string;
  glide: string;
  date: string;
  year: number;
  hazard_type: string;
  hazard_class?: string;
  location_districts: string[];
  full_description: string;
  gee_start?: string;
  gee_end?: string;
  ifrc_severity?: string | null;
  gdacs_active_alert?: number;
  validated_affected?: number;
  links?: Record<string, string>;
}

export interface EventReportModalProps {
  event: DisasterMasterEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenGlide?: (glideId: string) => void;
  className?: string;
}

export const EventReportModal: React.FC<EventReportModalProps> = ({
  event,
  isOpen,
  onClose,
  onOpenGlide,
  className = '',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `HazardNet Report: ${event.hazard_type} (${event.date})`,
          text: `Historical disaster record: ${event.hazard_type} affecting ${event.location_districts.join(', ')}. GLIDE: ${event.glide}`,
          url: window.location.href,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      navigator.clipboard?.writeText(window.location.href);
      alert('Event report link copied to clipboard!');
    }
  };

  const hasGlide = isValidGlide(event.glide);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Historical Disaster Report: ${event.hazard_type}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className={`w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-slate-100 flex flex-col max-h-[90vh] overflow-hidden ${className}`}
        data-testid="event-report-modal"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-950/70 text-rose-300 border border-rose-800/80">
                {event.hazard_type}
              </span>
              {hasGlide ? (
                <button
                  type="button"
                  onClick={() => onOpenGlide && onOpenGlide(event.glide)}
                  className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-blue-950/70 text-blue-300 border border-blue-800/80 hover:bg-blue-900 transition-colors inline-flex items-center gap-1"
                >
                  <span>{event.glide}</span>
                  <span className="text-[10px]">↗</span>
                </button>
              ) : (
                <span className="text-xs font-mono text-slate-400">
                  {event.glide || 'Domestic Catalog'}
                </span>
              )}
              <span className="text-xs font-mono text-slate-400">
                {event.date}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white mt-1.5">
              Disaster Assessment & Situation Narrative
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Share report"
              aria-label="Share report"
            >
              📤
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Print report"
              aria-label="Print report"
            >
              🖨️
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              aria-label="Close disaster report modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Metadata Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] text-slate-400 font-medium">Impacted Districts</span>
              <p className="text-sm font-semibold text-white mt-0.5">
                {event.location_districts && event.location_districts.length > 0
                  ? event.location_districts.join(', ')
                  : 'Nationwide / Regional'}
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] text-slate-400 font-medium">Affected Population</span>
              <p className="text-sm font-mono font-bold text-rose-400 mt-0.5">
                {event.validated_affected && event.validated_affected > 0
                  ? event.validated_affected.toLocaleString()
                  : 'Reported in Sitrep'}
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] text-slate-400 font-medium">GEE Observation Window</span>
              <p className="text-xs font-mono text-slate-300 mt-1">
                {event.gee_start && event.gee_end
                  ? `${event.gee_start} → ${event.gee_end}`
                  : 'Standard 90-day window'}
              </p>
            </div>
          </div>

          {/* Full Narrative Text */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Humanitarian Situation Report & Grounding Narrative
            </h3>
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs sm:text-sm text-slate-300 leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-line font-sans scrollbar-thin">
              {event.full_description || 'No detailed situation report available for this entry.'}
            </div>
          </div>

          {/* Multilateral Reference Links */}
          {hasGlide && event.links && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Multilateral References
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {Object.entries(event.links).map(([source, url]) => (
                  <a
                    key={source}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-slate-950/60 border border-slate-800 hover:border-blue-500 hover:bg-slate-800/50 transition-colors flex items-center justify-between"
                  >
                    <span className="capitalize text-slate-300">
                      {source.replace('_', ' ')}
                    </span>
                    <span className="text-blue-400">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-between items-center text-xs">
          <span className="text-slate-500">
            Source: HazardNet Master Multilateral Disaster Catalog
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
};

export default EventReportModal;
