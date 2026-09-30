/**
 * Behavioural tests for useDialogBehavior.
 *
 * Why this exists: nine surfaces declare `role="dialog"` + `aria-modal="true"`,
 * and `aria-modal` is a promise of containment. These tests pin the four things
 * the hook promises — Escape, focus save/restore, scroll lock, and the Tab cycle
 * — so a regression in any of them fails here rather than in front of a
 * screen-reader user who tabs out of a form into the map behind it.
 *
 * The Tab-cycle case is the one that matters most: it is the exact failure the
 * audit measured ("Tab walks out of the modal"), and it is invisible to a
 * smoke test that only checks the dialog renders.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { useRef } from 'react';
import { useDialogBehavior } from '../useDialogBehavior';

/** Minimal harness: a page behind the dialog, plus a dialog with 3 focusables. */
function Harness({
  isOpen,
  onClose,
  modal = true,
}: {
  isOpen: boolean;
  onClose: () => void;
  modal?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehavior({ isOpen, onClose, containerRef: panelRef, modal });

  return (
    <div>
      {/* The page behind the dialog — reachable only if focus escapes. */}
      <button type="button">background-button</button>
      {isOpen && (
        <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true">
          <button type="button">first</button>
          <button type="button">middle</button>
          <button type="button">last</button>
        </div>
      )}
    </div>
  );
}

const lastFocused = () => document.activeElement?.textContent ?? null;

/**
 * jsdom dispatches keydown but does not move focus the way a browser does, so a
 * Tab test that only fires the event proves nothing: with the trap removed,
 * focus simply stays put and "never reaches the background" passes vacuously.
 *
 * This emulates the browser: on Tab, move focus to the next focusable element in
 * the document — including ones outside the dialog — but only when the event was
 * not already prevented. The hook's trap calls preventDefault and moves focus
 * itself, so a working trap leaves this a no-op and a broken one lets focus
 * escape, which is what the test needs to observe.
 */
function installBrowserTab() {
  const selector = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const onTab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
    const index = all.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey ? index - 1 : index + 1;
    const target = all[(next + all.length) % all.length];
    target?.focus();
  };
  document.addEventListener('keydown', onTab);
  return () => document.removeEventListener('keydown', onTab);
}

describe('useDialogBehavior', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('closes on Escape', () => {
    const onClose = jest.fn();
    render(<Harness isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closed', () => {
    const onClose = jest.fn();
    render(<Harness isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks body scroll while open and restores the previous value', () => {
    // A previous value, not the empty string: two nested dialogs must not leave
    // the body locked when the inner one closes.
    document.body.style.overflow = 'scroll';
    const { rerender } = render(<Harness isOpen={false} onClose={jest.fn()} />);
    rerender(<Harness isOpen onClose={jest.fn()} />);
    expect(document.body.style.overflow).toBe('hidden');
    rerender(<Harness isOpen={false} onClose={jest.fn()} />);
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('saves focus on open and restores it on close', () => {
    jest.useFakeTimers();
    try {
      const { rerender } = render(<Harness isOpen={false} onClose={jest.fn()} />);
      // Focus the control that would have opened the dialog.
      const opener = screen.getByText('background-button');
      act(() => opener.focus());
      expect(lastFocused()).toBe('background-button');

      rerender(<Harness isOpen onClose={jest.fn()} />);
      // The hook defers initial focus by a frame so the panel and its children
      // exist; flush that timer.
      act(() => { jest.advanceTimersByTime(1); });
      expect(lastFocused()).not.toBe('background-button');

      rerender(<Harness isOpen={false} onClose={jest.fn()} />);
      expect(lastFocused()).toBe('background-button');
    } finally {
      jest.useRealTimers();
    }
  });

  it('cycles Tab inside the dialog instead of escaping to the page behind', () => {
    const uninstall = installBrowserTab();
    try {
      render(<Harness isOpen onClose={jest.fn()} />);
      const first = screen.getByText('first');
      const last = screen.getByText('last');

      act(() => first.focus());
      // Shift+Tab on the first element must wrap to the last, not leave the dialog.
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(lastFocused()).toBe('last');

      act(() => last.focus());
      // Tab on the last element must wrap to the first.
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      expect(lastFocused()).toBe('first');
    } finally {
      uninstall();
    }
  });

  it('never lets Tab reach the background while the dialog is open', () => {
    // The audit's stated gate, with real browser Tab semantics installed so the
    // assertion can actually fail. Verified by negative control: neutering the
    // trap in the hook makes this test fail.
    const uninstall = installBrowserTab();
    try {
      render(<Harness isOpen onClose={jest.fn()} />);
      const focusables = ['first', 'middle', 'last'].map((t) => screen.getByText(t));

      for (const start of focusables) {
        act(() => start.focus());
        for (let i = 0; i < 8; i += 1) {
          fireEvent.keyDown(document, { key: 'Tab', shiftKey: i % 2 === 0 });
          expect(lastFocused()).not.toBe('background-button');
        }
      }
    } finally {
      uninstall();
    }
  });

  it('does not trap Tab for a non-modal surface', () => {
    // `modal={false}` keeps Escape and focus restoration but leaves Tab alone,
    // which is correct for an inline card that is not covering the page. With
    // browser Tab semantics installed, focus must be free to leave.
    const uninstall = installBrowserTab();
    try {
      render(<Harness isOpen onClose={jest.fn()} modal={false} />);
      const last = screen.getByText('last');
      act(() => last.focus());
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      expect(lastFocused()).toBe('background-button');
    } finally {
      uninstall();
    }
  });

  it('does not hijack Tab when focus is outside the dialog', () => {
    // The handler must only act while focus is inside. Without this guard the
    // listener would swallow Tab for the whole document the moment a dialog
    // mounts, including while focus is still behind it.
    const uninstall = installBrowserTab();
    try {
      render(<Harness isOpen onClose={jest.fn()} />);
      act(() => screen.getByText('background-button').focus());
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
      expect(lastFocused()).toBe('first');
    } finally {
      uninstall();
    }
  });
});
