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
      return <CloudLightning className="w-5 h-5 text-nasa-blue" />;
  }
};

export const getRiskColor = (risk: string) => {
  if (risk === 'High') {
    return {
      bg: 'bg-carbon-05 border-carbon-20 text-rose-800',
      badge: 'bg-[var(--severity-red)] text-white',
      bar: 'bg-[var(--severity-red)]',
      text: 'text-[var(--severity-red)]',
    };
  }
  if (risk === 'Moderate') {
    return {
      bg: 'bg-amber-50 border-amber-200 text-amber-900',
      badge: 'bg-[var(--severity-amber)] text-carbon-black font-bold',
      bar: 'bg-[var(--severity-amber)]',
      text: 'text-[var(--severity-amber)]',
    };
  }
  return {
    bg: 'bg-carbon-05 border-carbon-20 text-emerald-900',
    badge: 'bg-[var(--severity-green)] text-white',
    bar: 'bg-[var(--severity-green)]',
    text: 'text-[var(--severity-green)]',
  };
};

export type RiskStyles = ReturnType<typeof getRiskColor>;
