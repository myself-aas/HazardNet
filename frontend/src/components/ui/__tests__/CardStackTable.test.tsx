import React from 'react';
import { render, screen } from '@testing-library/react';
import { APPLE_COLORS, contrastRatio } from '@hazardnet/design-system';
import { CardStackRows } from '../CardStackTable';

describe('CardStackRows onDark tone', () => {
  it('uses fixed scrim ink and separators on an explicit black surface', () => {
    render(
      <CardStackRows
        className="bg-carbon-black"
        tone="onDark"
        rows={[{
          key: 'district-1',
          heading: 'District sample',
          fields: [{ label: 'Division', value: 'Mymensingh' }],
        }]}
      />,
    );

    const list = screen.getByRole('list');
    expect(list).toHaveClass('bg-carbon-black', 'border-white/15', 'divide-white/15');
    expect(screen.getByText('District sample')).toHaveClass('text-ap-on-scrim');
    expect(screen.getByText('Division')).toHaveClass('text-ap-on-scrim-muted');
    expect(screen.getByText('Mymensingh')).toHaveClass('text-ap-on-scrim-muted');
  });

  it('keeps both dark-surface ink tokens above AA on black', () => {
    expect(contrastRatio(APPLE_COLORS.bodyOnDark, APPLE_COLORS.surfaceBlack)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(APPLE_COLORS.bodyMuted, APPLE_COLORS.surfaceBlack)).toBeGreaterThanOrEqual(4.5);
  });
});
