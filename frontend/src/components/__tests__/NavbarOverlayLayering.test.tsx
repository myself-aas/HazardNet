import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Mobile overlay layering contract (2026-09-17 fix).
 *
 * The navbar's full-screen overlays (menu drawer, profile modal, saved
 * assessments) used to render INSIDE the header wrapper's stacking context
 * with z-50 while the header bar itself is z-[2000] — so the sticky header
 * painted on top of the popups (the reported "popup overlaps the header"
 * mobile bug). They must now portal to document.body and carry a z-index
 * above every other layer (header z-40, chat window z-[10000]).
 */

// Navbar pulls the whole auth/firebase stack; only the layering matters here.
jest.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: null, userProfile: null }),
}));
jest.mock("../../services/firebase", () => ({
  auth: {},
  db: {},
  firebaseApp: {},
}));
jest.mock("../../services/geolocationService", () => ({
  detectExactPinpointLocation: jest.fn(),
}));
jest.mock("../../services/pushNotification", () => ({
  DEFAULT_VAPID_PUBLIC_KEY: "",
  urlBase64ToUint8Array: jest.fn(),
  getVapidKey: jest.fn(),
  requestNotificationPermission: jest.fn(),
  subscribeToPushNotifications: jest.fn(),
  unsubscribeFromPushNotifications: jest.fn(),
  getPushSubscriptionState: jest.fn().mockResolvedValue({
    isSupported: false,
    isSubscribed: false,
    permission: "denied",
  }),
  triggerTestPushNotification: jest.fn(),
}));

import Navbar from "../Navbar";

// jsdom does not implement matchMedia (used by the PWA install prompt and
// responsive hooks inside the navbar subtree).
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
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
});

const routerWrap = (ui: React.ReactElement) => <MemoryRouter>{ui}</MemoryRouter>;

describe("Navbar overlay layering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("portals the menu drawer to document.body, above the header and chat layers", async () => {
    const { container } = render(routerWrap(<Navbar />));

    // Before opening: the drawer is not in the navbar's own DOM subtree.
    expect(container.querySelector('[data-testid="menu-drawer"]')).toBeNull();

    await screen.getByRole("button", { name: /open navigation menu/i }).click();

    const drawer = await waitFor(() => {
      const el = document.body.querySelector('[data-testid="menu-drawer"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    // Portaled to body, not inside the header stacking context.
    expect(drawer.closest("header")).toBeNull();
    expect(document.body.contains(drawer)).toBe(true);

    // Above the chat window (z-[10000]) and the header (z-40).
    expect(drawer.className).toContain("z-[10002]");
  });

  it("gives the drawer backdrop the overlay z-tier, above the chat window", async () => {
    render(routerWrap(<Navbar />));
    await screen.getByRole("button", { name: /open navigation menu/i }).click();

    const backdrop = await waitFor(() => {
      const el = document.body.querySelector('[data-testid="menu-drawer"]')
        ?.previousElementSibling as HTMLElement | null;
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(backdrop.className).toContain("z-[10001]");
    expect(backdrop.className).toContain("fixed inset-0");
  });

  it("renders the compact bar hamburger as a 44px tap target inside the header", () => {
    render(routerWrap(<Navbar />));
    const burger = screen.getByRole("button", { name: /open navigation menu/i });
    expect(burger.className).toContain("tap-target");
    expect(burger.closest("header")).not.toBeNull();
  });
});
