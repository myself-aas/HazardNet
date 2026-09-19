import React from "react";
import { Link, useLocation } from 'react-router-dom';

interface BreadcrumbsProps {
  customItems?: { label: string; path?: string }[];
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ customItems }) => {
  const location = useLocation();

  const getBreadcrumbsFromPath = () => {
    if (customItems) return customItems;

    const pathnames = location.pathname.split('/').filter((x) => x);
    const items = [{ label: 'Home / GIS Map', path: '/' }];

    let currentPath = '';
    pathnames.forEach((name) => {
      currentPath += `/${name}`;
      let label = name.charAt(0).toUpperCase() + name.slice(1);
      if (name === 'analytics') label = 'Risk Analytics';
      if (name === 'upload') label = 'Raster Tile Ingestion';
      if (name === 'docs') label = 'Documentation & System Spec';
      if (name === 'about') label = 'About & Mission';
      if (name === 'use-cases') label = 'Use Cases & Profiles';
      if (name === 'download') label = 'Download Software Center';
      if (name === 'blogs') label = 'Research Blog & Insights';
      if (name === 'contact') label = 'Contact & Support';
      if (name === 'terms') label = 'Terms & Conditions';
      if (name === 'privacy') label = 'Privacy Policy';

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
                <Link
                  to={item.path}
                  className="text-carbon-60 hover:text-nasa-red-shade font-medium transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <Link
        to="/"
        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#ad6d04] border border-amber-200 font-bold transition-all text-[11px]"
      >
        <span>Back to Live GIS</span>
      </Link>
    </nav>
  );
};

export default Breadcrumbs;
