import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbsProps {
  customItems?: { label: string; path?: string }[];
  className?: string;
  showLiveMapLink?: boolean;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  customItems,
  className = '',
  showLiveMapLink = true,
}) => {
  const location = useLocation();

  const getBreadcrumbsFromPath = () => {
    if (customItems) return customItems;

    const pathnames = location.pathname.split('/').filter((x) => x);
    const items = [{ label: 'Home', path: '/' }];

    // Plain words, one or two per crumb (the same rule as the menus — see lib/navigation.ts).
    const LABELS: Record<string, string> = {
      analytics: 'Analytics',
      upload: 'Lookup',
      docs: 'Docs',
      platform: 'The platform',
      hazards: 'Hazard classes',
      districts: 'Districts',
      forecasts: 'Forecasts',
      'alerts-and-advisories': 'Alerts and advisories',
      archive: 'Historical archive',
      'data-and-api': 'Data and the API',
      verification: 'Verification',
      about: 'About',
      'use-cases': 'Use cases',
      download: 'Downloads',
      blogs: 'Blog',
      profile: 'Profile',
      dashboard: 'Dashboard',
      contact: 'Contact',
      terms: 'Terms',
      privacy: 'Privacy',
    };

    let currentPath = '';
    pathnames.forEach((name) => {
      currentPath += `/${name}`;
      const label = LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

      items.push({ label, path: currentPath });
    });

    return items;
  };

  const items = getBreadcrumbsFromPath();

  return (
    <nav
      aria-label="Breadcrumb"
      className={`hn-breadcrumb flex items-center justify-between gap-4 py-1.5 mb-5 text-xs text-carbon-60 ${className}`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              {index > 0 && (
                <span aria-hidden="true" className="text-carbon-40 font-mono select-none">
                  /
                </span>
              )}
              {isLast || !item.path ? (
                <span aria-current="page" className="font-semibold text-carbon-90">
                  {item.label}
                </span>
              ) : (
                <Link to={item.path} className="text-carbon-60 hover:text-ap-link font-medium transition-colors">
                  {item.label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {showLiveMapLink && (
        <Link
          to="/"
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1 bg-carbon-10 hover:bg-carbon-20 text-carbon-70 hover:text-carbon-90 border border-carbon-20 rounded-full font-medium transition-colors text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ap-primary/60"
        >
          <span>Live map</span>
        </Link>
      )}
    </nav>
  );
};

export default Breadcrumbs;
