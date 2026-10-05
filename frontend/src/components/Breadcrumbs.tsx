import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbsProps {
  customItems?: { label: string; path?: string }[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ customItems }) => {
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
    <nav className="flex items-center justify-between gap-4 py-2.5 px-4 bg-white border border-carbon-20 rounded-xl mb-6 text-xs shadow-xs text-carbon-60">
      <div className="flex items-center gap-1.5 flex-wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              {index > 0 && <span className="text-carbon-60 font-mono">/</span>}
              {isLast || !item.path ? (
                <span className="font-bold text-carbon-90">{item.label}</span>
              ) : (
                <Link to={item.path} className="text-carbon-60 hover:text-nasa-red-shade font-medium transition-colors">
                  {item.label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <Link
        to="/"
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold transition-all text-xs"
      >
        <span>Live map</span>
      </Link>
    </nav>
  );
};

export default Breadcrumbs;
