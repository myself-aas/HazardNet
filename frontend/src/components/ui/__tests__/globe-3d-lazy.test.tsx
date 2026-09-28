/**
 * @jest-environment jsdom
 *
 * The lazy boundary around the WebGL globe.
 *
 * `./3d-globe` is mocked here on purpose. Rendering the real thing needs a WebGL context,
 * which jsdom does not have, so an unmocked import would fail for a reason that has
 * nothing to do with the boundary. What this file is actually testing is the split: that
 * the chunk is deferred, that a fallback shows while it loads, and that the resolved
 * component receives its props.
 */

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import Globe3DLazy from '../globe-3d-lazy';

jest.mock('../3d-globe', () => ({
  __esModule: true,
  default: ({ markers, className }: { markers?: { label?: string }[]; className?: string }) => (
    <div data-testid="globe-3d" data-class={className} data-count={markers?.length ?? 0}>
      {markers?.[0]?.label ?? 'no-markers'}
    </div>
  ),
}));

describe('<Globe3DLazy />', () => {
  it('shows the fallback before the chunk resolves', () => {
    render(<Globe3DLazy />);
    // Synchronous: nothing has resolved yet on the first paint.
    expect(screen.getByTestId('globe-3d-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('globe-3d')).not.toBeInTheDocument();
  });

  it('renders the globe and forwards props once loaded', async () => {
    const markers = [
      { lat: 23.8103, lng: 90.4125, src: '/x.webp', label: 'Dhaka' },
      { lat: 51.5074, lng: -0.1278, src: '/y.webp', label: 'London' },
    ];
    render(<Globe3DLazy markers={markers} className="h-[600px]" />);

    await waitFor(() => expect(screen.getByTestId('globe-3d')).toBeInTheDocument());

    const globe = screen.getByTestId('globe-3d');
    expect(globe).toHaveTextContent('Dhaka');
    expect(globe).toHaveAttribute('data-count', '2');
    // The wrapper must hand the globe a filling height, or it collapses to zero.
    expect(globe).toHaveAttribute('data-class', 'h-full w-full');
  });

  it('accepts a custom fallback', () => {
    /*
     * `React.lazy` caches the resolved module for the lifetime of the module registry, so
     * after the test above the fallback is unreachable — React renders the resolved
     * component synchronously. A fresh registry restores the unresolved state, which is
     * the only way to observe a custom fallback at all.
     */
    let FreshGlobe: typeof Globe3DLazy = Globe3DLazy;
    jest.isolateModules(() => {
      FreshGlobe = require('../globe-3d-lazy').default;
    });

    const { getByTestId } = render(<FreshGlobe fallback={<div data-testid="custom-fallback" />} />);
    expect(getByTestId('custom-fallback')).toBeInTheDocument();
  });
});
