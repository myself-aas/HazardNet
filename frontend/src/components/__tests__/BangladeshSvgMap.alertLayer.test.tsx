import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * The vector map's alert layer and low-bandwidth rendering (Phase 5).
 *
 * Two properties are asserted, both of which the phase's project-killer is about:
 *
 *   1. a district that has **no** published alert must not be coloured as if it had one
 *      (the layer is a whitelist, and the accessible name of each marker says whether an
 *      alert exists);
 *   2. low-bandwidth mode removes decoration (glow circles, ping rings, the dotted grid)
 *      without removing information — every district marker is still rendered and still
 *      focusable.
 */

import { render, screen } from '@testing-library/react';
import { BangladeshSvgMap } from '../BangladeshSvgMap';

const baseProps = { onSelectDistrict: jest.fn() };

const markers = () => screen.getAllByRole('button');

describe('BangladeshSvgMap alert layer', () => {
  it('renders every district marker with a baseline colour when no alert layer is supplied', () => {
    render(<BangladeshSvgMap {...baseProps} />);
    const labels = markers().map((node) => node.getAttribute('aria-label') || '');
    const districtLabels = labels.filter((label) => label.includes('District'));
    expect(districtLabels.length).toBeGreaterThanOrEqual(64);
    expect(districtLabels.every((label) => !label.includes('alert:'))).toBe(true);
  });

  it('announces the alert level in the marker name for districts that have one', () => {
    render(
      <BangladeshSvgMap
        {...baseProps}
        alertLevels={{ sunamganj: 'WATCH' }}
        alertLevelLabels={{ WATCH: 'Watch' }}
      />,
    );
    const sunamganj = markers().find((node) => (node.getAttribute('aria-label') || '').startsWith('Sunamganj'));
    expect(sunamganj?.getAttribute('aria-label')).toMatch(/HazardNet alert: Watch/);
  });

  it('does not colour a district that has no published alert', () => {
    render(<BangladeshSvgMap {...baseProps} alertLevels={{ sunamganj: 'SEVERE' }} />);
    // The layer is a whitelist: only the district passed in is described as having an alert.
    const labels = markers().map((node) => node.getAttribute('aria-label') || '');
    const withAlerts = labels.filter((label) => label.includes('HazardNet alert:'));
    expect(withAlerts).toHaveLength(1);
    expect(withAlerts[0]).toMatch(/Sunamganj/);
  });

  it('keeps markers keyboard-reachable', () => {
    render(<BangladeshSvgMap {...baseProps} alertLevels={{ sunamganj: 'WATCH' }} lowBandwidth />);
    const sunamganj = markers().find((node) => (node.getAttribute('aria-label') || '').startsWith('Sunamganj'));
    expect(sunamganj).toHaveAttribute('tabindex', '0');
    expect(sunamganj).toHaveAttribute('role', 'button');
  });

  it('says how many districts carry an alert', () => {
    render(<BangladeshSvgMap {...baseProps} alertLevels={{ a: 'WATCH', b: 'SEVERE' }} />);
    expect(screen.getByText(/Alert layer:/)).toBeInTheDocument();
    expect(screen.getByText('2 districts')).toBeInTheDocument();
  });
});

describe('BangladeshSvgMap low-bandwidth mode', () => {
  it('drops the pulsing decoration', () => {
    const { container, unmount } = render(<BangladeshSvgMap {...baseProps} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.animate-ping').length).toBeGreaterThan(0);
    unmount();

    const low = render(<BangladeshSvgMap {...baseProps} lowBandwidth />);
    expect(low.container.querySelectorAll('.animate-pulse')).toHaveLength(0);
    expect(low.container.querySelectorAll('.animate-ping')).toHaveLength(0);
  });

  it('still renders every district marker — the information stays, only the motion goes', () => {
    const full = render(<BangladeshSvgMap {...baseProps} />);
    const fullCount = full.getAllByRole('button').filter((node) =>
      (node.getAttribute('aria-label') || '').includes('District')).length;
    full.unmount();

    render(<BangladeshSvgMap {...baseProps} lowBandwidth />);
    const lowCount = screen.getAllByRole('button').filter((node) =>
      (node.getAttribute('aria-label') || '').includes('District')).length;
    expect(lowCount).toBe(fullCount);
  });

  it('uses the shared legend when one is supplied, instead of the static severity scale', () => {
    render(<BangladeshSvgMap {...baseProps} legendSlot={<span>Alert level: Watch</span>} />);
    expect(screen.getByText('Alert level: Watch')).toBeInTheDocument();
    expect(screen.queryByText(/Severity Scale:/)).not.toBeInTheDocument();
  });
});
