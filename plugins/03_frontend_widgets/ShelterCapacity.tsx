import React from 'react';

interface ShelterCapacityProps {
  districtName: string;
  occupancyPercent?: number;
  availableBeds?: number;
  totalBeds?: number;
}

export const ShelterCapacityWidget: React.FC<ShelterCapacityProps> = ({
  districtName,
  occupancyPercent = 42,
  availableBeds = 1160,
  totalBeds = 2000,
}) => {
  return (
    <div className="p-4 bg-red-50 dark:bg-red-950/30 border-l-4 border-red-500 rounded-r-lg shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-red-900 dark:text-red-300 text-sm flex items-center gap-2">
          <span>🚨</span> Cyclone Shelter Capacity Status ({districtName})
        </h3>
        <span className="text-xs px-2 py-0.5 rounded bg-red-200 dark:bg-red-900/60 text-red-800 dark:text-red-200 font-semibold">
          Live Telemetry
        </span>
      </div>
      <p className="text-xs text-red-700 dark:text-red-400 mt-1">
        {availableBeds.toLocaleString()} / {totalBeds.toLocaleString()} emergency beds available across designated polder shelters.
      </p>
      <div className="w-full bg-red-200 dark:bg-red-900/40 rounded-full h-2 mt-2.5 overflow-hidden">
        <div
          className="bg-red-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${occupancyPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-red-600 dark:text-red-400 mt-1 font-mono">
        <span>Occupancy: {occupancyPercent}%</span>
        <span>Source: DMB & CPP Bangladesh</span>
      </div>
    </div>
  );
};

export default ShelterCapacityWidget;
