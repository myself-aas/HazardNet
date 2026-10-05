import React, { useEffect, useRef } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { generateGlideLinks, isValidGlide, MultilateralGlideLinks } from '../lib/glide';
import { useDialogBehavior } from '../hooks/useDialogBehavior';

export interface GlideResourcePopoverProps {
  glideId: string;
  isOpen: boolean;
  onClose: () => void;
  position?: { top?: number; left?: number; right?: number; bottom?: number };
  className?: string;
}

export const GlideResourcePopover: React.FC<GlideResourcePopoverProps> = ({
  glideId,
  isOpen,
  onClose,
  className = '',
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  // Escape, focus save/restore, scroll lock and the Tab cycle.
  useDialogBehavior({ isOpen, onClose, containerRef: popoverRef });

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !glideId) return null;

  const valid = isValidGlide(glideId);
  let links: MultilateralGlideLinks | null = null;
  if (valid) {
    try {
      links = generateGlideLinks(glideId);
    } catch {
      links = null;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Multilateral resources for GLIDE ${glideId}`}
    >
      <div
        ref={popoverRef}
        className={`w-full max-w-md bg-carbon-90 border border-carbon-70 rounded-2xl p-5 shadow-2xl text-carbon-10 relative ${className}`}
        data-testid="glide-resource-popover"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-carbon-80 pb-3 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-ap-on-inverse tracking-tight">
                Multilateral GLIDE Registry
              </h4>
            </div>
            <div className="mt-1 font-mono text-xs text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md inline-block">
              {glideId}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-carbon-30 hover:text-white p-1 rounded-lg hover:bg-carbon-80 transition-colors"
            aria-label="Close GLIDE resources popover"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Links listing */}
        {valid && links ? (
          <div className="space-y-2">
            <p className="text-xs text-carbon-30 mb-2">
              Official multilateral agencies tracking this disaster event. All links open securely in a new window.
            </p>

            <a
              href={links.reliefweb}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-xl bg-carbon-black/60 border border-carbon-80 hover:border-blue-600 hover:bg-carbon-80/60 transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ap-on-scrim-muted group-hover:text-blue-400">
                  ReliefWeb Disaster Registry (UN OCHA)
                </span>
                <span className="text-xs text-ap-on-scrim-muted">
                  Situation reports, sitreps, humanitarian maps, and appeals
                </span>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-ap-on-scrim-muted group-hover:text-blue-400" aria-hidden="true" />
            </a>

            <a
              href={links.fao_giews}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-xl bg-carbon-black/60 border border-carbon-80 hover:border-blue-600 hover:bg-carbon-80/60 transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ap-on-scrim-muted group-hover:text-blue-400">
                  FAO GIEWS Country Brief (Bangladesh)
                </span>
                <span className="text-xs text-ap-on-scrim-muted">
                  Crop prospects, agricultural damage, food security assessment
                </span>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-ap-on-scrim-muted group-hover:text-blue-400" aria-hidden="true" />
            </a>

            <a
              href={links.who_emergencies}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-xl bg-carbon-black/60 border border-carbon-80 hover:border-blue-600 hover:bg-carbon-80/60 transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ap-on-scrim-muted group-hover:text-blue-400">
                  WHO Public Health Emergencies
                </span>
                <span className="text-xs text-ap-on-scrim-muted">
                  Disease surveillance, epidemiological alerts, health cluster
                </span>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-ap-on-scrim-muted group-hover:text-blue-400" aria-hidden="true" />
            </a>

            <a
              href={links.adrc_registry}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-xl bg-carbon-black/60 border border-carbon-80 hover:border-blue-600 hover:bg-carbon-80/60 transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ap-on-scrim-muted group-hover:text-blue-400">
                  Asian Disaster Reduction Center (ADRC)
                </span>
                <span className="text-xs text-ap-on-scrim-muted">
                  Multilateral GLIDE register and regional catastrophe database
                </span>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-ap-on-scrim-muted group-hover:text-blue-400" aria-hidden="true" />
            </a>

            <a
              href={links.ifrc_go}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-2.5 rounded-xl bg-carbon-black/60 border border-carbon-80 hover:border-blue-600 hover:bg-carbon-80/60 transition-all text-xs group"
            >
              <div className="flex flex-col">
                <span className="font-semibold text-ap-on-scrim-muted group-hover:text-blue-400">
                  IFRC GO Emergency Platform
                </span>
                <span className="text-xs text-ap-on-scrim-muted">
                  Red Cross / Red Crescent field operations and DREF emergency appeals
                </span>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-ap-on-scrim-muted group-hover:text-blue-400" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-carbon-30">
            <p className="font-medium text-amber-300 mb-1">Domestic Record</p>
            <p>
              This disaster record is cataloged domestically. No multilateral GLIDE identifier was registered for this local event.
            </p>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-carbon-80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-carbon-80 hover:bg-carbon-70 text-carbon-30 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlideResourcePopover;
