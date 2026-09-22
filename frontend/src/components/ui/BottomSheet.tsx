import React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { HDS_TOKENS } from '../../design-system/tokens';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  snapPoints?: [number, number]; // [minHeightPx, maxHeightPx]
  footerContent?: React.ReactNode;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  snapPoints = [180, 520],
  footerContent,
  className = '',
}) => {
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, snapPoints[1]], [0.5, 0]);

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
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              stiffness: HDS_TOKENS.motion.springStandard.stiffness,
              damping: HDS_TOKENS.motion.springStandard.damping,
            }}
            drag="y"
            dragConstraints={{ top: 0, bottom: snapPoints[1] }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.y > 140 || info.velocity.y > 600) {
                onClose();
              }
            }}
            className={`pointer-events-auto relative w-full max-w-2xl mx-auto rounded-t-[28px] bg-white/92 dark:bg-carbon-90/92 backdrop-blur-xl border-t border-carbon-20/40 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${className}`}
          >
            {/* Drag Handle & Header */}
            <div className="pt-3 pb-2 px-4 flex flex-col items-center select-none bg-surface-page/30 dark:bg-carbon-90/30 border-b border-carbon-20/30">
              <div
                aria-label="Drag sheet handle"
                className="w-12 h-1.5 bg-carbon-30 hover:bg-carbon-40 rounded-full cursor-grab active:cursor-grabbing mb-2 transition-colors tap-target"
              />

              {(title || subtitle) && (
                <div className="w-full flex items-center justify-between mt-1">
                  <div>
                    {title && (
                      <h3 className="font-heading font-semibold text-lg text-carbon-90 dark:text-carbon-05 tracking-tight">
                        {title}
                      </h3>
                    )}
                    {subtitle && (
                      <p className="font-sans text-xs text-carbon-60 dark:text-carbon-40">
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Close sheet"
                    className="tap-target p-2 text-carbon-50 hover:text-carbon-90 dark:hover:text-white rounded-full hover:bg-carbon-10 dark:hover:bg-carbon-80 transition-colors"
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
              <div className="p-3 bg-surface-page/60 dark:bg-carbon-90/60 border-t border-carbon-20/30 backdrop-blur-md">
                {footerContent}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
