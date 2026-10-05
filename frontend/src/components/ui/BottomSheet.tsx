import React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { APPLE_MOTION, APPLE_TOUCH } from '@hazardnet/design-system';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

export type SheetDisclosureStage = 'peek' | 'half' | 'expanded';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  snapPoints?: [number, number] | [number, number, number]; // [peekPx, halfPx, expandedPx]
  footerContent?: React.ReactNode;
  className?: string;
}

const NEXT_SHEET_STAGE: Record<SheetDisclosureStage, SheetDisclosureStage> = {
  peek: 'half',
  half: 'expanded',
  expanded: 'peek',
};

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  snapPoints = [APPLE_TOUCH.bottomSheetSnapMin, 360, APPLE_TOUCH.bottomSheetSnapMax],
  footerContent,
  className = '',
}) => {
  const [stage, setStage] = React.useState<SheetDisclosureStage>('half');
  const maxSnap = snapPoints[snapPoints.length - 1] ?? 540;
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, maxSnap], [0.5, 0]);

  // `aria-modal="true"` below promises containment; this is what delivers it.
  // Escape closes, focus is saved and restored, body scroll locks, and Tab
  // cycles inside the sheet instead of walking out into the page behind it.
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  useDialogBehavior({ isOpen, onClose, containerRef: sheetRef, initialFocusRef: closeButtonRef });

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          aria-modal="true"
          role="dialog"
          aria-label={title || 'Contextual Information Sheet'}
          className="fixed inset-0 z-modal flex flex-col justify-end pointer-events-none"
        >
          {/* Glassmorphic Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            style={{ opacity: backdropOpacity }}
            onClick={onClose}
            className="absolute inset-0 bg-carbon-black/60 backdrop-blur-xs pointer-events-auto cursor-pointer"
          />

          {/* Interactive Drag Sheet */}
          <motion.div
            ref={sheetRef}
            tabIndex={-1}
            data-sheet-stage={stage}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              stiffness: APPLE_MOTION.springStandard.stiffness,
              damping: APPLE_MOTION.springStandard.damping,
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: maxSnap }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.y > 140 || info.velocity.y > 600) {
                onClose();
              } else if (info.offset.y < -60) {
                setStage('expanded');
              } else if (info.offset.y > 60) {
                setStage('peek');
              }
            }}
            className={`pointer-events-auto relative w-full max-w-2xl mx-auto rounded-t-xl bg-white/92 backdrop-blur-xl border-t border-carbon-20/40 shadow-2xl overflow-hidden flex flex-col ${
              stage === 'peek' ? 'max-h-[32vh]' : stage === 'half' ? 'max-h-[60vh]' : 'max-h-[85vh]'
            } ${className}`}
          >
            {/* Drag Handle & Header */}
            <div className="pt-2 pb-2 px-4 flex flex-col items-center select-none bg-surface-page/30 border-b border-carbon-20/30">
              <button
                type="button"
                onClick={() => setStage((prev) => NEXT_SHEET_STAGE[prev])}
                aria-label={`Cycle sheet height (current: ${stage})`}
                className="min-h-[44px] min-w-[44px] px-4 flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors tap-target"
              >
                <span className="w-12 h-1.5 bg-carbon-30 hover:bg-carbon-40 rounded-full" aria-hidden="true" />
              </button>

              {(title || subtitle) && (
                <div className="w-full flex items-center justify-between mt-1">
                  <div>
                    {title && (
                      <h3 className="font-heading font-semibold text-lg text-carbon-90 tracking-tight">
                        {title}
                      </h3>
                    )}
                    {subtitle && (
                      <p className="font-sans text-xs text-carbon-60">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    aria-label="Close sheet"
                    className="tap-target p-2 text-carbon-60 hover:text-carbon-90 dark:hover:text-white rounded-full hover:bg-carbon-10 dark:hover:bg-carbon-80 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 touch-scroll">
              {children}
            </div>

            {/* Sticky Footer Action Bar */}
            {footerContent && (
              <div className="p-3 bg-surface-page/60 border-t border-carbon-20/30 backdrop-blur-md">
                {footerContent}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
