// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard",
  logoutOwner: vi.fn(),
  replace: vi.fn(),
  socialEnabled: true,
}));

// socialEnabled is a build-time constant and defaults to false, so the
// Community half would not render at all without this.
vi.mock("@/lib/features", async () => {
  const actual = await vi.importActual<typeof import("@/lib/features")>(
    "@/lib/features"
  );

  return {
    ...actual,
    socialEnabled: true,
    ownerProductFeatures: { ...actual.ownerProductFeatures, socialEnabled: true },
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}));

vi.mock("@/components/auth/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/brand/BrandLogo", () => ({
  BrandLogo: () => <span>MyPetLink logo</span>,
}));

vi.mock("@/components/layouts/MobileBottomNav", () => ({
  MobileBottomNav: () => <nav aria-label="My Pets mobile" />,
}));

vi.mock("@/components/layouts/SocialBottomNav", () => ({
  SocialBottomNav: () => <nav aria-label="Community mobile" />,
}));

vi.mock("@/components/layouts/OwnerKeyboardViewport", () => ({
  OwnerKeyboardViewport: () => null,
}));

vi.mock("@/components/portal/OwnerHeaderActions", () => ({
  OwnerHeaderActionsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  OwnerPortalHeader: () => null,
}));

vi.mock("@/services/authService", () => ({
  logoutOwner: () => mocks.logoutOwner(),
}));

vi.mock("@/lib/useUnreadActivity", () => ({ useUnreadActivity: () => 0 }));

vi.mock("@/lib/useSocialActions", () => ({
  useSocialActions: () => ({ openCreate: vi.fn(), openOwnProfile: vi.fn() }),
}));

import { AppLayout } from "@/components/layouts/AppLayout";

/**
 * Two modes, one shell.
 *
 * The sidebar used to render both navigation groups together — eleven
 * destinations at once, and two of them highlighted, because each half decided
 * its own active state without knowing about the other. These check that the
 * route decides, that only one list is on screen, and that the switch between
 * them is reachable from either side.
 */

function sidebarNav(name: RegExp) {
  return screen.getByRole("navigation", { name });
}

beforeEach(() => {
  mocks.pathname = "/dashboard";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("desktop navigation modes", () => {
  it("shows only Community destinations on a Community route", () => {
    mocks.pathname = "/feed";

    render(<AppLayout>content</AppLayout>);

    const community = sidebarNav(/^community$/i);
    const labels = within(community)
      .getAllByRole("link")
      .concat(within(community).getAllByRole("button"))
      .map((item) => item.textContent?.trim());

    expect(labels).toEqual(
      expect.arrayContaining(["Home", "Explore", "Share a Moment", "Activity", "My profile"])
    );

    // And the management list is not underneath it.
    expect(screen.queryByRole("navigation", { name: /^my pets$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Care Records" })).toBeNull();
  });

  it("shows only management destinations on a My Pets route", () => {
    mocks.pathname = "/dashboard";

    render(<AppLayout>content</AppLayout>);

    const pets = sidebarNav(/^my pets$/i);
    expect(within(pets).getByRole("link", { name: "Dashboard" })).toBeTruthy();

    expect(screen.queryByRole("navigation", { name: /^community$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "Explore" })).toBeNull();
  });

  it("never marks two primary items active at once", () => {
    mocks.pathname = "/feed";

    render(<AppLayout>content</AppLayout>);

    // aria-current is the semantic the sidebar uses for "this page".
    const current = document.querySelectorAll('[aria-current="page"]');
    expect(current.length).toBeLessThanOrEqual(1);
  });

  it("offers a switch to My Pets while in Community", () => {
    mocks.pathname = "/feed";

    render(<AppLayout>content</AppLayout>);

    const link = screen.getByTestId("mode-switch");
    expect(link.textContent).toContain("Switch to My Pets");
    expect(link.getAttribute("href")).toBe("/dashboard");
  });

  it("offers a switch to Community while in My Pets", () => {
    mocks.pathname = "/dashboard";

    render(<AppLayout>content</AppLayout>);

    const link = screen.getByTestId("mode-switch");
    expect(link.textContent).toContain("Switch to Community");
    expect(link.getAttribute("href")).toBe("/feed");
  });

  it("keeps the Community editor inside Community", () => {
    mocks.pathname = "/community/profile";

    render(<AppLayout>content</AppLayout>);

    expect(sidebarNav(/^community$/i)).toBeTruthy();
    expect(screen.getByTestId("mode-switch").textContent).toContain("Switch to My Pets");
  });

  it("picks the phone bar from the same route, not a separate prop", () => {
    mocks.pathname = "/explore";
    const { unmount } = render(<AppLayout>content</AppLayout>);

    expect(screen.getByRole("navigation", { name: "Community mobile" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "My Pets mobile" })).toBeNull();

    unmount();
    mocks.pathname = "/pets";
    render(<AppLayout>content</AppLayout>);

    expect(screen.getByRole("navigation", { name: "My Pets mobile" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Community mobile" })).toBeNull();
  });
});
