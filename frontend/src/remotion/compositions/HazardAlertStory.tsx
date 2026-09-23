import React from 'react';
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export interface HazardAlertStoryProps {
  district?: string;
  hazardType?: string;
  severityScore?: number;
  date?: string;
  affectedPeopleText?: string;
}

export const HazardAlertStory: React.FC<HazardAlertStoryProps> = ({
  district = 'Sylhet',
  hazardType = 'Flash Flood Early Warning',
  severityScore = 0.88,
  date = '2026-09-22',
  affectedPeopleText = '42,000+ Agricultural Households At Risk',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring animation for header and badge
  const headerSpring = spring({
    frame,
    fps,
    config: { stiffness: 220, damping: 22 },
  });

  // Scale spring for main severity score dial
  const scoreSpring = spring({
    frame: Math.max(0, frame - 15),
    fps,
    config: { stiffness: 180, damping: 18 },
  });

  // Fade-in opacity for bottom details
  const opacityText = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const isCritical = severityScore >= 0.75;
  const alertColor = isCritical ? '#f64137' : severityScore >= 0.5 ? '#ea6f24' : '#1c67e3';
  const alertLabel = isCritical ? 'CRITICAL EMERGENCY' : severityScore >= 0.5 ? 'WARNING WATCH' : 'ADVISORY';

  return (
    <AbsoluteFill className="bg-[#0e0e11] text-white p-12 flex flex-col justify-between font-sans select-none overflow-hidden relative">
      {/* Background Radial Glow */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full blur-[140px] opacity-30 pointer-events-none"
        style={{ backgroundColor: alertColor }}
      />

      {/* Top Brand Header */}
      <div
        style={{
          transform: `translateY(${(1 - headerSpring) * -40}px)`,
          opacity: headerSpring,
        }}
        className="z-10 flex items-center justify-between border-b border-white/15 pb-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-nasa-red flex items-center justify-center font-bold text-lg shadow-lg">
            H
          </div>
          <div>
            <h2 className="font-heading font-bold text-2xl tracking-tight">HazardNet AI</h2>
            <p className="font-mono text-xs text-white/60 uppercase tracking-wider">Disaster Risk Intelligence</p>
          </div>
        </div>
        <div
          className="px-4 py-2 rounded-full font-mono font-bold text-sm tracking-wider uppercase border border-white/20"
          style={{ backgroundColor: `${alertColor}30`, color: '#ffffff' }}
        >
          {alertLabel}
        </div>
      </div>

      {/* Center Body — District Risk Highlight */}
      <div className="z-10 space-y-8 my-auto text-left">
        <div>
          <span className="font-mono text-sm uppercase tracking-widest text-white/60">
            {date} • Agricultural Alert
          </span>
          <h1 className="font-display font-black text-6xl tracking-tight mt-2 text-white">
            {district} District
          </h1>
          <p className="font-sans font-medium text-2xl text-white/80 mt-3">
            {hazardType}
          </p>
        </div>

        {/* Big Severity Readout Box */}
        <div
          style={{
            transform: `scale(${scoreSpring})`,
            opacity: scoreSpring,
          }}
          className="p-8 rounded-3xl bg-white/10 backdrop-blur-2xl border border-white/20 shadow-2xl flex items-center justify-between"
        >
          <div>
            <span className="font-mono text-xs text-white/70 uppercase tracking-widest">
              AI Severity Score
            </span>
            <div className="font-mono font-black text-6xl tracking-tight mt-1 text-white">
              {(severityScore * 100).toFixed(0)}
              <span className="text-3xl text-white/60 font-sans">/100</span>
            </div>
          </div>
          <div className="w-24 h-24 rounded-full border-4 flex items-center justify-center" style={{ borderColor: alertColor }}>
            <span className="font-mono font-bold text-xl" style={{ color: alertColor }}>
              {isCritical ? 'CRIT' : 'WARN'}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Footer Details */}
      <div
        style={{ opacity: opacityText }}
        className="z-10 border-t border-white/15 pt-6 flex items-center justify-between"
      >
        <p className="font-sans text-lg text-white/80 font-medium">
          {affectedPeopleText}
        </p>
        <span className="font-mono text-xs text-white/50 uppercase">
          NASA-HDS v2.2 Compliant
        </span>
      </div>
    </AbsoluteFill>
  );
};
