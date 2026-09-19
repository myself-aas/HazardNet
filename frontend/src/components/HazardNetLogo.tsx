import { useId } from 'react';
import { getSeverityColor } from '../services/geolocationService';

export interface HazardNetLogoProps {
  className?: string;
  size?: number | string;
  severity?: number; // Optional severity score (0.0 to 1.0)
  showText?: boolean;
  textSizeClass?: string;
  variant?: 'light' | 'dark' | 'auto';
}

export const HazardNetLogo: React.FC<HazardNetLogoProps> = ({
  className = "w-7 h-7",
  size,
  severity,
  showText = false,
  textSizeClass = "text-sm font-black tracking-tight",
  variant = 'auto',
}) => {
  const gradientId = useId().replace(/:/g, '');
  const cloudGradId = `hnCloudGrad-${gradientId}`;
  const boltGradId = `hnBoltGrad-${gradientId}`;

  // If a specific severity is passed, calculate its specific severity color
  const dynamicColor = typeof severity === 'number' ? getSeverityColor(severity) : null;

  const textClasses = variant === 'dark' 
    ? "text-white font-brand font-black tracking-tight" 
    : "text-carbon-90 font-brand font-black tracking-tight";

  return (
    <div className="inline-flex items-center justify-center shrink-0 leading-none">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`block shrink-0 align-middle ${className}`}
        style={size ? { width: size, height: size } : undefined}
      >
        <defs>
          {/* Full Severity Spectrum Gradient for Cloud (Green -> Amber -> Red) */}
          <linearGradient id={cloudGradId} x1="2" y1="2" x2="22" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#16a34a" /> {/* Green - 0% Low Severity */}
            <stop offset="50%" stopColor="#f59e0b" /> {/* Amber - 50% Moderate Severity */}
            <stop offset="100%" stopColor="#dc2626" /> {/* Red - 100% High Severity */}
          </linearGradient>

          {/* High Contrast Lightning Bolt Gradient (Warning Yellow -> Red) */}
          <linearGradient id={boltGradId} x1="9" y1="14" x2="15" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        <g id="SVGRepo_bgCarrier" strokeWidth="0" />
        <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
        <g id="SVGRepo_iconCarrier">
          {/* Cloud Body - Green -> Amber -> Red Severity Gradient */}
          <path
            d="M7.57755 18.0112C7.6367 17.8041 7.71731 17.6363 7.77668 17.5248C7.93435 17.2285 8.17537 16.9027 8.37785 16.629L9.6185 14.9492C9.94501 14.5069 10.2737 14.0616 10.5718 13.7516C10.7896 13.5251 11.5685 12.7345 12.6735 13.0733C13.8116 13.4224 13.9817 14.5527 14.0235 14.8632C14.0684 15.1965 14.0779 15.6082 14.0798 16.0315C14.3047 16.0358 14.5305 16.0469 14.7297 16.0748C15.0643 16.1216 15.8367 16.2783 16.2673 17.0517C16.2771 17.0692 16.2866 17.0869 16.2957 17.1046C16.4608 17.4236 16.5105 17.7318 16.5 18.0073C19.5566 17.8959 22 15.4102 22 12.3602C22 9.88664 20.393 7.78428 18.1551 7.01848C17.8371 4.19524 15.4159 2 12.4762 2C9.32028 2 6.7619 4.53004 6.7619 7.65101C6.7619 8.3413 6.88706 9.00269 7.11616 9.61419C6.8475 9.56202 6.56983 9.53468 6.28571 9.53468C3.91878 9.53468 2 11.4322 2 13.7729C2 16.1137 3.91878 18.0112 6.28571 18.0112H7.57755Z"
            fill={dynamicColor || `url(#${cloudGradId})`}
          />

          {/* Lightning Bolt - Severity Flash */}
          <path
            d="M9.62607 17.4647L10.7744 15.91C11.5166 14.905 11.8878 14.4025 12.234 14.5087C12.5803 14.6149 12.5803 15.2312 12.5803 16.4638V16.58C12.5803 17.0246 12.5803 17.2469 12.7222 17.3863L12.7297 17.3935C12.8748 17.53 13.106 17.53 13.5683 17.53C14.4004 17.53 14.8165 17.53 14.9571 17.7825C14.9594 17.7867 14.9617 17.7909 14.9639 17.7952C15.0966 18.0516 14.8557 18.3778 14.3739 19.0301L13.2256 20.5848C12.4833 21.5897 12.1122 22.0922 11.7659 21.986C11.4197 21.8798 11.4197 21.2635 11.4197 20.0309L11.4197 19.9148C11.4197 19.4702 11.4197 19.2479 11.2778 19.1085L11.2703 19.1012C11.1252 18.9648 10.894 18.9648 10.4317 18.9648C9.59958 18.9648 9.18354 18.9648 9.04294 18.7122C9.04061 18.708 9.03835 18.7038 9.03615 18.6996C8.90342 18.4431 9.1443 18.117 9.62607 17.4647Z"
            fill={dynamicColor ? "#ffffff" : `url(#${boltGradId})`}
          />
        </g>
      </svg>
      {showText && (
        <span className={`${textSizeClass} ${textClasses}`}>
          Hazard<span className="text-nasa-red-shade dark:text-nasa-red-tint">Net</span>
        </span>
      )}
    </div>
  );
};

export interface HazardNetBrandProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark';
  className?: string;
}

export const HazardNetBrand: React.FC<HazardNetBrandProps> = ({
  size = 'md',
  variant = 'light',
  className = '',
}) => {
  const sizeMap = {
    xs: { text: 'text-[14px] sm:text-[16px]', logo: 'w-6 h-6 sm:w-7 sm:h-7', gap: 'gap-2' },
    sm: { text: 'text-[16px] sm:text-[18px]', logo: 'w-8 h-8 sm:w-[34px] sm:h-[34px]', gap: 'gap-2.5' },
    md: { text: 'text-[20px] sm:text-[22px]', logo: 'w-9 h-9 sm:w-10 sm:h-10', gap: 'gap-3' },
    lg: { text: 'text-[24px] sm:text-[28px]', logo: 'w-11 h-11 sm:w-12 sm:h-12', gap: 'gap-3.5' },
    xl: { text: 'text-[32px] sm:text-[40px]', logo: 'w-14 h-14 sm:w-16 sm:h-16', gap: 'gap-4' },
  };

  const currentSize = sizeMap[size];
  const isDark = variant === 'dark';

  return (
    <span className={`inline-flex items-center ${currentSize.gap} select-none transition-all ${className}`}>
      <div className="shrink-0 flex items-center justify-center">
        <HazardNetLogo className={currentSize.logo} variant={variant} />
      </div>
      <span className={`font-montserrat font-[800] tracking-[0.05em] leading-none inline-flex items-center ${currentSize.text}`}>
        <span className={isDark ? 'text-white' : 'text-carbon-90'}>
          Hazard
        </span>
        <span className="text-nasa-red-shade dark:text-nasa-red-tint">
          Net
        </span>
      </span>
    </span>
  );
};

export default HazardNetLogo;

