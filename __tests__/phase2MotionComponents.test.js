import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BottomSheet } from '../frontend/src/components/ui/BottomSheet';
import { BentoGrid, BentoCard } from '../frontend/src/components/ui/BentoGrid';
import { FloatingControlBar } from '../frontend/src/components/ui/FloatingControlBar';

describe('Phase 2 Framer Motion Touch & Sheet Components', () => {
  describe('<BottomSheet />', () => {
    test('renders bottom sheet when isOpen is true', () => {
      const handleClose = jest.fn();
      render(
        <BottomSheet isOpen={true} onClose={handleClose} title="District Hazard Telemetry">
          <p>Flash flood risk in Sylhet region</p>
        </BottomSheet>
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('District Hazard Telemetry')).toBeInTheDocument();
      expect(screen.getByText('Flash flood risk in Sylhet region')).toBeInTheDocument();
    });

    test('does not render bottom sheet when isOpen is false', () => {
      const handleClose = jest.fn();
      render(
        <BottomSheet isOpen={false} onClose={handleClose} title="Closed Sheet">
          <p>Hidden content</p>
        </BottomSheet>
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    test('triggers onClose when close button is clicked', () => {
      const handleClose = jest.fn();
      render(
        <BottomSheet isOpen={true} onClose={handleClose} title="Test Sheet">
          <p>Content</p>
        </BottomSheet>
      );

      const closeButton = screen.getByLabelText('Close sheet');
      fireEvent.click(closeButton);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('<BentoGrid /> & <BentoCard />', () => {
    test('renders BentoCard with values and status badges', () => {
      render(
        <BentoGrid>
          <BentoCard
            title="Salinity Index"
            value="1.2"
            unit="ppt"
            subtitle="Optimal for Boro Rice"
            statusBadge={{ label: 'NORMAL', color: '#16a34a' }}
            gaugePercent={25}
          />
        </BentoGrid>
      );

      expect(screen.getByText('Salinity Index')).toBeInTheDocument();
      expect(screen.getByText('1.2')).toBeInTheDocument();
      expect(screen.getByText('ppt')).toBeInTheDocument();
      expect(screen.getByText('NORMAL')).toBeInTheDocument();
    });
  });

  describe('<FloatingControlBar />', () => {
    test('renders search input and triggers onSearchChange', () => {
      const handleSearch = jest.fn();
      render(
        <FloatingControlBar
          searchValue="Sylhet"
          onSearchChange={handleSearch}
          placeholder="Search districts..."
        />
      );

      const input = screen.getByPlaceholderText('Search districts...');
      expect(input).toHaveValue('Sylhet');

      fireEvent.change(input, { target: { value: 'Dhaka' } });
      expect(handleSearch).toHaveBeenCalledWith('Dhaka');
    });

    test('renders filter chips and handles chip selection', () => {
      const handleChipSelect = jest.fn();
      const chips = [
        { id: 'flood', label: 'Flash Flood', active: true },
        { id: 'cyclone', label: 'Cyclone', active: false },
      ];

      render(<FloatingControlBar chips={chips} onSelectChip={handleChipSelect} />);

      expect(screen.getByText('Flash Flood')).toBeInTheDocument();
      const cycloneBtn = screen.getByText('Cyclone');
      fireEvent.click(cycloneBtn);

      expect(handleChipSelect).toHaveBeenCalledWith('cyclone');
    });
  });
});
