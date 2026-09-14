import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
export function RouteAccessibility() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    let name = pathname.split('/').filter(Boolean).pop() || 'Map';
    try { name = decodeURIComponent(name); } catch { name = 'Page'; }
    name = name.replace(/-/g, ' ');
    document.title = `${name.charAt(0).toUpperCase() + name.slice(1)} · HazardNet`;
    setAnnouncement(`Opened ${name}`);
    const frame = requestAnimationFrame(() => document.getElementById('main-content')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  return <><a className="hn-skip" href="#main-content">Skip to content</a><span className="sr-only" role="status" aria-live="polite">{announcement}</span></>;
}
