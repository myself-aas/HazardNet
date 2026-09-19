import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { HazardNetBrand } from '../HazardNetLogo';
import BrandPanel, { AuthMode } from './BrandPanel';

/**
 * Shared responsive shell for the dedicated auth pages — each with a unique
 * URL: /login, /signup, /forgot-password, /update-password.
 *
 * Desktop (lg+): dynamic split screen — animated BrandPanel on the left,
 * scrollable form column on the right.
 * Mobile: single column with a compact brand header and an animated accent
 * strip, generous touch targets, no horizontal scrolling.
 */

export interface AuthLayoutProps {
  /** Which page is using the layout (drives the dynamic panel content). */
  mode: AuthMode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const BackToHome: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Link
    to="/"
    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-carbon-60 transition-colors hover:text-carbon-90 hover:bg-carbon-10 ${className}`}
  >
    <span aria-hidden="true">←</span> Back to HazardNet
  </Link>
);

export const AuthLayout: React.FC<AuthLayoutProps> = ({ mode, title, subtitle, children }) => {
  const reduceMotion = useReducedMotion();
  return (
  <div className="min-h-dvh w-full bg-carbon-05 text-carbon-90 flex flex-col lg:flex-row">
    {/* ── Dynamic brand/value panel (desktop) ─────────────────────────── */}
    <BrandPanel mode={mode} />

    {/* ── Mobile brand header with animated accent strip ──────────────── */}
    <div className="lg:hidden bg-white border-b border-carbon-20/80">
      <div className="px-4 py-3 flex items-center justify-between">
        <HazardNetBrand size="sm" />
        <BackToHome />
      </div>
      {/* slow amber→emerald shimmer, disabled under prefers-reduced-motion */}
      <motion.div
        aria-hidden="true"
        className="h-1 bg-gradient-to-r from-nasa-red via-amber-300 to-emerald-400 bg-[length:200%_100%]"
        animate={reduceMotion ? undefined : { backgroundPosition: ['0% 0%', '200% 0%'] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    </div>

    {/* ── Form column ────────────────────────────────────────────────── */}
    <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-8 lg:px-12 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="rounded-3xl border border-carbon-20/90 bg-white p-6 sm:p-8 shadow-md sm:shadow-xl space-y-6 relative overflow-hidden">
          <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-nasa-red" />
          <header className="space-y-1.5">
              {/*
                h1, not h2: this is the page-level heading of a standalone
                document (/login, /signup, ...). Starting the outline at h2
                breaks heading navigation for screen-reader users and makes the
                page's primary heading harder to target reliably.
              */}
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-carbon-90">{title}</h1>
            <p className="text-xs sm:text-[13px] leading-relaxed text-carbon-60">{subtitle}</p>
          </header>
          {children}
        </div>
        <p className="mt-4 text-center text-[11px] text-carbon-60 lg:hidden">
          HazardNet · Multi-hazard early warning ·{' '}
          <Link to="/terms" className="underline-offset-2 hover:underline">
            Terms
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" className="underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </motion.div>
    </main>
  </div>
  );
};

export default AuthLayout;
