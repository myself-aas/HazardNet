import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { HazardNetBrand } from '../HazardNetLogo';
import BrandPanel, { AuthMode } from './BrandPanel';

/**
 * Shared responsive shell for the dedicated auth pages — each with a unique
 * URL: /login, /signup, /forgot-password, /update-password.
 *
 * Desktop (lg+): BrandPanel on the left, form column on the right.
 * Mobile: single column with a compact brand header. No looping accent strip.
 *
 * This file owns the page `<main>` — App.tsx must not wrap auth routes in another.
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
    className={`inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 text-sm font-semibold text-nasa-blue-shade touch-manipulation ${className}`}
  >
    <span aria-hidden="true">←</span> Back to HazardNet
  </Link>
);

export const AuthLayout: React.FC<AuthLayoutProps> = ({ mode, title, subtitle, children }) => {
  const reduceMotion = useReducedMotion();
  return (
  <div className="min-h-dvh w-full bg-carbon-05 text-carbon-90 flex flex-col lg:flex-row">
    <BrandPanel mode={mode} />

    <div className="lg:hidden bg-white border-b border-carbon-20">
      <div className="flex h-14 items-center justify-between px-4">
        <HazardNetBrand size="sm" />
        <BackToHome />
      </div>
      <div aria-hidden="true" className="h-0.5 bg-nasa-red" />
    </div>

    <main id="main-content" tabIndex={-1} className="flex-1 flex items-start sm:items-center justify-center px-4 sm:px-8 lg:px-12 py-8 sm:py-12">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-md"
      >
        <div className="relative border border-carbon-20 bg-white p-6 lg:p-8 space-y-6">
          <header className="space-y-2">
              <h1 className="text-[28px] font-bold leading-[1.2] tracking-tight text-carbon-90 lg:text-[32px]">{title}</h1>
            <p className="text-base leading-[1.62] text-carbon-70">{subtitle}</p>
          </header>
          {children}
        </div>
        <p className="mt-4 text-center text-xs text-carbon-60 lg:hidden">
          HazardNet · Multi-hazard early warning ·{' '}
          <Link to="/terms" className="text-nasa-blue-shade underline-offset-4 hover:underline">
            Terms
          </Link>{' '}
          ·{' '}
          <Link to="/privacy" className="text-nasa-blue-shade underline-offset-4 hover:underline">
            Privacy
          </Link>
        </p>
      </motion.div>
    </main>
  </div>
  );
};

export default AuthLayout;
