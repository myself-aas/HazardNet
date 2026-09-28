/**
 * Lazy boundary for `3d-globe`.
 *
 * three + @react-three/fiber + @react-three/drei is on the order of a megabyte of
 * JavaScript. Imported directly from a page it lands in that page's chunk and every
 * visitor pays for it whether they scroll to the globe or not — and `chunkSizeWarningLimit`
 * in `vite.config.ts` is set to 1000 KB, so it would also start warning.
 *
 * Import *this* module from a page, never `./3d-globe` directly. React splits it into its
 * own chunk that is fetched only when the boundary actually renders.
 */

import React, { Suspense, lazy } from 'react';
import { cn } from '@/lib/utils';
import type { Globe3DConfig, GlobeMarker } from './3d-globe';

const Globe3D = lazy(() => import('./3d-globe'));

export type { Globe3DConfig, GlobeMarker };

interface Globe3DLazyProps {
  markers?: GlobeMarker[];
  config?: Globe3DConfig;
  className?: string;
  onMarkerClick?: (marker: GlobeMarker) => void;
  onMarkerHover?: (marker: GlobeMarker | null) => void;
  /** Shown while the WebGL chunk downloads. */
  fallback?: React.ReactNode;
}

function GlobeFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-carbon-black" data-testid="globe-3d-fallback">
      <span className="text-sm text-carbon-50">Loading globe…</span>
    </div>
  );
}

export function Globe3DLazy({ markers, config, className, onMarkerClick, onMarkerHover, fallback }: Globe3DLazyProps) {
  return (
    <div className={cn('relative h-[500px] w-full', className)}>
      <Suspense fallback={fallback ?? <GlobeFallback />}>
        <Globe3D
          markers={markers}
          config={config}
          className="h-full w-full"
          onMarkerClick={onMarkerClick}
          onMarkerHover={onMarkerHover}
        />
      </Suspense>
    </div>
  );
}

export default Globe3DLazy;
