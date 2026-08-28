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
  // Resolve canonical target URL (fallback to window.location.href)
  const resolvedUrl = url || (typeof window !== 'undefined' ? window.location.href : 'https://hazardnet.bd');

  return (
    <div
      className={`print-qr-code-box ${showInScreen ? 'flex' : 'hidden print:flex print-only'} items-center gap-3.5 p-2.5 bg-white border border-slate-300 rounded-xl ${className}`}
    >
      {/* High-Resolution Vector QR Code for Crisp Print Media */}
      <div className="p-1.5 bg-white border border-slate-200 rounded-lg shrink-0 shadow-xs">
        <QRCodeSVG
          value={resolvedUrl}
          size={size}
          level="M"
          includeMargin={false}
          fgColor="#0f172a"
          bgColor="#ffffff"
        />
      </div>

      {/* QR Code Identification & Instructions */}
      <div className="flex-1 min-w-0 space-y-1 font-sans">
        <div className="flex items-center gap-1.5 text-[8pt] font-mono font-black text-slate-900 uppercase tracking-tight">
          <QrCode className="w-3 h-3 text-slate-700 shrink-0" />
          <span>{districtOrSector ? `${districtOrSector} • ` : ''}{title}</span>
        </div>

        <p className="text-[7pt] text-slate-600 font-medium leading-tight">
          {subtitle}
        </p>

        <div className="flex items-center gap-1 text-[6.5pt] font-mono text-slate-500 truncate pt-0.5 border-t border-slate-100">
          <Smartphone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
          <span className="truncate font-semibold text-slate-700">{resolvedUrl}</span>
        </div>
      </div>
    </div>
  );
};

export default PrintQrCode;
