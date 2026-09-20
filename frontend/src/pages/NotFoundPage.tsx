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
      <div className="max-w-md w-full bg-white border border-carbon-20 p-6 lg:p-8 text-center space-y-5">
        <div className="flex justify-center">
          <HazardNetBrand size="md" />
        </div>

        <div className="space-y-2">
          <h1 className="text-[28px] font-bold leading-[1.2] tracking-tight text-carbon-90">
            Page not found
          </h1>
          <p className="text-base leading-[1.62] text-carbon-70">
            The page or route you are attempting to access does not exist or has been moved.
          </p>
        </div>

        <div className="p-3 bg-carbon-05 border border-carbon-20 text-xs text-carbon-60 font-mono text-left">
          Status: 404 HTTP / Client Router Unmatched
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Link
            to="/"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center bg-nasa-red-shade px-6 py-3 text-base font-semibold text-white hover:bg-nasa-red touch-manipulation"
          >
            Home
          </Link>
          <Link
            to="/live"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center border-2 border-nasa-blue px-6 py-3 text-base font-semibold text-nasa-blue-shade hover:bg-nasa-blue/5 touch-manipulation"
          >
            Live map
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
