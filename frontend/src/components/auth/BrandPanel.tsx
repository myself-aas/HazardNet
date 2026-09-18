import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HazardNetBrand } from '../HazardNetLogo';
import MaterialIcon from '../MaterialIcon';

/**
 * Dynamic brand panel for the auth pages (/login, /signup, /forgot-password).
 *
 * Motion layers (all disabled under prefers-reduced-motion):
 *  - slow aurora gradient drift on the dark canvas
 *  - floating hazard glyph chips
 *  - rotating value carousel (pauses on hover/focus)
 *  - count-up platform stats
 */

export type AuthMode = 'login' | 'signup' | 'recovery';

interface RotatingMessage {
  headline: string;
  body: string;
}

const CAROUSELS: Record<AuthMode, RotatingMessage[]> = {
  login: [
    {
      headline: 'Your district intelligence is waiting',
      body: 'Live 8-hazard forecasts for all 64 districts, saved assessments and your advisory feed — exactly where you left them.',
    },
    {
      headline: 'Early warning, 15 days ahead',
      body: 'Strategic outlooks and 7-day tactical forecasts, cross-validated with physical severity formulas.',
    },
    {
      headline: 'Built for the field',
      body: 'Offline-capable district caching and sub-100ms on-device inference, designed for low-bandwidth rural networks.',
    },
  ],
  signup: [
    {
      headline: 'Field-ready forecasts, in your hands',
      body: 'Join extension officers, NGOs and researchers using HazardNet for early warning across Bangladesh.',
    },
    {
      headline: 'Eight hazards, one picture',
      body: 'Flood, cyclone, drought, cold wave, fire, flash flood, heat wave and storms — classified and quantified daily.',
    },
    {
      headline: 'Open, transparent science',
      body: 'Physical severity indexing and open models you can verify — no black boxes in the advisory chain.',
    },
  ],
  recovery: [
    {
      headline: 'Let’s get you back in safely',
      body: 'Your saved assessments, alert preferences and district watchlist stay exactly as you left them.',
    },
    {
      headline: 'Secure by design',
      body: 'Password resets are delivered over encrypted email links that expire — we never store your password.',
    },
  ],
};

interface StatItem {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

const STATS: StatItem[] = [
  { value: 64, suffix: '', label: 'Districts covered' },
  { value: 8, suffix: '', label: 'Hazard classes' },
  { value: 15, suffix: '-day', label: 'Strategic horizon' },
  { value: 100, prefix: '<', suffix: 'ms', label: 'Edge inference' },
];

/** Floating hazard glyphs (decorative, aria-hidden). */
const FLOATING_GLYPHS: Array<{ icon: string; className: string; delay: string; duration: string }> = [
  { icon: 'flood', className: 'left-[12%] top-[22%]', delay: '0s', duration: '7s' },
  { icon: 'cyclone', className: 'left-[74%] top-[16%]', delay: '1.2s', duration: '9s' },
  { icon: 'drought', className: 'left-[58%] top-[62%]', delay: '0.6s', duration: '8s' },
  { icon: 'cold_wave', className: 'left-[8%] top-[64%]', delay: '2s', duration: '10s' },
  { icon: 'wildfire', className: 'left-[82%] top-[52%]', delay: '1.6s', duration: '7.5s' },
  { icon: 'flash_flood', className: 'left-[38%] top-[80%]', delay: '0.3s', duration: '9.5s' },
];

/** Animate a number from 0 to `target` with an ease-out curve. */
const useCountUp = (target: number, durationMs = 1200, enabled = true): number => {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, enabled]);

  return value;
};

const Stat: React.FC<{ stat: StatItem; animate: boolean; durationMs?: number }> = ({ stat, animate, durationMs = 1200 }) => {
  const value = useCountUp(stat.value, durationMs, animate);
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-3.5 py-3 backdrop-blur-sm">
      <p className="font-mono text-lg xl:text-xl font-black text-white tabular-nums">
        {stat.prefix}
        {value}
        {stat.suffix}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
    </div>
  );
};

export interface BrandPanelProps {
  mode: AuthMode;
  /** Rotation interval for the value carousel (ms); exposed for tests. */
  intervalMs?: number;
}

export const BrandPanel: React.FC<BrandPanelProps> = ({ mode, intervalMs = 5200 }) => {
  const reduceMotion = useReducedMotion();
  const messages = useMemo(() => CAROUSELS[mode], [mode]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setIndex(0);
  }, [mode]);

  useEffect(() => {
    if (reduceMotion || paused || messages.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [reduceMotion, paused, messages.length, intervalMs]);

  const message = messages[index];
  const animateStats = !reduceMotion;

  return (
    <aside className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden bg-slate-950 text-slate-100 flex-col justify-between p-10 xl:p-14">
      {/* ── motion layer: aurora + grid + floating glyphs ─────────────── */}
      <style>{`
        @keyframes hn-aurora-a { 0%,100% { transform: translate(-8%,-6%) scale(1); } 50% { transform: translate(6%,8%) scale(1.18); } }
        @keyframes hn-aurora-b { 0%,100% { transform: translate(4%,10%) scale(1.1); } 50% { transform: translate(-10%,-8%) scale(0.95); } }
        @keyframes hn-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @media (prefers-reduced-motion: reduce) {
          .hn-aurora, .hn-float-chip { animation: none !important; }
        }
      `}</style>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="hn-aurora absolute -top-24 -left-24 h-96 w-96 rounded-full bg-nasa-red/15 blur-3xl"
          style={{ animation: reduceMotion ? undefined : 'hn-aurora-a 18s ease-in-out infinite' }}
        />
        <div
          className="hn-aurora absolute bottom-0 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl"
          style={{ animation: reduceMotion ? undefined : 'hn-aurora-b 22s ease-in-out infinite' }}
        />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px]" />
        {FLOATING_GLYPHS.map((glyph) => (
          <span
            key={glyph.icon}
            className={`hn-float-chip absolute ${glyph.className} text-slate-500/50`}
            style={{ animation: reduceMotion ? undefined : `hn-float ${glyph.duration} ease-in-out ${glyph.delay} infinite` }}
          >
            <MaterialIcon name={glyph.icon} className="h-6 w-6" />
          </span>
        ))}
      </div>

      {/* ── header ────────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-between">
        <HazardNetBrand size="md" variant="dark" />
        <Link
          to="/"
          className="rounded-xl border border-slate-700 px-3.5 py-2 text-[11px] font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          ← Back to site
        </Link>
      </div>

      {/* ── rotating value carousel ───────────────────────────────────── */}
      <div
        className="relative z-10 max-w-md"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        aria-live="polite"
        data-testid="brand-carousel"
      >
        <p className="mb-4 text-[11px] font-mono font-extrabold uppercase tracking-[0.2em] text-nasa-red-shade">
          {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Account recovery'}
        </p>
        <div className="min-h-[13rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${mode}-${index}`}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -14 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {/*
                Deliberately not a heading: this is rotating marketing copy
                inside an aria-live region, and the document's real h1 is the
                form title rendered by AuthLayout. Emitting an h1 here produced
                a second h1 on lg+ and made the carousel announce itself as a
                heading change on every rotation.
              */}
              <p className="text-3xl xl:text-4xl font-black leading-tight tracking-tight text-white">
                {message.headline}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-slate-300">{message.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* carousel dots */}
        {messages.length > 1 && (
          <div className="mt-5 flex items-center gap-2" role="tablist" aria-label="Highlights">
            {messages.map((item, dot) => (
              <button
                key={item.headline}
                type="button"
                role="tab"
                aria-selected={dot === index}
                aria-label={`Highlight ${dot + 1} of ${messages.length}`}
                onClick={() => setIndex(dot)}
                className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                  dot === index ? 'w-7 bg-nasa-red' : 'w-2.5 bg-slate-700 hover:bg-slate-500'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── count-up stats ────────────────────────────────────────────── */}
      <div className="relative z-10 space-y-5">
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4" data-testid="brand-stats">
          {STATS.map((stat) => (
            <Stat key={stat.label} stat={stat} animate={animateStats} />
          ))}
        </div>
        <p className="text-[11px] text-slate-500">
          HazardNet · Multi-hazard early warning for Bangladesh agriculture ·{' '}
          <Link to="/terms" className="font-semibold text-slate-400 underline-offset-2 hover:underline">
            Terms
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" className="font-semibold text-slate-400 underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </aside>
  );
};

export default BrandPanel;
