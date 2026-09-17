// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicCommerceAvailability } from "@/lib/publicCommerceAvailability";
import { marketingRoutes } from "@/lib/routes";

const mocks = vi.hoisted(() => ({ authed: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => mocks.authed,
}));

// The structural tests below describe the navigation as it ships once Social is
// on; the flag-off shape is asserted separately at the end of this file.
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

const { PublicLayout } = await import("./PublicLayout");
const { PRIMARY_CTA_LABEL, primaryPublicNav, productNav } = await import(
  "./PublicNav"
);

function renderLayout() {
  return render(
    <PublicLayout>
      <p>Page content</p>
    </PublicLayout>
  );
}

/** The header resolves its auth state in an effect, so let it settle. */
async function settle() {
  await vi.waitFor(() => {
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });
}

beforeEach(() => {
  mocks.authed = false;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("public navigation structure", () => {
  it("drops Home because the logo already goes there", async () => {
    renderLayout();
    await settle();

    expect(primaryPublicNav.some((item) => item.label === "Home")).toBe(false);

    const home = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === marketingRoutes.home);
    // Only the logo, and it carries the brand mark rather than a "Home" label.
    expect(home.length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("link", { name: /^home$/i })
    ).toBeNull();
  });

  it("keeps Sample Profile out of the primary navigation", () => {
    expect(primaryPublicNav.some((item) => item.label === "Sample Profile")).toBe(
      false
    );
  });

  it("keeps the top level short by grouping the product pages", () => {
    // Four product pages used to sit at the top level with no hierarchy, which
    // left Community — a pillar of the product now — nowhere to go that did not
    // make it six. They are one idea, so they are one menu.
    expect(productNav.map((item) => item.label)).toEqual([
      "Pet Profiles",
      "Safety Profile",
      "Smart Tags",
      "How It Works",
    ]);

    expect(primaryPublicNav.map((item) => item.label)).toEqual([
      "Community",
      "Pricing",
    ]);
  });

  it("puts Community at the top level, pointing at Explore", () => {
    const community = primaryPublicNav.find(
      (item) => item.label === "Community"
    );

    expect(community?.href).toBe("/explore");
  });

  it("does not promote Search to the navbar", () => {
    // Search is a tool inside Explore. A navbar link to an empty search box is
    // a dead end, and "Community, Explore, Search" is three names for one place.
    for (const item of [...productNav, ...primaryPublicNav]) {
      expect(item.label).not.toMatch(/search/i);
      expect(item.href).not.toBe("/search");
    }
  });

  it("lists no destination twice across the two tiers", () => {
    const hrefs = [...productNav, ...primaryPublicNav].map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("promotes Community only while Social is switched on", async () => {
    // Built fresh with the real flag rather than the mock above: a build with
    // Social off must not put a Community link on the public header, because
    // the same build tells owners Community is not open yet.
    vi.resetModules();
    vi.doMock("@/lib/features", async () => {
      const actual = await vi.importActual<typeof import("@/lib/features")>(
        "@/lib/features"
      );
      return { ...actual, socialEnabled: false };
    });

    const off = await import("./PublicNav");

    expect(
      off.primaryPublicNav.some((item) => item.label === "Community")
    ).toBe(false);
    // The product pages are unaffected — only Social promotion is gated.
    expect(off.productNav.map((item) => item.label)).toContain("Pet Profiles");

    vi.doUnmock("@/lib/features");
    vi.resetModules();
  });

  it("hides Where to Buy while no public purchase channel exists", () => {
    // There is no purchase path and no public partner projection yet, so
    // linking to a buying guide would be a dead end.
    expect(publicCommerceAvailability.showWhereToBuy).toBe(false);
    expect(primaryPublicNav.some((item) => item.label === "Where to Buy")).toBe(
      false
    );
  });
});

describe("public header auth states", () => {
  it("offers Log in and the primary CTA to a signed-out visitor", async () => {
    renderLayout();
    await settle();

    const header = within(screen.getByRole("banner"));
    expect(header.getAllByRole("link", { name: "Log in" }).length).toBeGreaterThan(0);
    expect(
      header.getAllByRole("button", { name: new RegExp(PRIMARY_CTA_LABEL, "i") })
        .length
    ).toBeGreaterThan(0);
    expect(header.queryByRole("link", { name: /open dashboard/i })).toBeNull();
  });

  it("swaps both for the dashboard once signed in", async () => {
    mocks.authed = true;
    renderLayout();

    await vi.waitFor(() => {
      expect(
        screen.getAllByRole("link", { name: /open dashboard/i }).length
      ).toBeGreaterThan(0);
    });

    // The footer keeps a Log in utility link for everyone; the header must not.
    const header = within(screen.getByRole("banner"));
    expect(header.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(
      header.queryByRole("button", { name: new RegExp(PRIMARY_CTA_LABEL, "i") })
    ).toBeNull();
  });
});

describe("mobile drawer", () => {
  function openDrawer() {
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    return screen.getByRole("navigation", { name: "Main menu" });
  }

  it("opens and closes from one labelled control", async () => {
    renderLayout();
    await settle();

    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("public-mobile-nav");

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: /close menu/i }).getAttribute("aria-expanded")
    ).toBe("true");
  });

  it("closes on Escape and returns focus to the menu toggle", async () => {
    renderLayout();
    await settle();

    const toggle = screen.getByRole("button", { name: /open menu/i });
    fireEvent.click(toggle);
    expect(document.querySelector("#public-mobile-nav")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.querySelector("#public-mobile-nav")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("separates primary links from secondary actions and one CTA", async () => {
    renderLayout();
    await settle();
    openDrawer();

    const drawer = document.querySelector("#public-mobile-nav");
    expect(drawer).toBeTruthy();
    const scope = within(drawer as HTMLElement);

    for (const item of primaryPublicNav) {
      expect(scope.getByRole("link", { name: item.label })).toBeTruthy();
    }

    // Secondary tier: reachable, but visibly quieter than the CTA.
    expect(scope.getByRole("link", { name: "View Sample Profile" })).toBeTruthy();
    expect(scope.getByRole("link", { name: "Log in" })).toBeTruthy();

    // Exactly one primary action in the drawer.
    expect(
      scope.getAllByRole("button", { name: new RegExp(PRIMARY_CTA_LABEL, "i") })
    ).toHaveLength(1);
    expect(scope.queryByRole("link", { name: "Where to Buy" })).toBeNull();
  });

  it("sends the drawer sample action to the Public Share Profile", async () => {
    renderLayout();
    await settle();
    openDrawer();

    expect(
      within(document.querySelector("#public-mobile-nav") as HTMLElement)
        .getByRole("link", { name: "View Sample Profile" })
        .getAttribute("href")
    ).toBe(marketingRoutes.samplePublicProfile);
  });

  it("closes when a destination is chosen", async () => {
    renderLayout();
    await settle();
    openDrawer();

    fireEvent.click(
      within(document.querySelector("#public-mobile-nav") as HTMLElement).getByRole(
        "link",
        { name: "Pricing" }
      )
    );

    expect(document.querySelector("#public-mobile-nav")).toBeNull();
  });
});
