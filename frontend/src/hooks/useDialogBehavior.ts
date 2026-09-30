/**
 * Modal dialog behaviour in one place.
 *
 * Why this exists: nine surfaces in this app declare `role="dialog"` and
 * `aria-modal="true"`, and until now only one of them (`MenuDrawer`) actually
 * delivered what `aria-modal` promises. The rest let Tab walk straight out of
 * the dialog into the page behind it, so a screen-reader user filling in the
 * event-report form could tab into the map and activate controls they could not
 * see. `aria-modal` is a promise of containment; shipping it without the
 * containment is worse than omitting it.
 *
 * The behaviour lifted out of `MenuDrawer` (which had it right) is:
 *   - Escape closes
 *   - focus is saved on open and restored on close, so dismissing a dialog
 *     returns the user to the control that opened it
 *   - body scroll is locked while open, and the *previous* value is restored —
 *     not hardcoded to `''`, which leaks a locked body when two dialogs nest
 *   - Tab and Shift+Tab cycle inside the dialog instead of escaping it
 *
 * Deliberately NOT done here: `inert` on the page behind the dialog. These
 * dialogs are not portalled to `document.body`, so the dialog and the page it
 * covers share a React ancestor — marking that ancestor inert would inert the
 * dialog too. The Tab cycle covers the keyboard path that the audit actually
 * measured ("Tab walks out of the modal"), and `aria-modal` already tells
 * assistive tech to treat the background as inert. Making `inert` safe requires
 * portalling the dialogs first, which is a structural change and a separate
 * piece of work.
 */

import { useEffect, useRef } from 'react';

/** Elements a keyboard user can reach, in DOM order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface UseDialogBehaviorOptions {
  /** Whether the dialog is currently open. */
  isOpen: boolean;
  /** Called when the user asks to dismiss (Escape). */
  onClose: () => void;
  /**
   * The element that contains the dialog's focusable content. Tab is cycled
   * inside it. Pass a ref to the panel, not the full-screen backdrop.
   */
  containerRef: React.RefObject<HTMLElement | null>;
  /**
   * Element to focus when the dialog opens. Defaults to the first focusable
   * element inside `containerRef`, then the container itself.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /**
   * True for real modals (default): locks scroll and traps Tab. Set false for a
   * non-modal surface that only wants Escape and focus restoration.
   */
  modal?: boolean;
}

function isVisible(el: HTMLElement): boolean {
  // `offsetParent` is the obvious choice and the wrong one: it is null for any
  // element that is itself `position: fixed`, which is most of these dialogs.
  // `checkVisibility` answers the actual question — would a user see this? —
  // and accounts for display, visibility and opacity on the element and its
  // ancestors. The manual walk is the fallback for older engines and for jsdom,
  // which does not implement checkVisibility.
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  }
  let node: HTMLElement | null = el;
  while (node) {
    const style = window.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    node = node.parentElement;
  }
  return true;
}

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

export function useDialogBehavior({
  isOpen,
  onClose,
  containerRef,
  initialFocusRef,
  modal = true,
}: UseDialogBehaviorOptions): void {
  // Kept in a ref so the keydown listener is registered once per open/close
  // rather than re-bound whenever a caller passes an inline arrow function.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const restoreFocusTo = useRef<HTMLElement | null>(null);

  // Escape, and the Tab cycle. Registered on the document in the capture phase
  // so a handler inside the dialog cannot swallow the key first.
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !modal) return;

      const container = containerRef.current;
      if (!container) return;

      // Only cycle when focus is inside the dialog. Without this guard the
      // handler would hijack Tab for the whole document the moment a dialog
      // mounts, including while focus is still on the page behind it.
      if (!container.contains(document.activeElement)) return;

      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        // Nothing reachable inside: keep focus on the container itself.
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, modal, containerRef]);

  // Focus save/restore, scroll lock, and initial focus.
  useEffect(() => {
    if (!isOpen) return undefined;

    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    // Captured at open time, as react-hooks/exhaustive-deps asks. The one case
    // where this differs from reading `containerRef.current` in the cleanup is a
    // viewport crossing the sm breakpoint while the dialog is open, which swaps
    // which of DisasterDetailModalUI's two branches is on screen; in that case
    // the containment check falls back to "focus is on body", which still
    // restores focus to the opener.
    const containerAtOpen = containerRef.current;

    const previousOverflow = document.body.style.overflow;
    if (modal) document.body.style.overflow = 'hidden';

    // Focus after the open transition has a frame to lay out, so the container
    // and its children exist and are measurable.
    const focusTimer = window.setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;
      const target = initialFocusRef?.current ?? focusableWithin(container)[0] ?? container;
      target.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      if (modal) document.body.style.overflow = previousOverflow;
      const restore = restoreFocusTo.current;
      // Only restore if focus is still inside the dialog (or on body). If the
      // user has already moved focus elsewhere, stealing it back is hostile.
      if (restore && typeof restore.focus === 'function') {
        const active = document.activeElement;
        if (!active || active === document.body || containerAtOpen?.contains(active)) {
          restore.focus({ preventScroll: true });
        }
      }
      restoreFocusTo.current = null;
    };
    // `containerRef` is a ref object and stable; `initialFocusRef` likewise.
  }, [isOpen, modal, containerRef, initialFocusRef]);
}

/**
 * Convenience wrapper for the common case: one ref on the dialog panel.
 * Returns the ref to spread onto the panel element.
 */
export function useDialogPanel<T extends HTMLElement = HTMLDivElement>(
  options: Omit<UseDialogBehaviorOptions, 'containerRef'>,
) {
  const containerRef = useRef<T | null>(null);
  useDialogBehavior({ ...options, containerRef });
  return containerRef;
}

/** Re-exported for tests: the selector a keyboard user can actually reach. */
export const DIALOG_FOCUSABLE_SELECTOR = FOCUSABLE;

export type { UseDialogBehaviorOptions as DialogBehaviorOptions };
