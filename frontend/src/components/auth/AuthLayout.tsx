import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HazardNetBrand } from '../HazardNetLogo';
import MaterialIcon from '../MaterialIcon';

/**
 * Shared responsive shell for the dedicated auth pages (/login, /signup,
 * /forgot-password, /update-password).
 *
 * Desktop (lg+): split screen — brand/value panel on the left, scrollable
 * form column on the right.
 * Mobile: single column with a compact brand header, generous touch targets
 * and no horizontal scrolling.
 */

export interface AuthLayoutProps {
  /** Which page is using the layout (drives the panel copy). */
  mode: 'login' | 'signup' | 'recovery';
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

const PANEL_COPY: Record<AuthLayoutProps['mode'], { eyebrow: string; headline: string; body: string }> = {
  login: {
    eyebrow: 'Welcome back',
    headline: 'Your district intelligence is waiting',
    body: 'Pick up where you left off: live 8-hazard forecasts for all 64 districts, saved assessments and your advisory feed.',
  },
  signup: {
    eyebrow: 'Create your account',
    headline: 'Field-ready forecasts, in your hands',
    body: 'Join extension officers, NGOs and researchers using HazardNet for early warning and agro-climatic advisories across Bangladesh.',
  },
  recovery: {
    eyebrow: 'Account recovery',
    headline: 'Let’s get you back in safely',
    body: 'Recover access to your HazardNet account — your saved assessments and alert preferences stay exactly as they were.',
  },
};

const VALUE_PROPS: Array<{ icon: string; title: string; text: string }> = [
  {
    icon: 'alerts',
    title: '8 hazards, 64 districts',
    text: 'Flood, cyclone, drought, cold wave and more — forecast 7 and 15 days ahead.',
  },
  {
    icon: 'cloud_download',
    title: 'Offline-first',
    text: 'Cached district data and on-device inference keep working when connectivity drops.',
  },
  {
    icon: 'shield',
    title: 'Open & reproducible',
    text: 'Transparent physical severity formulas, open models and public datasets.',
  },
];

const BackToHome: React.FC<{ className?: string }> = ({ className = '' }) => (
  <Link
    to="/"
    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-500 transition-colors hover:text-slate-900 hover:bg-slate-100 ${className}`}
  >
    <span aria-hidden="true">←</span> Back to HazardNet
  </Link>
);

export const AuthLayout: React.FC<AuthLayoutProps> = ({ mode, title, subtitle, children }) => {
  const copy = PANEL_COPY[mode];

  return (
    <div className="min-h-dvh w-full bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* ── Brand / value panel (desktop only) ─────────────────────────── */}
      <aside className="hidden lg:flex lg:w-[46%] xl:w-[42%] relative overflow-hidden bg-slate-950 text-slate-100 flex-col justify-between p-10 xl:p-14">
        {/* ambient decoration */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[#f9a825]/10 blur-3xl" />
          <div className="absolute bottom-0 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:44px_44px]" />
        </div>

        <div className="relative flex items-center justify-between">
          <HazardNetBrand size="md" variant="dark" />
          <Link
            to="/"
            className="rounded-xl border border-slate-700 px-3.5 py-2 text-[11px] font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            ← Back to site
          </Link>
        </div>

        <div className="relative space-y-5 max-w-md">
          <p className="text-[11px] font-mono font-extrabold uppercase tracking-[0.2em] text-[#f9a825]">
            {copy.eyebrow}
          </p>
          <h1 className="text-3xl xl:text-4xl font-black leading-tight tracking-tight text-white">
            {copy.headline}
          </h1>
          <p className="text-sm leading-relaxed text-slate-300">{copy.body}</p>

          <ul className="space-y-4 pt-2">
            {VALUE_PROPS.map((prop) => (
              <li key={prop.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 text-[#f9a825]">
                  <MaterialIcon name={prop.icon} className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{prop.title}</p>
                  <p className="text-xs leading-relaxed text-slate-400">{prop.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-500">
          HazardNet · Multi-hazard early warning for Bangladesh agriculture ·{' '}
          <Link to="/terms" className="font-semibold text-slate-400 underline-offset-2 hover:underline">
            Terms
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" className="font-semibold text-slate-400 underline-offset-2 hover:underline">
            Privacy
          </Link>
        </p>
      </aside>

      {/* ── Mobile brand header ────────────────────────────────────────── */}
      <div className="lg:hidden bg-white border-b border-slate-200/80 px-4 py-3 flex items-center justify-between">
        <HazardNetBrand size="sm" />
        <BackToHome />
      </div>

      {/* ── Form column ────────────────────────────────────────────────── */}
      <main className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-8 lg:px-12 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-md sm:shadow-xl space-y-6 relative overflow-hidden">
            <div aria-hidden="true" className="absolute top-0 left-0 w-full h-1 bg-[#f9a825]" />
            <header className="space-y-1.5">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">{title}</h2>
              <p className="text-xs sm:text-[13px] leading-relaxed text-slate-500">{subtitle}</p>
            </header>
            {children}
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-400 lg:hidden">
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
