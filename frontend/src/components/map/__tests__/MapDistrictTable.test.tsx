import { render, screen, fireEvent } from '@testing-library/react';
import MapDistrictTable from '../MapDistrictTable';

const districts = [
  {
    id: 'kurigram',
    name: 'Kurigram',
    division: 'Rangpur',
    hazardType: 'Monsoon Flood',
    severity: 0.88,
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

describe('MapDistrictTable (map/table parity)', () => {
  it('exposes a captioned table with risk as a word', () => {
    render(
      <MapDistrictTable districts={districts} selectedDistrictId="kurigram" onSelectDistrict={jest.fn()} />,
    );
    expect(screen.getByTestId('map-district-table')).toBeInTheDocument();
    expect(
      screen.getByText(/text equivalent of the map/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Risk' })).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('selects a district with a 44px row control', () => {
    const onSelectDistrict = jest.fn();
    render(
      <MapDistrictTable districts={districts} onSelectDistrict={onSelectDistrict} />,
    );
    const rowButton = screen.getByRole('button', { name: 'Rajshahi' });
    expect(rowButton.className).toContain('min-h-[44px]');
    fireEvent.click(rowButton);
    expect(onSelectDistrict).toHaveBeenCalledWith(districts[1]);
  });

  it('states when filters match no districts', () => {
    render(<MapDistrictTable districts={[]} onSelectDistrict={jest.fn()} />);
    expect(screen.getByText(/no districts match the current filters/i)).toBeInTheDocument();
  });
});
