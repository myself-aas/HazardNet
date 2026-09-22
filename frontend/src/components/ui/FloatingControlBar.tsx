import React from 'react';
import { motion } from 'framer-motion';

export interface ControlChip {
  id: string;
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
}

export interface FloatingControlBarProps {
  chips?: ControlChip[];
  onSelectChip?: (id: string) => void;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  placeholder?: string;
  actionButton?: React.ReactNode;
  className?: string;
}

export const FloatingControlBar: React.FC<FloatingControlBarProps> = ({
  chips,
  onSelectChip,
  searchValue,
  onSearchChange,
  placeholder = 'Search districts, crops, or climate hazards...',
  actionButton,
  className = '',
}) => {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className={`w-full max-w-xl mx-auto bg-white/90 dark:bg-carbon-90/90 backdrop-blur-xl border border-carbon-20/60 dark:border-carbon-70/60 rounded-2xl shadow-lg p-2 flex flex-col gap-2 ${className}`}
    >
      {/* Top Row: Search Input & Primary Action */}
      {typeof onSearchChange === 'function' && (
        <div className="flex items-center gap-2 px-2 py-1 bg-surface-page/50 dark:bg-carbon-90/50 rounded-xl border border-carbon-20/40">
          <svg
            className="w-5 h-5 text-carbon-40 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="search"
            value={searchValue || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            aria-label="Search hazards, districts, or crops"
            className="w-full bg-transparent font-sans text-sm text-carbon-90 dark:text-carbon-05 placeholder-carbon-40 focus:outline-none min-h-[44px]"
          />
          {actionButton}
        </div>
      )}

      {/* Bottom Row: Filter / Layer Chips */}
      {chips && chips.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto touch-scroll py-1 px-1 scrollbar-none">
          {chips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => onSelectChip?.(chip.id)}
              aria-pressed={chip.active}
              className={`tap-target px-3 py-1.5 rounded-full text-xs font-sans font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                chip.active
                  ? 'bg-nasa-blue text-white shadow-xs'
                  : 'bg-carbon-10 dark:bg-carbon-80 text-carbon-70 dark:text-carbon-30 hover:bg-carbon-20 dark:hover:bg-carbon-70'
              }`}
            >
              {chip.icon}
              <span>{chip.label}</span>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};
