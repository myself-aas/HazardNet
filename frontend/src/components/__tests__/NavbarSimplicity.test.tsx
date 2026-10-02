import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The header and the drawer, as designed in 2026-10.
 *
 * The complaint was a header crowded with pairs of icons and text side by side (a hamburger beside the logo, locate,
 * search, bell, Login, Sign up …) and a drawer to match. The contract now:
 *   · the BAR holds the brand, five plain-word links and exactly ONE button (the menu button) — at every width;
 *   · everything that used to crowd it is in the DRAWER, labelled in words, in two-column groups of plain links;
 *   · search is reachable from the drawer (and Ctrl/Cmd+K) and still opens the one command palette.
 */

let mockUser: unknown = null;
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, userProfile: null, signOut: jest.fn() }),
}));
jest.mock('../../services/firebase', () => ({ auth: {}, db: {}, firebaseApp: {} }));
jest.mock('../../services/geolocationService', () => ({
  detectExactPinpointLocation: jest.fn(),
  getSeverityColor: () => '#DC2626',
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
import { DRAWER_SECTIONS, PRIMARY_LINKS } from '../../lib/navigation';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
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
});

const renderNavbar = (path = '/alerts') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>,
  );

beforeEach(() => {
  mockUser = null;
});

describe('the header bar', () => {
  it('holds the brand, five plain-word links and exactly one button', () => {
    renderNavbar();
    const header = screen.getByRole('banner');
    const buttons = within(header).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/open navigation menu/i);

    const nav = within(header).getByRole('navigation', { name: /main navigation/i });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(PRIMARY_LINKS.map((link) => link.label));
    // brand + five links; nothing else is a link in the bar
    expect(within(header).getAllByRole('link')).toHaveLength(1 + PRIMARY_LINKS.length);
    expect(within(header).getByRole('img', { name: 'HazardNet' })).toBeInTheDocument();
  });

  it('no longer carries the controls that were crowding it', () => {
    renderNavbar();
    const header = screen.getByRole('banner');
    for (const name of [/locate/i, /search/i, /push alerts?/i, /^login$/i, /sign up/i, /sign in/i, /realtime|firebase/i]) {
      expect(within(header).queryByRole('button', { name })).toBeNull();
      expect(within(header).queryByRole('link', { name })).toBeNull();
    }
    expect(screen.queryByTestId('navbar-auth-links')).toBeNull();
  });

  it('marks the current section for assistive tech', () => {
    renderNavbar('/alerts');
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the menu button a 44px target that announces what it controls', () => {
    renderNavbar();
    const button = screen.getByRole('button', { name: /open navigation menu/i });
    expect(button.className).toContain('tap-target');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'menu-drawer');
    expect(button.querySelector('svg.hn-menu-icon')).toHaveAttribute('data-open', 'false');
  });
});

describe('the drawer', () => {
  const open = async () => {
    fireEvent.click(screen.getByRole('button', { name: /open navigation menu/i }));
    return screen.findByTestId('menu-drawer');
  };

  it('opens as a labelled dialog and flips the menu icon into a close mark', async () => {
    renderNavbar();
    const drawer = await open();
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveAttribute('id', 'menu-drawer');
    expect(screen.getAllByRole('button', { name: /close navigation menu/i }).length).toBeGreaterThan(0);
  });

  it('puts search first, then three one-word tiles, then the language switch', async () => {
    renderNavbar();
    const drawer = await open();
    expect(within(drawer).getByTestId('district-search-trigger')).toHaveTextContent('Search');
    expect(within(drawer).getByRole('button', { name: 'Locate' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /^alerts/i, pressed: false })).toBeInTheDocument();
    expect(within(drawer).getByRole('link', { name: 'Apps' })).toHaveAttribute('href', '/download');
    expect(within(drawer).getByTestId('language-toggle')).toBeInTheDocument();
  });

  it('shows every destination in four labelled groups, nothing collapsed, plain words only', async () => {
    renderNavbar();
    const drawer = await open();
    for (const section of DRAWER_SECTIONS) {
      const heading = within(drawer).getByRole('heading', { name: section.category });
      const group = heading.closest('section') as HTMLElement;
      const links = within(group).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(section.items.map((item) => item.title));
      expect(links.map((link) => link.getAttribute('href'))).toEqual(section.items.map((item) => item.path));
    }
    // none of the old accordion count badges, and no description text under a label
    expect(within(drawer).queryByText(/^\d+$/)).toBeNull();
    expect(within(drawer).queryByText(/interactive 3D|Real-time|Deep-dive|Personalized/i)).toBeNull();
  });

  it('keeps one sign-in path: Sign in / Sign up (their test ids are part of the e2e contract)', async () => {
    renderNavbar();
    const drawer = await open();
    expect(within(drawer).getByTestId('drawer-signin-link')).toHaveAttribute('href', '/login');
    expect(within(drawer).getByTestId('drawer-signup-link')).toHaveAttribute('href', '/signup');
  });

  it('shows the account row instead once signed in', async () => {
    mockUser = { displayName: 'Rafi Ahmed', email: 'rafi@example.com' };
    renderNavbar();
    const drawer = await open();
    expect(within(drawer).queryByTestId('drawer-signin-link')).toBeNull();
    expect(within(drawer).getByRole('button', { name: /profile/i })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('closes when a destination is chosen', async () => {
    renderNavbar();
    const drawer = await open();
    fireEvent.click(within(drawer).getByRole('link', { name: 'Crops' }));
    await waitFor(() => expect(screen.queryByTestId('menu-drawer')).toBeNull());
  });

  it('opens the one command palette from the Search row, closing the drawer behind it', async () => {
    renderNavbar();
    const drawer = await open();
    fireEvent.click(within(drawer).getByTestId('district-search-trigger'));
    expect(await screen.findByTestId('district-search-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('menu-drawer')).toBeNull();
    // the header carries no search trigger and the drawer's went with the drawer: none left in the document
    expect(screen.queryAllByTestId('district-search-trigger')).toHaveLength(0);
  });
});
