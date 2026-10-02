import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { InfinityLoader } from '../InfinityLoader';
import { MenuToggleIcon } from '../MenuToggleIcon';
import { INFINITY } from '../../../design-system/brand/infinity.generated';

/**
 * The interactive loader and the menu icon.
 *
 * What is pinned: the loader draws the generated geometry; it announces itself politely (and can stay quiet inside a
 * status region that already speaks); hover eases the comets' playback rate up and back (never a jump); pointer
 * movement tilts it; a tap bursts; reduced motion attaches nothing at all.
 */

let mockReduced = false;
jest.mock('framer-motion', () => ({
  ...jest.requireActual('framer-motion'),
  useReducedMotion: () => mockReduced,
}));

let animations: Array<{ playbackRate: number }> = [];

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
  animations = [{ playbackRate: 1 }, { playbackRate: 1 }];
  // jsdom has no Web Animations API: provide the one method the loader uses.
  Object.defineProperty(SVGElement.prototype, 'getAnimations', { configurable: true, value: () => animations });
});

afterEach(() => {
  jest.useRealTimers();
  // @ts-expect-error — remove the shim so other suites see a plain jsdom
  delete SVGElement.prototype.getAnimations;
});

const root = (container: HTMLElement) => container.querySelector('.hn-loop') as HTMLElement;
const move = (el: HTMLElement, x: number, y: number) => el.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));

describe('InfinityLoader', () => {
  it('draws the generated geometry: a track, two comets of four layers, and a node + ring at each apex', () => {
    const { container } = render(<InfinityLoader />);
    expect(container.querySelectorAll('.hn-loop__track')).toHaveLength(1);
    expect(container.querySelectorAll('.hn-loop__comet')).toHaveLength(2 * INFINITY.layers.length);
    expect(container.querySelectorAll('.hn-loop__node')).toHaveLength(2);
    expect(container.querySelectorAll('.hn-loop__ring')).toHaveLength(2);
    expect(container.querySelector('.hn-loop__track')).toHaveAttribute('d', INFINITY.full);
    expect(container.querySelectorAll('linearGradient stop')).toHaveLength(INFINITY.gradient.length);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('lines the comet heads up: the longest tail starts earliest, the second comet half a lap behind', () => {
    const { container } = render(<InfinityLoader />);
    const delays = Array.from(container.querySelectorAll<SVGPathElement>('.hn-loop__comet')).map((p) => parseFloat(p.style.animationDelay));
    expect(delays.slice(0, 4)[0]).toBeCloseTo(-(INFINITY.lap * 0) / 100, 5); // tail: the reference
    expect(delays.slice(0, 4)).toEqual([...delays.slice(0, 4)].sort((a, b) => b - a)); // shorter dash → later start (more negative)
    expect(delays[4] - delays[0]).toBeCloseTo(-INFINITY.lap / 2, 2);
  });

  it('announces itself politely with a visually hidden label — and shows no words of its own', () => {
    render(<InfinityLoader label="Loading page" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Loading page');
    expect(screen.getByText('Loading page')).toHaveClass('sr-only');
  });

  it('can stay silent inside a wrapper that is already a status region (no double announcement)', () => {
    render(
      <div role="status" aria-label="Checking permissions">
        <InfinityLoader announce={false} />
      </div>,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByText('Loading')).toBeNull();
  });

  it('speeds the comets up on hover, easing — not jumping — and eases back on leave', () => {
    const { container } = render(<InfinityLoader />);
    const el = root(container);
    act(() => {
      el.dispatchEvent(new MouseEvent('pointerenter'));
      jest.advanceTimersByTime(48); // three frames
    });
    const early = animations[0].playbackRate;
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(2.4); // still easing: not already at the target
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(animations[0].playbackRate).toBeGreaterThan(2.3);
    expect(el).toHaveAttribute('data-hot', 'true');

    act(() => {
      el.dispatchEvent(new MouseEvent('pointerleave'));
      jest.advanceTimersByTime(1600);
    });
    expect(animations[0].playbackRate).toBeCloseTo(1, 1);
    expect(el).toHaveAttribute('data-hot', 'false');
  });

  it('tilts toward the pointer, bounded, and settles flat on leave', () => {
    const { container } = render(<InfinityLoader />);
    const el = root(container);
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 60, right: 100, bottom: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const svg = container.querySelector('svg') as SVGSVGElement;
    act(() => move(el, 100, 0)); // top-right corner
    expect(svg.style.transform).toBe('rotateX(16.0deg) rotateY(22.0deg)');
    act(() => move(el, 0, 60)); // bottom-left corner
    expect(svg.style.transform).toBe('rotateX(-16.0deg) rotateY(-22.0deg)');
    act(() => {
      el.dispatchEvent(new MouseEvent('pointerleave'));
    });
    expect(svg.style.transform).toBe('');
  });

  it('bursts on tap: rings leave the nodes and the comets surge past hover speed', () => {
    const { container } = render(<InfinityLoader />);
    const el = root(container);
    act(() => {
      el.dispatchEvent(new MouseEvent('pointerdown'));
      jest.advanceTimersByTime(400);
    });
    expect(el).toHaveClass('is-burst');
    expect(animations[0].playbackRate).toBeGreaterThan(2.5);
  });

  it('attaches nothing when interactive is off, or when the visitor asked for reduced motion', () => {
    const plain = render(<InfinityLoader interactive={false} />);
    expect(root(plain.container)).toHaveAttribute('data-interactive', 'false');
    act(() => {
      root(plain.container).dispatchEvent(new MouseEvent('pointerenter'));
      jest.advanceTimersByTime(500);
    });
    expect(animations[0].playbackRate).toBe(1);
    plain.unmount();

    mockReduced = true;
    const calm = render(<InfinityLoader />);
    expect(root(calm.container)).toHaveAttribute('data-interactive', 'false');
    act(() => {
      root(calm.container).dispatchEvent(new MouseEvent('pointerdown'));
      jest.advanceTimersByTime(500);
    });
    expect(root(calm.container)).not.toHaveClass('is-burst');
    expect(animations[0].playbackRate).toBe(1);
  });

  it('resets playback and the tilt when it unmounts mid-hover', () => {
    const { container, unmount } = render(<InfinityLoader />);
    const el = root(container);
    act(() => {
      el.dispatchEvent(new MouseEvent('pointerenter'));
      jest.advanceTimersByTime(300);
    });
    expect(animations[0].playbackRate).toBeGreaterThan(1);
    unmount();
    expect(animations[0].playbackRate).toBe(1);
  });

  it('does not throw where the Web Animations API is missing (older browsers, jsdom)', () => {
    // @ts-expect-error — simulate a browser without getAnimations
    delete SVGElement.prototype.getAnimations;
    expect(() => render(<InfinityLoader />)).not.toThrow();
  });
});

describe('MenuToggleIcon', () => {
  it('is two bars and a node, decorative, and reports its state for the CSS to animate', () => {
    const { container, rerender } = render(<MenuToggleIcon />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-open', 'false');
    expect(container.querySelectorAll('.hn-menu-icon__bar')).toHaveLength(2);
    expect(container.querySelectorAll('.hn-menu-icon__node')).toHaveLength(1);
    rerender(<MenuToggleIcon open />);
    expect(container.querySelector('svg')).toHaveAttribute('data-open', 'true');
  });

  it('sizes itself', () => {
    const { container } = render(<MenuToggleIcon size={30} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '30');
  });
});
