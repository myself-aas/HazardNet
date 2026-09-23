import React from 'react';
import { motion, Variants } from 'framer-motion';

export interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export const bentoContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

export const bentoItemVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 350,
      damping: 26,
    },
  },
};

export const BentoGrid: React.FC<BentoGridProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      variants={bentoContainerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${className}`}
    >
      {children}
    </motion.div>
  );
};

export interface BentoCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  statusBadge?: { label: string; color: string };
  icon?: React.ReactNode;
  gaugePercent?: number; // [0 - 100]
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  title,
  value,
  unit,
  subtitle,
  statusBadge,
  icon,
  gaugePercent,
  children,
  className = '',
  onClick,
}) => {
  return (
    <motion.div
      variants={bentoItemVariants}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`p-4 rounded-2xl bg-white dark:bg-carbon-90 border border-carbon-20/60 dark:border-carbon-70/60 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-nasa-blue text-lg">{icon}</span>}
          <span className="font-heading font-medium text-xs text-carbon-60 dark:text-carbon-40 uppercase tracking-wider">
            {title}
          </span>
        </div>
        {statusBadge && (
          <span
            className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold tracking-wide"
            style={{ backgroundColor: `${statusBadge.color}15`, color: statusBadge.color }}
          >
            {statusBadge.label}
          </span>
        )}
      </div>

      {/* Main Metric Value */}
      <div className="my-1 flex items-baseline gap-1.5">
        <span className="font-mono font-bold text-2xl sm:text-3xl text-carbon-90 dark:text-carbon-05 tracking-tight tabular-nums">
          {value}
        </span>
        {unit && (
          <span className="font-sans font-medium text-sm text-carbon-50 dark:text-carbon-40">
            {unit}
          </span>
        )}
      </div>

      {/* Optional SVG Progress Gauge */}
      {typeof gaugePercent === 'number' && (
        <div className="mt-2 space-y-1">
          <div className="w-full h-1.5 bg-carbon-10 dark:bg-carbon-80 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, gaugePercent))}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full bg-nasa-blue rounded-full"
              style={{
                backgroundColor:
                  gaugePercent > 75
                    ? '#dc2626'
                    : gaugePercent > 40
                    ? '#ea6f24'
                    : '#1c67e3',
              }}
            />
          </div>
        </div>
      )}

      {/* Subtitle / Micro Copy */}
      {subtitle && (
        <p className="mt-2 text-xs font-sans text-carbon-60 dark:text-carbon-40">
          {subtitle}
        </p>
      )}

      {children}
    </motion.div>
  );
};
