import { Link, useLocation } from 'react-router-dom';
import { HazardNetBrand } from '../components/HazardNetLogo';
import { usePageSeo } from '../hooks/usePageSeo';

export const NotFoundPage: React.FC = () => {
  const location = useLocation();
  // Unknown deep links fall through the SPA rewrite and resolve here with HTTP
  // 200 — a soft 404. usePageSeo finds no route entry for the path and applies
  // `noindex,follow`, so the page cannot be indexed as real content.
  usePageSeo(location.pathname);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border border-carbon-20 rounded-2xl p-6 lg:p-8 text-center space-y-5">
        <div className="flex justify-center">
          <HazardNetBrand size="md" />
        </div>

        <div className="space-y-2">
          <h1 className="text-ap-lead font-bold leading-[1.2] tracking-tight text-carbon-90">Page not found</h1>
          <p className="text-base leading-[1.62] text-carbon-70">
            The page or route you are attempting to access does not exist or has been moved.
          </p>
        </div>

        {/* The box that used to sit here printed `Status: 404 HTTP / Client Router Unmatched`
            in monospace: this repository's vocabulary, addressed to a visitor who mistyped a
            district slug. What the page actually knows is the path they asked for, so it says
            that instead. (2026-10-26 critique, P1.) */}
        <p className="text-sm leading-[1.62] text-carbon-70">
          You asked for{' '}
          <code className="break-all rounded-sm bg-carbon-05 px-1 py-0.5 font-mono text-carbon-80">
            {location.pathname}
          </code>
          .
        </p>

        {/* Two `.ap-btn` links, not two hand-rolled buttons. The pair used to be a square
            `bg-primary` block beside a `rounded-full` outline — two component libraries in
            one row, and both bypassing the system's own button. (Same critique, P1.) */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Link to="/" className="ap-btn flex-1">
            Home
          </Link>
          <Link to="/live" className="ap-btn ap-btn-secondary flex-1">
            Live map
          </Link>
        </div>

        {/* A reader who is here wanted something specific. These are the three destinations
            that account for almost all of it. */}
        <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-carbon-20 pt-4 text-xs font-bold">
          <li>
            <Link to="/alerts" className="text-ap-link underline underline-offset-2">
              Alerts
            </Link>
          </li>
          <li>
            <Link to="/districts" className="text-ap-link underline underline-offset-2">
              Districts
            </Link>
          </li>
          <li>
            <Link to="/docs" className="text-ap-link underline underline-offset-2">
              Documentation
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default NotFoundPage;
