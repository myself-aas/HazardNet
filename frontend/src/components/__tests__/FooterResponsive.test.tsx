import '@testing-library/jest-dom';
/// <reference types="jest" />

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { Footer } from '../Footer';

describe('the footer on a phone', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
    window.scrollTo = jest.fn();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('lets the final row clear fixed controls and separates stacked links by 8px', () => {
    const { container } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    const footer = container.querySelector('footer') as HTMLElement;
    expect(footer.className).toContain('pb-[calc(6rem+env(safe-area-inset-bottom,0px))]');
    expect(footer.className).toContain('pl-[max(1rem,env(safe-area-inset-left,0px))]');
    expect(footer.querySelector('nav ul')?.className).toContain('space-y-2');
  });

  it('keeps back-to-top inside the safe area and does not smooth-scroll under reduced motion', () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );

    Object.defineProperty(window, 'scrollY', { configurable: true, value: 301 });
    fireEvent.scroll(window);

    const button = screen.getByRole('button', { name: /scroll to top/i });
    expect(button.className).toContain('bottom-[max(1.5rem,env(safe-area-inset-bottom,0px))]');
    expect(button.className).toContain('left-[max(1rem,env(safe-area-inset-left,0px))]');

    fireEvent.click(button);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });
});
