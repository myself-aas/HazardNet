import React from 'react';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import DistrictForecastCard from '../frontend/src/components/map/DistrictForecastCard';
import MapDistrictTable from '../frontend/src/components/map/MapDistrictTable';
import { BottomSheet } from '../frontend/src/components/ui/BottomSheet';

jest.mock('../frontend/src/components/ui/expand-map', () => ({
  LocationMap: () => <div data-testid="location-map-tile" />,
}));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function readRepoFile(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

const sampleDistrict = {
  id: 'kurigram',
  name: 'Kurigram',
  division: 'Rangpur',
  lat: 25.8058,
  lng: 89.6361,
  risk: 'High',
  severity: 0.88,
  hazardType: 'Monsoon Flood',
  mainCrop: 'Aman Rice & Jute',
  elevationMeters: 28,
};

const tableDistricts = [
  {
    id: 'kurigram',
    name: 'Kurigram',
    division: 'Rangpur',
    hazardType: 'Monsoon Flood',
    severity: 0.88,
    risk: 'High',
  },
  {
    id: 'sylhet',
    name: 'Sylhet',
    division: 'Sylhet',
    hazardType: 'Flash Flood',
    severity: 0.79,
    risk: 'High',
  },
  {
    id: 'rajshahi',
    name: 'Rajshahi',
    division: 'Rajshahi',
    hazardType: 'Drought',
    severity: 0.42,
    risk: 'Moderate',
  },
];

describe('Phase 5 — GIS Choropleth, Progressive Disclosure & Mobile Viewport Ergonomics', () => {
  describe('Task 5.1: 3-Stage Progressive Disclosure on DistrictForecastCard & BottomSheet', () => {
    test('DistrictForecastCard cycles through half -> expanded -> peek -> half stages with >= 44px controls', () => {
      render(
        <MemoryRouter>
          <DistrictForecastCard
            district={sampleDistrict}
            onClose={jest.fn()}
            onOpenAnalytics={jest.fn()}
          />
        </MemoryRouter>,
      );

      const card = screen.getByTestId('district-forecast-card');
      expect(card).toHaveAttribute('data-sheet-stage', 'half');
      expect(screen.getByTitle(/Main crop: Aman Rice & Jute/i)).toBeInTheDocument();
      expect(screen.queryByTestId('location-map-tile')).not.toBeInTheDocument();

      const closeBtn = screen.getByRole('button', { name: /close district forecast/i });
      expect(closeBtn.className).toContain('min-w-[44px]');
      expect(closeBtn.className).toContain('min-h-[44px]');

      // The shared sheet's grabber is the stage control.
      const toggleBtn = screen.getByRole('button', { name: /cycle sheet height/i });
      expect(toggleBtn.className).toContain('min-h-[44px]');

      // Cycle half -> expanded (shows location map)
      fireEvent.click(toggleBtn);
      expect(card).toHaveAttribute('data-sheet-stage', 'expanded');
      expect(screen.getByTestId('location-map-tile')).toBeInTheDocument();

      // Cycle expanded -> peek (collapses secondary metadata tiles & location map)
      fireEvent.click(toggleBtn);
      expect(card).toHaveAttribute('data-sheet-stage', 'peek');
      expect(screen.queryByTitle(/Main crop: Aman Rice & Jute/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('location-map-tile')).not.toBeInTheDocument();

      // Cycle peek -> half (restores telemetry summary tiles)
      fireEvent.click(toggleBtn);
      expect(card).toHaveAttribute('data-sheet-stage', 'half');
      expect(screen.getByTitle(/Main crop: Aman Rice & Jute/i)).toBeInTheDocument();
    });

    test('BottomSheet supports 3-stage snap points [180, 360, 540] and interactive stage handle button', () => {
      render(
        <BottomSheet isOpen={true} onClose={jest.fn()} title="Sylhet Telemetry">
          <div>Telemetry payload</div>
        </BottomSheet>,
      );

      const dialog = screen.getByRole('dialog', { name: /sylhet telemetry/i });
      const sheet = dialog.querySelector('[data-sheet-stage]');
      expect(sheet).not.toBeNull();
      expect(sheet).toHaveAttribute('data-sheet-stage', 'half');

      const handleBtn = screen.getByRole('button', { name: /cycle sheet height/i });
      expect(handleBtn.className).toContain('min-h-[44px]');

      fireEvent.click(handleBtn);
      expect(sheet).toHaveAttribute('data-sheet-stage', 'expanded');

      fireEvent.click(handleBtn);
      expect(sheet).toHaveAttribute('data-sheet-stage', 'peek');
    });
  });

  describe('Task 5.2: Zero Horizontal Scroll at 375px / 768px & Mobile Control Ergonomics', () => {
    test('ChatBot, LiveMapView, DistrictRiskMap, and BangladeshSvgMap use fluid widths and >= 44px controls', () => {
      const chatBot = readRepoFile('frontend/src/components/ChatBot.tsx');
      expect(chatBot).toContain('sm:w-[min(480px,calc(100vw-3rem))]');
      expect(chatBot).not.toContain('min-h-[36px]');

      const liveMap = readRepoFile('frontend/src/components/LiveMapView.tsx');
      expect(liveMap).toContain('lg:w-[clamp(280px,28vw,340px)]');

      const riskMap = readRepoFile('frontend/src/components/DistrictRiskMap.tsx');
      expect(riskMap).toContain('w-[min(220px,calc(100%-1.5rem))]');
      expect(riskMap).not.toContain('min-w-[210px]');

      const svgMap = readRepoFile('frontend/src/components/BangladeshSvgMap.tsx');
      expect(svgMap).toContain('aria-pressed={viewMode === \'districts\'}');
      expect(svgMap).toContain('aria-pressed={viewMode === \'divisions\'}');
      expect(svgMap).not.toContain('transition-all');

      const indexCss = readRepoFile('frontend/src/index.css');
      expect(indexCss).toContain('overflow-x: clip;');

      const historicalCatalog = readRepoFile('frontend/src/components/HistoricalHazardCatalog.tsx');
      expect(historicalCatalog).not.toContain('hazard-catalog-index.json');
    });
  });

  describe('Task 5.3: Keyboard-Navigable District Table Parity (MapDistrictTable)', () => {
    test('ArrowDown, ArrowUp, End, and Home keys move focus across district table rows', () => {
      const onSelect = jest.fn();
      render(<MapDistrictTable districts={tableDistricts} onSelectDistrict={onSelect} />);

      const kurigramBtn = screen.getByRole('button', { name: 'Kurigram' });
      const sylhetBtn = screen.getByRole('button', { name: 'Sylhet' });
      const rajshahiBtn = screen.getByRole('button', { name: 'Rajshahi' });

      kurigramBtn.focus();
      expect(globalThis.document.activeElement).toBe(kurigramBtn);

      fireEvent.keyDown(kurigramBtn, { key: 'ArrowDown' });
      expect(globalThis.document.activeElement).toBe(sylhetBtn);

      fireEvent.keyDown(sylhetBtn, { key: 'End' });
      expect(globalThis.document.activeElement).toBe(rajshahiBtn);

      fireEvent.keyDown(rajshahiBtn, { key: 'ArrowUp' });
      expect(globalThis.document.activeElement).toBe(sylhetBtn);

      fireEvent.keyDown(sylhetBtn, { key: 'Home' });
      expect(globalThis.document.activeElement).toBe(kurigramBtn);
    });
  });
});
