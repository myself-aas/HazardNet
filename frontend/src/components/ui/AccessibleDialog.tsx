import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
/** Native top-layer dialog: inert background, focus containment and Escape. */
export function AccessibleDialog({ children, title, onClose }: { children: ReactNode; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const dialog = ref.current;
    return () => { dialog?.close(); opener?.focus(); };
  }, []);
  return createPortal(<dialog ref={ref} aria-label={title} onCancel={e => { e.preventDefault(); close.current(); }} className="hazard-dialog">
    <button type="button" className="hn-button float-right" aria-label={`Close ${title}`} onClick={onClose}>Close ×</button>
    {children}
  </dialog>, document.body);
}
