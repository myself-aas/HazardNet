import React from 'react';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, act } from '@testing-library/react';
import { HDS_TOKENS } from '../frontend/src/design-system/tokens';
import { useWebFrame } from '../frontend/src/lib/motion-interpolate';
import { useMeridianTheme } from '../frontend/src/components/meridian/motion';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readRepoFile(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

describe('Phase 4 — Frontend Design System Overhaul (Cartographic-Editorial Brutalism)', () => {
  describe('Task 4.1: Bounded useWebFrame rAF loops & Vite hero video exclusion', () => {
    test('useWebFrame enforces maxFrames termination and deduplicates state updates', () => {
      const src = readRepoFile('frontend/src/lib/motion-interpolate.ts');
      expect(src).toMatch(/useWebFrame\s*=\s*\(\s*fps\s*=\s*30\s*,\s*maxFrames\s*=\s*420\s*\)/);
      expect(src).toMatch(/Math\.min\(\s*maxFrames\s*,\s*Math\.floor\(\s*elapsed\s*\*\s*fps\s*\)\s*\)/);
      expect(src).toMatch(/if\s*\(\s*nextFrame\s*<\s*maxFrames\s*\)/);
    });

    test('useWebFrame runtime hook stops scheduling requestAnimationFrame once maxFrames is reached', () => {
      const rafCallbacks = [];
      const rafSpy = jest.spyOn(globalThis.window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallbacks.push(cb);
        return rafCallbacks.length;
      });
      const cancelSpy = jest.spyOn(globalThis.window, 'cancelAnimationFrame').mockImplementation(() => {});

      let latestFrame = -1;
      function Probe() {
        latestFrame = useWebFrame(30, 6);
        return <div data-testid="frame">{latestFrame}</div>;
      }

      const { unmount } = render(<Probe />);
      expect(rafCallbacks.length).toBe(1);

      // Tick 1 at t=0ms -> frame 0 (< 6, schedules another rAF)
      act(() => {
        rafCallbacks[0](0);
      });
      expect(latestFrame).toBe(0);
      expect(rafCallbacks.length).toBe(2);

      // Tick 2 at t=250ms (0.25s * 30fps = 7.5 -> clamped to 6 === maxFrames, stops scheduling rAF!)
      act(() => {
        rafCallbacks[1](250);
      });
      expect(latestFrame).toBe(6);
      expect(rafCallbacks.length).toBe(2);

      unmount();
      rafSpy.mockRestore();
      cancelSpy.mockRestore();
    });

    test('entry-animation call sites pass explicit maxFrames bounds to useWebFrame', () => {
      expect(readRepoFile('frontend/src/App.tsx')).toContain('useWebFrame(30, 6)');
      expect(readRepoFile('frontend/src/pages/FrontDoor.tsx')).toContain('useWebFrame(30, 8)');
      expect(readRepoFile('frontend/src/components/frontdoor/LiveStatusStrip.tsx')).toContain(
        'useWebFrame(30, 10)',
      );
      expect(readRepoFile('frontend/src/components/frontdoor/RunVisual.tsx')).toContain(
        'useWebFrame(30, 60)',
      );
      expect(readRepoFile('frontend/src/components/HeroCinematicBackground.tsx')).toContain(
        'useWebFrame(30, 420)',
      );
    });

    test('vite.config.ts excludes unreferenced hero-section/*.mp4 from precache and dist output', () => {
      const viteConfig = readRepoFile('frontend/vite.config.ts');
      expect(viteConfig).toContain('excludeUnreferencedHeroVideos');
      expect(viteConfig).toContain("globIgnores: ['**/hero-section/*.mp4']");
    });
  });

  describe('Task 4.2: Cartographic-Editorial Brutalism HUD tokens, Meridian dark-mode wiring & root pointer-events', () => {
    test('HDS_TOKENS and index.css expose #0b0f17 HUD obsidian and tabular numeral contracts', () => {
      expect(HDS_TOKENS.colors.hudObsidian).toBe('#0b0f17');
      expect(HDS_TOKENS.colors.hudSlate).toBe('#111827');
      expect(HDS_TOKENS.colors.hudHairline).toBe('rgba(255, 255, 255, 0.12)');

      const indexCss = readRepoFile('frontend/src/index.css');
      expect(indexCss).toContain('--hn-hud-obsidian: #0b0f17;');
      expect(indexCss).toContain('--hn-hud-slate: #111827;');
      expect(indexCss).toContain('.hn-tabular-nums');
    });

    test('useMeridianTheme synchronizes data-mrd-theme, .dark class, and color-scheme and is wired in App.tsx', () => {
      const motionSrc = readRepoFile('frontend/src/components/meridian/motion.ts');
      expect(motionSrc).toMatch(/root\.classList\.toggle\(\s*'dark'\s*,\s*resolvedTheme\s*===\s*'dark'\s*\)/);
      expect(motionSrc).toMatch(/root\.style\.colorScheme\s*=\s*resolvedTheme/);

      const appSrc = readRepoFile('frontend/src/App.tsx');
      expect(appSrc).toContain('useMeridianTheme');
      // Non-console root wrapper must not invert pointer-events to none
      expect(appSrc).not.toContain('selection:text-amber-900 pointer-events-none');
      // Toaster uses CSS custom properties instead of raw hex literals
      expect(appSrc).toContain('var(--mrd-surface, #ffffff)');
      expect(appSrc).toContain('var(--hds-color-carbon-90, #17171b)');
    });

    test('useMeridianTheme runtime hook toggles documentElement .dark class, data-mrd-theme, and colorScheme', () => {
      let api = null;
      function ThemeProbe() {
        api = useMeridianTheme();
        return <div data-testid="resolved">{api.resolved}</div>;
      }

      render(<ThemeProbe />);
      act(() => {
        api.setTheme('dark');
      });
      expect(globalThis.document.documentElement.getAttribute('data-mrd-theme')).toBe('dark');
      expect(globalThis.document.documentElement.classList.contains('dark')).toBe(true);
      expect(globalThis.document.documentElement.style.colorScheme).toBe('dark');
      expect(api.resolved).toBe('dark');

      act(() => {
        api.setTheme('light');
      });
      expect(globalThis.document.documentElement.getAttribute('data-mrd-theme')).toBe('light');
      expect(globalThis.document.documentElement.classList.contains('dark')).toBe(false);
      expect(globalThis.document.documentElement.style.colorScheme).toBe('light');
      expect(api.resolved).toBe('light');
    });
  });

  describe('Task 4.3: WCAG AAA contrast, 44x44px touch floor, reduced-motion spinner exemption, bilingual :lang(bn), and GPU transitions', () => {
    test('index.css enforces 44px touch targets, light-mode carbon-40/50 contrast promotion, spinner exemption, and :lang(bn)', () => {
      const indexCss = readRepoFile('frontend/src/index.css');
      expect(indexCss).toContain(':lang(bn)');
      expect(indexCss).toContain('button:not([data-compact-target="true"])');
      expect(indexCss).toContain('[role="progressbar"]');
      expect(indexCss).toContain('.hn-spinner');
      expect(indexCss).toMatch(/\.text-carbon-40[\s\S]*?var\(--hds-color-carbon-60\)/);
    });

    test('core telemetry surfaces avoid layout-thrashing transition-all', () => {
      expect(readRepoFile('frontend/src/components/AdvisoryPanel.tsx')).not.toContain('transition-all');
      expect(readRepoFile('frontend/src/components/ForecastDashboard.tsx')).not.toContain('transition-all');
      expect(readRepoFile('frontend/src/components/CommandPalette.tsx')).not.toContain('transition-all');
    });
  });
});
