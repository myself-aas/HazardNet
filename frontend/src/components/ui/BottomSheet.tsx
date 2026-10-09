import React from 'react';
import { createPortal } from 'react-dom';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useDragControls,
  animate,
  type PanInfo,
} from 'framer-motion';
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
  /** Controlled stage. Omit it and the sheet manages its own, starting at `half`. */
  stage?: SheetDisclosureStage;
  onStageChange?: (stage: SheetDisclosureStage) => void;
  /**
   * Modal (default): dims the page, traps focus, locks scroll, and Escape closes.
   * Non-modal: the page stays fully interactive underneath, for detail panels the
   * user should be able to use alongside the map (e.g. picking another district).
   */
  modal?: boolean;
  /** Accessible name for the dialog. Defaults to `title`. */
  ariaLabel?: string;
  /** Accessible name for the header close control. */
  closeLabel?: string;
  /** Test hook on the sheet element. */
  testId?: string;
}

const STAGE_ORDER: SheetDisclosureStage[] = ['peek', 'half', 'expanded'];

/**
 * Each stage is a fixed share of the viewport. The sheet's height comes from the
 * stage, not from its content: otherwise short content makes "full" look identical
 * to "half", and the drag gesture appears to do nothing. Literal class names so
 * Tailwind generates them.
 */
const STAGE_HEIGHT_CLASS: Record<SheetDisclosureStage, string> = {
  peek: 'h-[38vh]',
  half: 'h-[62vh]',
  expanded: 'h-[92vh]',
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
  stage: controlledStage,
  onStageChange,
  modal = true,
  ariaLabel,
  closeLabel = 'Close sheet',
  testId,
}) => {
  const [internalStage, setInternalStage] = React.useState<SheetDisclosureStage>('half');
  const isControlled = controlledStage !== undefined;
  const stage: SheetDisclosureStage = isControlled ? (controlledStage as SheetDisclosureStage) : internalStage;
  const stageIndex = STAGE_ORDER.indexOf(stage);
  const maxSnap = snapPoints[snapPoints.length - 1] ?? 540;

  /** Live drag offset. 0 means "sitting exactly on the current stage". */
  const y = useMotionValue(0);

  // The scrim follows the sheet: the taller the sheet, the more it dims, and
  // dragging the sheet down lifts the dim with it.
  const backdropOpacity = useTransform(y, [-160, 0, maxSnap], [0.55, 0.45, 0]);

  const sheetRef = React.useRef<HTMLDivElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  // Drag starts only from the header, so a flick inside the scrolling body scrolls it.
  const dragControls = useDragControls();

  // `aria-modal` promises containment; this is what delivers it. Only modal sheets
  // take over focus, scroll and Escape.
  useDialogBehavior({ isOpen: isOpen && modal, onClose, containerRef: sheetRef, initialFocusRef: closeButtonRef });

  const setStage = React.useCallback(
    (next: SheetDisclosureStage) => {
      if (!isControlled) setInternalStage(next);
      onStageChange?.(next);
    },
    [isControlled, onStageChange],
  );

  /** Return the sheet to rest on whatever stage is current. */
  const settle = React.useCallback(() => {
    animate(y, 0, {
      type: 'spring',
      stiffness: APPLE_MOTION.springStandard.stiffness,
      damping: APPLE_MOTION.springStandard.damping,
    });
  }, [y]);

  const goToStage = React.useCallback(
    (next: SheetDisclosureStage) => {
      setStage(next);
      settle();
    },
    [setStage, settle],
  );

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { offset, velocity } = info;

    // A downward flick, or a long downward drag, dismisses.
    if (offset.y > 140 || velocity.y > 700) {
      onClose();
      return;
    }

    // An upward flick, or a deliberate upward drag, opens one stage further.
    if (offset.y < -60 || velocity.y < -700) {
      goToStage(STAGE_ORDER[Math.min(stageIndex + 1, STAGE_ORDER.length - 1)]);
      return;
    }

    // A short downward drag collapses one stage.
    if (offset.y > 60) {
      if (stageIndex === 0) {
        onClose();
        return;
      }
      goToStage(STAGE_ORDER[stageIndex - 1]);
      return;
    }

    // Nothing decisive: spring back to where it was.
    settle();
  };

  const nextStage = STAGE_ORDER[stageIndex === STAGE_ORDER.length - 1 ? 0 : stageIndex + 1];

  // Portalled to <body>: a sheet rendered inside a map container inherits that
  // container's stacking context, so page chrome can paint over it.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          role="dialog"
          aria-modal={modal ? 'true' : undefined}
          aria-label={ariaLabel || title || 'Contextual information sheet'}
          className="fixed inset-0 z-[var(--ap-z-modal)] flex flex-col justify-end pointer-events-none"
        >
          {/* Scrim. Modal only. Tapping it dismisses, the way every modal sheet should. */}
          {modal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.45 }}
              exit={{ opacity: 0 }}
              style={{ opacity: backdropOpacity }}
              onClick={onClose}
              className="absolute inset-0 bg-ap-scrim pointer-events-auto cursor-pointer"
            />
          )}

          {/* The sheet: draggable up and down, snapping between stages. */}
          <motion.div
            ref={sheetRef}
            tabIndex={-1}
            data-sheet-stage={stage}
            data-testid={testId}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'spring',
              stiffness: APPLE_MOTION.springStandard.stiffness,
              damping: APPLE_MOTION.springStandard.damping,
            }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            // Anchored to the bottom of the screen: negative y lifts the sheet
            // towards expanded, positive y drops it towards dismissal. The upper
            // limit is small because the stage change, not the drag distance, sets
            // the height; a larger limit would push the sheet off the top edge.
            dragConstraints={{ top: -120, bottom: maxSnap }}
            dragElastic={0.06}
            dragMomentum={false}
            style={{ y }}
            onDragEnd={handleDragEnd}
            className={`pointer-events-auto relative w-full max-w-2xl mx-auto ap-sheet overflow-hidden flex flex-col transition-[height] duration-300 ${STAGE_HEIGHT_CLASS[stage]} ${className}`}
          >
            {/* Grabber and header. The grabber is also the stage control. */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="pt-2 pb-2 px-4 flex flex-col items-center select-none bg-surface-page/30 border-b border-carbon-20/30 shrink-0 touch-none"
            >
              <button
                type="button"
                onClick={() => goToStage(nextStage)}
                aria-label={`Cycle sheet height (current: ${stage}, next: ${nextStage})`}
                className="min-h-[44px] min-w-[44px] px-4 flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors tap-target"
              >
                <span className="ap-sheet-grabber" aria-hidden="true" />
              </button>

              {(title || subtitle) && (
                <div className="w-full flex items-start justify-between gap-3 mt-1">
                  <div className="min-w-0">
                    {title && (
                      <h3 className="font-heading font-semibold text-base text-carbon-90 dark:text-white tracking-tight truncate">
                        {title}
                      </h3>
                    )}
                    {subtitle && (
                      <p className="font-sans text-xs text-carbon-60 truncate">{subtitle}</p>
                    )}
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel}
                    className="tap-target min-h-[44px] min-w-[44px] p-2 text-carbon-60 hover:text-carbon-90 dark:hover:text-white rounded-full hover:bg-carbon-10 dark:hover:bg-carbon-80 transition-colors shrink-0"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Body. Takes whatever the stage leaves after the header and footer, and scrolls. */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-4 touch-scroll">
              {children}
            </div>

            {/* Actions. Side by side, never stacked: a sheet is short on vertical room. */}
            {footerContent && (
              <div className="p-3 bg-surface-page/60 border-t border-carbon-20/30 backdrop-blur-md shrink-0">
                <div className="flex flex-row items-center justify-end gap-3 flex-nowrap">{footerContent}</div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
