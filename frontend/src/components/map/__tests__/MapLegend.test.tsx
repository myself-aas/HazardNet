import { render, screen, fireEvent } from '@testing-library/react';
import { MapLegend } from '../MapLegend';

describe('MapLegend', () => {
  it('renders nothing when radar is off', () => {
    const { container } = render(<MapLegend isRadarActive={false} setIsRadarActive={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels reflectivity with colour plus words and a 44px dismiss', () => {
    const setIsRadarActive = jest.fn();
    render(<MapLegend isRadarActive setIsRadarActive={setIsRadarActive} />);
    expect(screen.getByText(/20 dBZ Light/)).toBeInTheDocument();
    expect(screen.getByText(/38 dBZ Moderate/)).toBeInTheDocument();
    expect(screen.getByText(/55\+ dBZ Heavy/)).toBeInTheDocument();
    const dismiss = screen.getByRole('button', { name: /dismiss radar legend/i });
    expect(dismiss.className).toContain('w-11');
    expect(dismiss.className).toContain('h-11');
    fireEvent.click(dismiss);
    expect(setIsRadarActive).toHaveBeenCalledWith(false);
  });
});
