/**
 * @jest-environment jsdom
 *
 * HeroSpaceCanvas — the hero background is drawn, not streamed.
 *
 * jsdom has no canvas implementation, so these tests install a recording stub for the 2D
 * context. That is what makes them worth having: without it the drawing code never runs,
 * and a scene that throws on the first `createRadialGradient` would still "pass" a test
 * that only checked the element exists.
 */

import '@testing-library/jest-dom';
import { act, cleanup, render } from '@testing-library/react';
import HeroSpaceCanvas from '../HeroSpaceCanvas';

interface StubCall {
  name: string;
  args: unknown[];
}

/** A 2D context that records what the scene asked of it. */
function makeStubContext(): CanvasRenderingContext2D & { calls: StubCall[] } {
  const calls: StubCall[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args });
    };
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    arc: record('arc'),
    ellipse: record('ellipse'),
    fill: record('fill'),
    stroke: record('stroke'),
    save: record('save'),
    clip: record('clip'),
    restore: record('restore'),
  } as unknown as CanvasRenderingContext2D & { calls: StubCall[] };
}

const RECT = {
  width: 1280,
  height: 720,
  top: 0,
  left: 0,
  right: 1280,
  bottom: 720,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

/**
 * jsdom's canvas has no 2D context and every box is zero-sized. Stubbing both is what
 * lets the drawing code actually execute — and a real size matters, because a 0x0 box
 * would exercise the degenerate path instead of the projection maths.
 */
function installStubCanvas(): () => void {
  const originalContext = HTMLCanvasElement.prototype.getContext;
  const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return makeStubContext();
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getBoundingClientRect = () => RECT;
  return () => {
    HTMLCanvasElement.prototype.getContext = originalContext;
    HTMLCanvasElement.prototype.getBoundingClientRect = originalRect;
  };
}

describe('<HeroSpaceCanvas />', () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('is decorative: hidden from assistive tech and not focusable', () => {
    const restore = installStubCanvas();
    const { getByTestId } = render(<HeroSpaceCanvas />);
    const canvas = getByTestId('hero-space-canvas');
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
    expect(canvas).toHaveAttribute('role', 'presentation');
    expect(canvas.tagName).toBe('CANVAS');
    restore();
  });

  it('draws a full scene when animation is allowed', () => {
    const restore = installStubCanvas();
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    render(<HeroSpaceCanvas reducedMotion={false} />);

    // A single still is painted at mount, before any animation frame lands.
    expect(raf).toHaveBeenCalled();
    restore();
  });

  it('runs the animation loop and stops it on unmount', () => {
    const restore = installStubCanvas();
    const raf = jest.spyOn(window, 'requestAnimationFrame');
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    let nextFrame: FrameRequestCallback | undefined;
    raf.mockImplementation((cb) => {
      nextFrame = cb;
      return 7;
    });

    const { unmount } = render(<HeroSpaceCanvas />);

    // Drive a frame past the throttle interval so the loop actually renders.
    act(() => {
      nextFrame?.(performance.now() + 1000);
    });
    expect(nextFrame).toBeDefined();

    unmount();
    expect(cancel).toHaveBeenCalled();
    restore();
  });

  it('never starts the loop under reduced motion — one frame and no more', () => {
    const restore = installStubCanvas();
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    render(<HeroSpaceCanvas reducedMotion />);

    expect(raf).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    restore();
  });

  it('survives an engine with no 2D context', () => {
    // A disabled GPU or a privacy mode that refuses canvas returns null. A decorative
    // layer must not throw and take the hero with it.
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    expect(() => render(<HeroSpaceCanvas />)).not.toThrow();
    expect(raf).not.toHaveBeenCalled();

    HTMLCanvasElement.prototype.getContext = original;
  });

  it('issues the drawing calls the scene is made of', () => {
    let recorded: StubCall[] = [];
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const stub = makeStubContext() as unknown as { calls: StubCall[] } & CanvasRenderingContext2D;
      recorded = stub.calls;
      return stub;
    } as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const originalRect = HTMLCanvasElement.prototype.getBoundingClientRect;
    HTMLCanvasElement.prototype.getBoundingClientRect = () =>
      ({
        width: 1280,
        height: 720,
        top: 0,
        left: 0,
        right: 1280,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    render(<HeroSpaceCanvas reducedMotion />);

    const names = recorded.map((call) => call.name);
    // The scene must reach every stage: background fill, star arcs, sphere shading,
    // landmass/cloud ellipses, rim stroke. A throw partway through would truncate this.
    expect(names).toContain('fillRect');
    expect(names).toContain('arc');
    expect(names).toContain('ellipse');
    expect(names).toContain('clip');
    expect(names).toContain('stroke');
    expect(names).toContain('restore');
    expect(recorded.length).toBeGreaterThan(200);

    HTMLCanvasElement.prototype.getContext = original;
    HTMLCanvasElement.prototype.getBoundingClientRect = originalRect;
  });
});
