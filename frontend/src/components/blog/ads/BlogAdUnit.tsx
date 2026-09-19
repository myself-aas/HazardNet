import React, { useEffect, useRef } from 'react';
import MaterialIcon from '../../MaterialIcon';
import {
  ADSENSE_CLIENT,
  injectAdSenseScript,
  isAdSenseConfigured,
  isAdSenseDevMode,
  requestAdFill,
} from '../../../lib/adsense';

/**
 * Ad units for the HazardNet blog — the ONLY pages where advertising runs.
 *
 * <AdSenseScript /> must be rendered once per blog page (index or article);
 * it injects the AdSense loader only when VITE_ADSENSE_CLIENT is configured,
 * so the unconfigured production site never ships third-party script.
 * <BlogAdUnit /> renders a responsive ad; in dev mode without credentials it
 * renders a clearly-labeled placeholder so layouts can be reviewed honestly.
 */

export const AdSenseScript: React.FC = () => {
  useEffect(() => injectAdSenseScript() ?? undefined, []);
  return null;
};

export type AdFormat = 'auto' | 'horizontal' | 'rectangle' | 'fluid';

const FORMAT_STYLE: Record<AdFormat, React.CSSProperties> = {
  auto: { display: 'block' },
  horizontal: { display: 'block', minHeight: 90 },
  rectangle: { display: 'block', minHeight: 250 },
  fluid: { display: 'block', minHeight: 250 },
};

export interface BlogAdUnitProps {
  /** AdSense ad-unit id (VITE_ADSENSE_SLOT_*). Defaults to the blog index slot. */
  slot?: string;
  format?: AdFormat;
  /** In-article fluid ads should set this for Google's native styling. */
  inArticle?: boolean;
  label?: string;
  className?: string;
  /** Test overrides for the module-level env flags. */
  configured?: boolean;
  devMode?: boolean;
}

export const BlogAdUnit: React.FC<BlogAdUnitProps> = ({
  slot,
  format = 'auto',
  inArticle = false,
  label = 'Advertisement',
  className = '',
  configured = isAdSenseConfigured,
  devMode = isAdSenseDevMode,
}) => {
  const insRef = useRef<HTMLModElement>(null);
  const filledRef = useRef(false);

  useEffect(() => {
    if (!configured || filledRef.current) return;
    filledRef.current = true;
    requestAdFill();
  }, [slot, format, configured]);

  // Live site without AdSense credentials: render nothing at all.
  if (!configured && !devMode) return null;

  const resolvedSlot: string | undefined = slot || undefined;

  return (
    <div className={`relative ${className}`} data-testid="blog-ad-unit" aria-label={label}>
      <span className="mb-1 block text-center text-[9px] font-bold uppercase tracking-[0.2em] text-carbon-30">
        {label}
      </span>
      {configured ? (
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={FORMAT_STYLE[format]}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={resolvedSlot}
          {...(inArticle || format === 'fluid'
            ? { 'data-ad-layout': 'in-article', 'data-ad-format': 'fluid' }
            : { 'data-ad-format': format })}
          data-full-width-responsive="true"
        />
      ) : (
        <div
          data-testid="blog-ad-placeholder"
          className="flex min-h-[110px] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-carbon-20 bg-carbon-05/60 text-carbon-60"
        >
          <MaterialIcon name="monetization_on" className="h-5 w-5" />
          <p className="text-[10px] font-bold uppercase tracking-wider">Ad slot (dev placeholder)</p>
          <p className="text-[9px] font-medium">Set VITE_ADSENSE_CLIENT + slot ids to go live</p>
        </div>
      )}
    </div>
  );
};
