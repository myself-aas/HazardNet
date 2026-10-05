import '@testing-library/jest-dom';
/// <reference types="jest" />
/**
 * The vector map's alert layer and low-bandwidth rendering (Phase 5).
 *
 * Two properties are asserted, both of which the phase's project-killer is about:
 *
 *   1. a district that has **no** published alert must not be coloured as if it had one
 *      (the layer is an allowlist, and the accessible name of each marker says whether an
 *      alert exists);
 *   2. low-bandwidth mode removes decoration (glow circles, ping rings, the dotted grid)
 *      without removing information — every district marker is still rendered and still
 *      focusable.
 */

import { fireEvent, render, screen } from '@testing-library/react';
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
    // The layer is an allowlist: only the district passed in is described as having an alert.
    const labels = markers().map((node) => node.getAttribute('aria-label') || '');
    const withAlerts = labels.filter((label) => label.includes('HazardNet alert:'));
    expect(withAlerts).toHaveLength(1);
    expect(withAlerts[0]).toMatch(/Sunamganj/);
  });

  /**
   * The map is a composite widget with a ROVING tabindex, so "reachable" is
   * not "every marker is a tab stop" — that version of this test passed while
   * the map put 72 stops in the page's tab order, which is the bug the roving
   * pattern fixes. The contract is: exactly one stop into the widget, arrow
   * keys move inside it, and every marker keeps its name and role.
   */
  it('takes a single tab stop for the whole map', () => {
    const { container } = render(
      <BangladeshSvgMap {...baseProps} alertLevels={{ sunamganj: 'WATCH' }} lowBandwidth />,
    );
    const districts = Array.from(container.querySelectorAll('g[role="button"]')).filter((n) =>
      (n.getAttribute('aria-label') || '').includes('District'),
    );
    expect(districts.length).toBeGreaterThanOrEqual(64);
    expect(districts.filter((n) => n.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(districts.every((n) => n.getAttribute('aria-label'))).toBe(true);
  });

  it('moves the active marker with the arrow keys, and every marker can become it', () => {
    const { container } = render(<BangladeshSvgMap {...baseProps} lowBandwidth />);
    const districts = () =>
      Array.from(container.querySelectorAll('g[role="button"]')).filter((n) =>
        (n.getAttribute('aria-label') || '').includes('District'),
      );
    const activeIndex = () => districts().findIndex((n) => n.getAttribute('tabindex') === '0');

    expect(activeIndex()).toBe(0);
    fireEvent.keyDown(districts()[0], { key: 'ArrowRight' });
    expect(activeIndex()).toBe(1);
    fireEvent.keyDown(districts()[1], { key: 'ArrowLeft' });
    expect(activeIndex()).toBe(0);
    fireEvent.keyDown(districts()[0], { key: 'End' });
    expect(activeIndex()).toBe(districts().length - 1);
    fireEvent.keyDown(districts()[districts().length - 1], { key: 'Home' });
    expect(activeIndex()).toBe(0);
  });

  it('activates the focused marker with Enter and Space', () => {
    const onSelectDistrict = jest.fn();
    const { container } = render(
      <BangladeshSvgMap onSelectDistrict={onSelectDistrict} lowBandwidth />,
    );
    const first = container.querySelector('g[role="button"][tabindex="0"]')!;
    fireEvent.keyDown(first, { key: 'Enter' });
    fireEvent.keyDown(first, { key: ' ' });
    expect(onSelectDistrict).toHaveBeenCalledTimes(2);
  });

  it('gives every district a target at or above the 24px WCAG 2.5.8 floor', () => {
    // The painted marker is r=1.4 user units. The transparent hit circle is the
    // thing a finger actually lands on, so it is what has to clear the floor.
    const { container } = render(<BangladeshSvgMap {...baseProps} lowBandwidth />);
    const groups = Array.from(container.querySelectorAll('g[role="button"]')).filter((n) =>
      (n.getAttribute('aria-label') || '').includes('District'),
    );
    for (const g of groups) {
      const hit = g.querySelector('circle[fill="transparent"]');
      expect(hit).not.toBeNull();
      expect(Number(hit!.getAttribute('r'))).toBeGreaterThanOrEqual(3.5);
    }
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
