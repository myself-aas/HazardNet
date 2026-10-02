import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { HazardNetBrand, HazardNetLogo } from '../HazardNetLogo';

jest.mock('../../services/geolocationService', () => ({ getSeverityColor: () => '#DC2626' }));

describe('HazardNet brand components', () => {
  it('renders the lockup as ONE image named "HazardNet" — not an icon and two live-text spans side by side', () => {
    const { container } = render(<HazardNetBrand />);
    const img = screen.getByRole('img', { name: 'HazardNet' });
    expect(img).toHaveAttribute('src', '/hazardnet-logo.svg');
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(container.textContent).toBe('');
  });

  it('uses the white-wordmark lockup on dark surfaces', () => {
    render(<HazardNetBrand variant="dark" />);
    expect(screen.getByRole('img', { name: 'HazardNet' })).toHaveAttribute('src', '/hazardnet-logo-light.svg');
  });

  it('reserves its box (width/height) so the header does not shift when the image arrives', () => {
    render(<HazardNetBrand size="lg" />);
    const img = screen.getByRole('img', { name: 'HazardNet' });
    expect(img).toHaveAttribute('width', '330');
    expect(img).toHaveAttribute('height', '60');
  });

  it('renders the mark alone from the same artwork family', () => {
    render(<HazardNetLogo />);
    expect(screen.getByRole('img', { name: 'HazardNet' })).toHaveAttribute('src', '/hazardnet-mark.svg');
  });

  it('turns the mark into the lockup when text is asked for', () => {
    render(<HazardNetLogo showText variant="dark" />);
    expect(screen.getByRole('img', { name: 'HazardNet' })).toHaveAttribute('src', '/hazardnet-logo-light.svg');
  });
});
