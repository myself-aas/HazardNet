import { getSeverityColor } from '../services/geolocationService';

export interface HazardNetLogoProps {
  className?: string;
  size?: number | string;
  severity?: number;
  showText?: boolean;
  textSizeClass?: string;
  variant?: 'light' | 'dark' | 'auto';
}

export const HazardNetLogo: React.FC<HazardNetLogoProps> = ({
  className = 'w-7 h-7',
  size,
  severity,
  showText = false,
  textSizeClass = 'text-sm font-black tracking-tight',
  variant = 'auto',
}) => {
  const accent = typeof severity === 'number' ? getSeverityColor(severity) : undefined;
  return (
    <span className="inline-flex items-center justify-center shrink-0 leading-none">
      <img
        src="/hazardnet-mark.svg"
        alt={showText ? '' : 'HazardNet'}
        aria-hidden={showText || undefined}
        className={`block shrink-0 object-contain ${variant === 'dark' ? 'brightness-0 invert' : ''} ${className}`}
        style={{ width: size, height: size, filter: accent ? `drop-shadow(0 0 5px ${accent})` : undefined }}
      />
      {showText && (
        <span className={`${textSizeClass} ${variant === 'dark' ? 'text-white' : 'text-carbon-90'}`}>
          Hazard<span className="text-nasa-red-shade dark:text-nasa-red-tint">Net</span>
        </span>
      )}
    </span>
  );
};

export interface HazardNetBrandProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  className?: string;
}

export const HazardNetBrand: React.FC<HazardNetBrandProps> = ({ size = 'md', variant = 'light', className = '' }) => {
  const sizeMap = {
    xs: { text: 'text-[14px] sm:text-[16px]', logo: 'w-6 h-6 sm:w-7 sm:h-7', gap: 'gap-2' },
    sm: { text: 'text-[16px] sm:text-[18px]', logo: 'w-8 h-8 sm:w-[34px] sm:h-[34px]', gap: 'gap-2.5' },
    md: { text: 'text-[20px] sm:text-[22px]', logo: 'w-9 h-9 sm:w-10 sm:h-10', gap: 'gap-3' },
    lg: { text: 'text-[24px] sm:text-[28px]', logo: 'w-11 h-11 sm:w-12 sm:h-12', gap: 'gap-3.5' },
    xl: { text: 'text-[32px] sm:text-[40px]', logo: 'w-14 h-14 sm:w-16 sm:h-16', gap: 'gap-4' },
  }[size];
  const isDark = variant === 'dark';

  return (
    <span className={`inline-flex items-center ${sizeMap.gap} select-none ${className}`}>
      <HazardNetLogo className={sizeMap.logo} variant={variant} />
      <span className={`font-brand font-semibold tracking-[0.02em] leading-none inline-flex items-center ${sizeMap.text}`}>
        <span className={isDark ? 'text-white' : 'text-carbon-90'}>Hazard</span>
        <span className="text-nasa-red-shade dark:text-nasa-red-tint">Net</span>
      </span>
    </span>
  );
};

export default HazardNetLogo;
