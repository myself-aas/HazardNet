import { render, screen, fireEvent } from '@testing-library/react';
import MapToolbar from '../MapToolbar';
import type { MapToolbarProps } from '../MapToolbar';
import type { HazardLayerDef } from '../mapPrimitives';

const hazards: HazardLayerDef[] = [
  { id: 'Drought', name: 'Drought', color: '#000', badgeColor: '' },
  { id: 'Monsoon Flood', name: 'Monsoon Flood', color: '#000', badgeColor: '' },
];

const base: MapToolbarProps = {
  collapsed: false,
  onCollapsedChange: jest.fn(),
  viewMode: 'map',
  onViewModeChange: jest.fn(),
  activeLayer: 'esriSatellite',
  onLayerChange: jest.fn(),
  highContrast: true,
  onHighContrastChange: jest.fn(),
  exporting: false,
  onExport: jest.fn(),
  searchQuery: '',
  onSearchQueryChange: jest.fn(),
  forecastHorizon: '7_days',
  onForecastHorizonChange: jest.fn(),
  isLive: true,
  liveCount: 64,
  predictionDate: '2026-09-20',
  hazardLayers: hazards,
  selectedHazards: hazards.map((h) => h.id),
  onToggleHazard: jest.fn(),
  onSelectAllHazards: jest.fn(),
  onClearHazards: jest.fn(),
  hazardCounts: { Drought: 10, 'Monsoon Flood': 20 },
  filteredCount: 30,
  totalCount: 64,
  lowBandwidth: false,
};

describe('MapToolbar', () => {
  beforeEach(() => jest.clearAllMocks());

  it('toggles map and table modes with 44px chips', () => {
    render(<MapToolbar {...base} />);
    const table = screen.getByRole('button', { name: 'Table' });
    expect(table.className).toContain('min-h-[44px]');
    fireEvent.click(table);
    expect(base.onViewModeChange).toHaveBeenCalledWith('table');
  });

  it('keeps opaque white chrome and no glass', () => {
    const { container } = render(<MapToolbar {...base} />);
    expect(container.innerHTML).not.toContain('backdrop-blur');
    expect(container.innerHTML).toContain('bg-white');
  });

  it('shows stored-forecast count, not a live-inference claim', () => {
    render(<MapToolbar {...base} />);
    expect(screen.getByText('Stored 64/64')).toBeInTheDocument();
  });
});
