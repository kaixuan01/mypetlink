// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/socialNavigation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/socialNavigation")>(
    "@/lib/socialNavigation"
  );
  return {
    ...actual,
    // The switch only exists when Community does. These tests are about the
    // header, so Community is on for all of them.
    socialNavItems: [{ id: "feed" }],
  };
});

import { MobileAppHeader } from "@/components/layouts/MobileAppHeader";

/**
 * One header, two halves of the product, two states.
 *
 * The bug it was built for: scrolling a My Pets page collapsed the header to a
 * title and an Add button, and the Community switch — the only thing on screen
 * saying which half you were in, and the only way to the other one — disappeared
 * with it. Community pages, meanwhile, had no compact header at all, because the
 * compact bar was owned by the page-action component and Community has no page
 * action.
 *
 * jsdom has no scrolling and no sticky, so the compact state is driven here the
 * way the browser drives it — through the intersection callback — and the sticky
 * geometry is confirmed in a real browser and recorded separately.
 */

type ObserverEntry = { isIntersecting: boolean; bottom: number };
let notify: ((entry: ObserverEntry) => void) | null = null;

beforeEach(() => {
  mocks.pathname = "/dashboard";
  notify = null;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      media: "(max-width: 1023px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });

  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = ({ isIntersecting, bottom }) =>
          act(() => {
            callback(
              [{ isIntersecting, boundingClientRect: { bottom } } as never],
              this as never
            );
          });
      }
      disconnect() {}
      observe() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function scrollPastHeader() {
  notify?.({ isIntersecting: false, bottom: -1 });
}

function compact() {
  return screen.getByTestId("mobile-compact-header");
}

const addAction = () => (
  <button aria-label="Add a pet, care record, or moment" type="button">
    Add
  </button>
);

describe("My Pets", () => {
  it("offers the Community switch before anybody scrolls", () => {
    render(<MobileAppHeader renderAction={addAction} />);

    const header = screen.getByRole("banner");

    expect(within(header).getByTestId("social-mode-switch").textContent).toBe(
      "Community"
    );
    expect(
      within(header).getByRole("link", { name: /mypetlink home/i })
    ).toBeTruthy();
  });

  it("keeps the Community switch after scrolling", () => {
    render(<MobileAppHeader renderAction={addAction} />);

    scrollPastHeader();

    // The whole point. This used to collapse to a title and an Add button.
    expect(within(compact()).getByTestId("social-mode-switch").textContent).toBe(
      "Community"
    );
  });

  it("keeps the page action reachable exactly once", () => {
    render(<MobileAppHeader renderAction={addAction} />);

    scrollPastHeader();

    expect(
      within(compact()).getByRole("button", { name: /add a pet, care record/i })
    ).toBeTruthy();
    // The original is inert, so there is one of everything for a keyboard.
    expect(
      screen.getAllByRole("button", { name: /add a pet, care record/i })
    ).toHaveLength(1);
  });
});

describe("Community", () => {
  beforeEach(() => {
    mocks.pathname = "/explore";
  });

  it("offers the My Pets switch before anybody scrolls", () => {
    render(<MobileAppHeader />);

    expect(
      within(screen.getByRole("banner")).getByTestId("social-mode-switch")
        .textContent
    ).toBe("My Pets");
  });

  it("gets a compact header too, despite having no page action", () => {
    render(<MobileAppHeader />);

    scrollPastHeader();

    // Community had none at all: the bar was conditional on a page action.
    expect(within(compact()).getByTestId("mobile-compact-title").textContent).toBe(
      "Explore"
    );
    expect(within(compact()).getByTestId("social-mode-switch").textContent).toBe(
      "My Pets"
    );
  });

  it("does not grow an Add action of its own", () => {
    render(<MobileAppHeader />);

    scrollPastHeader();

    // Sharing a Moment already lives in the bottom bar; a second creation
    // entry point in the header would be two doors to one room.
    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
    expect(within(compact()).queryByRole("button", { name: /add/i })).toBeNull();
  });
});

describe("what the compact header calls the page", () => {
  it.each([
    ["/dashboard", "Home"],
    ["/pets", "Pets"],
    ["/tags", "Smart Tags"],
    ["/orders", "Orders"],
    ["/settings", "Settings"],
    ["/feed", "Home"],
    ["/explore", "Explore"],
    ["/search", "Search"],
    ["/notifications", "Activity"],
    ["/community/profile", "My profile"],
  ])("names %s as %s", (pathname, title) => {
    mocks.pathname = pathname;
    render(<MobileAppHeader />);

    scrollPastHeader();

    expect(within(compact()).getByTestId("mobile-compact-title").textContent).toBe(
      title
    );
  });

  it.each([
    ["/pets/pet_1/moments", "Moments"],
    ["/pets/pet_1/records", "Care records"],
    ["/pets/pet_1/tags", "Smart Tags"],
    ["/pets/pet_1/edit", "Edit pet"],
    ["/community/profile/edit", "Edit profile"],
    ["/tags/order", "Smart Tags"],
  ])("resolves the nested route %s to %s", (pathname, title) => {
    mocks.pathname = pathname;
    render(<MobileAppHeader />);

    scrollPastHeader();

    expect(within(compact()).getByTestId("mobile-compact-title").textContent).toBe(
      title
    );
  });

  it("truncates a long title rather than letting it push the switch out", () => {
    mocks.pathname = "/pets/pet_1/moments";
    render(<MobileAppHeader />);

    scrollPastHeader();

    const title = within(compact()).getByTestId("mobile-compact-title");

    expect(title.className).toContain("truncate");
    expect(title.className).toContain("min-w-0");
    // Everything to its right refuses to give up room.
    expect(
      within(compact()).getByTestId("social-mode-switch").className
    ).toContain("shrink-0");
  });
});

describe("a focused detail route", () => {
  it("keeps its own header rather than gaining a sticky one", () => {
    mocks.pathname = "/moments/9c1f8a2e-1111-4a2b-8c3d-4e5f60718293";
    render(<MobileAppHeader />);

    scrollPastHeader();

    // A Moment's page is one piece of media with its own Back control. A bar
    // repeating the app's chrome over it is noise on a page whose job is to
    // get out of the way.
    expect(screen.queryByTestId("mobile-compact-header")).toBeNull();
  });
});

describe("the brand", () => {
  it("never shrinks into an ellipsis", () => {
    render(<MobileAppHeader renderAction={addAction} />);

    const brand = screen.getByRole("link", { name: /mypetlink home/i });
    const wordmark = [...brand.querySelectorAll("span")].find(
      (span) => span.textContent === "MyPetLink"
    );

    expect(brand.className).toContain("shrink-0");
    expect(brand.className).not.toContain("min-w-0");
    expect(wordmark?.className).toContain("whitespace-nowrap");
    expect(wordmark?.className).not.toContain("truncate");
  });
});

describe("one implementation", () => {
  const web = join(__dirname, "..", "..", "..");
  const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

  it("is the only thing that renders a mobile app header", () => {
    const owner = read("components/portal/OwnerHeaderActions.tsx");

    // The Owner Portal contributes its page action and nothing else. It used to
    // own the brand, the switch, the sticky bar and the scroll detection, which
    // is how Community ended up without any of them.
    expect(owner).toContain("MobileAppHeader");
    expect(owner).not.toContain("owner-sticky-action-bar");
    expect(owner).not.toContain("SocialModeSwitch");
    expect(owner).not.toContain("BrandLogo");
  });

  it("asks one file where it is and one file what the page is called", () => {
    const header = read("components/layouts/MobileAppHeader.tsx");

    expect(header).toContain('from "@/lib/appMode"');
    expect(header).toContain('from "@/lib/mobilePageTitle"');
    // No pathname pattern-matching of its own.
    expect(header).not.toMatch(/pathname\.startsWith\(/);
    expect(header).not.toMatch(/pathname === "/);
  });
});
