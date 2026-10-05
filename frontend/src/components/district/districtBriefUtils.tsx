import React from 'react';
import { Waves, Wind, Sun, Snowflake, CloudLightning } from 'lucide-react';

export const getHazardIcon = (hazard: string) => {
  switch (hazard) {
    case 'Flash Flood':
    case 'Monsoon Flood':
      return <Waves className="w-5 h-5 text-blue-600" />;
    case 'Tropical Cyclone':
      return <Wind className="w-5 h-5 text-sky-600" />;
    case 'Drought':
      return <Sun className="w-5 h-5 text-amber-600" />;
    case 'Cold Wave':
      return <Snowflake className="w-5 h-5 text-indigo-600" />;
    default:
      return <CloudLightning className="w-5 h-5 text-ap-link" />;
  }
};

export const getRiskColor = (risk: string) => {
  if (risk === 'High') {
    return {
      bg: 'bg-carbon-05 border-carbon-20 text-rose-800',
      badge: 'bg-[var(--ap-sev-very-high)] text-white',
      bar: 'bg-[var(--ap-sev-very-high)]',
      text: 'text-[var(--ap-sev-very-high)]',
    };
  }
  if (risk === 'Moderate') {
    return {
      bg: 'bg-amber-50 border-amber-200 text-amber-900',
      badge: 'bg-[var(--ap-sev-moderate)] text-carbon-black font-bold',
      bar: 'bg-[var(--ap-sev-moderate)]',
      text: 'text-[var(--ap-sev-moderate)]',
    };
  }
  return {
    bg: 'bg-carbon-05 border-carbon-20 text-emerald-900',
    badge: 'bg-[var(--ap-sev-low)] text-white',
    bar: 'bg-[var(--ap-sev-low)]',
    text: 'text-[var(--ap-sev-low)]',
  };
};

export type RiskStyles = ReturnType<typeof getRiskColor>;
