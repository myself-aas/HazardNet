import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The appearance control — the fix for the 2026-10-04 report.
 *
 * The theme has followed `prefers-color-scheme` since Phase 9, and `App.tsx` used to throw the
 * hook's return value away, so a visitor whose OS is in dark mode had no way back to light. These
 * tests hold the three things that report was about:
 *   · the control offers System *and* both fixed choices, and says which one is in force;
 *   · using it changes the document, not just some component state — `<html>` carries the
 *     attribute, the class and `color-scheme`, because the theme layer reads all three;
 *   · the preference is remembered (localStorage), so the next visit lands on the chosen theme;
 *   · and it is reachable where the site keeps its preferences: inside the menu drawer.
 */

let prefersDark = false;

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
});

beforeEach(() => {
  prefersDark = false;
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-mrd-theme');
  document.documentElement.classList.remove('dark');
});

import { useMeridianTheme } from '../meridian/motion';
import { ThemeToggle } from '../ThemeToggle';

const Harness: React.FC = () => {
  const { theme, setTheme } = useMeridianTheme();
  return <ThemeToggle theme={theme} onChange={setTheme} />;
};

describe('the appearance control', () => {
  it('offers System, Light and Dark in one labelled group and marks the one in force', () => {
    render(<Harness />);
    const group = screen.getByRole('group', { name: 'Appearance' });
    const options = within(group).getAllByRole('button');
    expect(options.map((option) => option.textContent)).toEqual(['System', 'Light', 'Dark']);
    // System is the default, so it is the pressed one on a first visit.
    expect(within(group).getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
    // 44px targets, like the language switch next to it.
    for (const option of options) expect(option.className).toContain('min-h-[44px]');
  });

  it('lets a dark-OS visitor get back to light, and remembers it', async () => {
    // The OS says dark: the app opens dark, which is correct — and used to be a one-way door.
    prefersDark = true;
    render(<Harness />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mrd-theme', 'dark'));
    expect(document.documentElement).toHaveClass('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mrd-theme', 'light'));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(window.localStorage.getItem('hazardnet.theme')).toBe('light');
  });

  it('goes back to following the OS when System is chosen again', async () => {
    prefersDark = true;
    render(<Harness />);
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mrd-theme', 'dark'));

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mrd-theme', 'light'));

    fireEvent.click(screen.getByRole('button', { name: 'System' }));
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-mrd-theme', 'dark'));
    expect(window.localStorage.getItem('hazardnet.theme')).toBe('system');
  });
});

/* ── reachability: the drawer, where the site keeps its preferences ─────────── */

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: null, userProfile: null, signOut: jest.fn() }),
}));
jest.mock('../../services/firebase', () => ({ auth: {}, db: {}, firebaseApp: {} }));
jest.mock('../../services/geolocationService', () => ({
  detectExactPinpointLocation: jest.fn(),
  getSeverityColor: () => 'currentColor',
}));
jest.mock('../../services/pushNotification', () => ({
  DEFAULT_VAPID_PUBLIC_KEY: '',
  urlBase64ToUint8Array: jest.fn(),
  getVapidKey: jest.fn(),
  requestNotificationPermission: jest.fn(),
  subscribeToPushNotifications: jest.fn(),
  unsubscribeFromPushNotifications: jest.fn(),
  getPushSubscriptionState: jest.fn().mockResolvedValue({ isSupported: false, isSubscribed: false, permission: 'denied' }),
  triggerTestPushNotification: jest.fn(),
}));

import Navbar from '../Navbar';

describe('the drawer', () => {
  it('carries the appearance control beside the language switch, and reports the choice to the shell', async () => {
    const onThemeChange = jest.fn();
    render(
      <MemoryRouter initialEntries={['/alerts']}>
        <Navbar theme="dark" onThemeChange={onThemeChange} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
    const drawer = await screen.findByTestId('menu-drawer');
    const group = within(drawer).getByRole('group', { name: 'Appearance' });
    expect(within(drawer).getByTestId('language-toggle')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(group).getByRole('button', { name: 'System' }));
    expect(onThemeChange).toHaveBeenCalledWith('system');
  });

  it('renders nothing extra when the shell does not wire a theme through', async () => {
    // `<Navbar />` without props is how the simplicity suite renders it; the drawer must not grow
    // a control that cannot do anything.
    render(
      <MemoryRouter initialEntries={['/alerts']}>
        <Navbar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
    const drawer = await screen.findByTestId('menu-drawer');
    expect(within(drawer).queryByTestId('theme-toggle')).toBeNull();
  });
});
