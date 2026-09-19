import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Smartphone, ExternalLink, ShieldCheck } from 'lucide-react';

interface PrintQrCodeProps {
  url?: string;
  title?: string;
  subtitle?: string;
  districtOrSector?: string;
  className?: string;
  size?: number;
  showInScreen?: boolean;
}

/**
 * Generates an official QR Code for physical emergency advisory handouts & digital verification.
 * In print media, this ensures field responders can scan paper advisories to access live digital
 * telemetry, sensor feeds, and active early warnings on mobile devices.
 */
export const PrintQrCode: React.FC<PrintQrCodeProps> = ({
  url,
  title = 'Live Digital Directive & Real-time Field Telemetry',
  subtitle = 'Scan with mobile camera to access live situation map & updates',
  districtOrSector,
  className = '',
  size = 76,
  showInScreen = false,
}) => {
// Clean and official target URL without noisy query params or sandbox URLs
  const resolvedUrl =
    url ||
    (districtOrSector
      ? `https://www.hazardnet.live/forecast/district/${districtOrSector.toLowerCase().replace(/\s+/g, '-')}`
      : 'https://www.hazardnet.live');

  return (
    <div
      className={`print-qr-code-box ${showInScreen ? 'flex' : 'hidden print:flex print-only'} items-center gap-3 p-2 bg-white border border-carbon-30 rounded-xl ${className}`}
    >
      {/* High-Resolution Vector QR Code */}
      <div className="p-1 bg-white border border-carbon-20 rounded-lg shrink-0">
        <QRCodeSVG
          value={resolvedUrl}
          size={size}
          level="M"
          includeMargin={false}
          fgColor="#17171b"
          bgColor="#ffffff"
        />
      </div>

      {/* Clean Identification */}
      <div className="flex-1 min-w-0 font-sans">
        <div className="flex items-center gap-1 text-[8pt] font-mono font-black text-carbon-90 uppercase tracking-tight">
          <QrCode className="w-3 h-3 text-carbon-70 shrink-0" />
          <span>{title}</span>
        </div>

        <p className="text-[7pt] text-carbon-60 font-medium leading-snug mt-0.5">
          {subtitle}
        </p>
      </div>
    </div>
  );
};

export default PrintQrCode;
