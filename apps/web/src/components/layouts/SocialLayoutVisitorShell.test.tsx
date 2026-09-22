// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signedIn: false as boolean | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/p/mochi-pub123",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/useSignedIn", () => ({
  useSignedIn: () => mocks.signedIn,
}));

/**
 * The chrome a visitor gets above somebody's Share Profile.
 *
 * This header sits over `/p/{slug}-{publicCode}` — the page owners actually
 * send to people — and it was offering Explore and Search in builds where every
 * other surface had correctly hidden Community and `/community/profile` told
 * owners the community was not open yet. A Share Profile is not a Community
 * surface: it is one owner sharing one pet, and it has to work, and be shared,
 * with Community switched off.
 *
 * So the two Community links follow `socialEnabled` like every other entry
 * point, and the rest of the header — brand, sign in, get started — does not,
 * because none of it is Community.
 */

async function renderShell(socialEnabled: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/features", async () => {
    const actual = await vi.importActual<typeof import("@/lib/features")>(
      "@/lib/features"
    );

    return {
      ...actual,
      socialEnabled,
      ownerProductFeatures: { ...actual.ownerProductFeatures, socialEnabled },
    };
  });

  const { SocialLayout } = await import("./SocialLayout");

  return render(
    <SocialLayout>
      <p>Somebody&rsquo;s pet</p>
    </SocialLayout>
  );
}

beforeEach(() => {
  mocks.signedIn = false;
});

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/features");
  vi.resetModules();
});

describe("visitor shell with Community on", () => {
  it("offers Explore and Search", async () => {
    await renderShell(true);

    expect(screen.getByTestId("social-header-public")).toBeTruthy();
    expect(screen.getByTestId("social-header-explore")).toBeTruthy();
    expect(screen.getByTestId("social-header-search")).toBeTruthy();
  });
});

describe("visitor shell with Community off", () => {
  it("offers no Community destination at all", async () => {
    await renderShell(false);

    expect(screen.getByTestId("social-header-public")).toBeTruthy();
    expect(screen.queryByTestId("social-header-explore")).toBeNull();
    expect(screen.queryByTestId("social-header-search")).toBeNull();
  });

  it("links to no Community route from anywhere in the shell", async () => {
    const { container } = await renderShell(false);

    const communityRoutes = ["/explore", "/search", "/feed", "/notifications", "/community"];
    const offenders = [...container.querySelectorAll("a[href]")]
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) =>
        communityRoutes.some(
          (route) => href === route || href.startsWith(`${route}/`) || href.startsWith(`${route}?`)
        )
      );

    expect(offenders).toEqual([]);
  });

  it("still gives the visitor the brand, a way in and a way to start", async () => {
    await renderShell(false);

    // The page itself is unaffected: a Share Profile is not a Community page.
    expect(screen.getByText("Somebody’s pet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /get started/i })).toBeTruthy();
  });

  it("sends sign-in back to the page being read, never to a Community route", async () => {
    await renderShell(false);

    const href = screen.getByRole("link", { name: "Sign in" }).getAttribute("href");

    expect(href).toBe(`/login?redirect=${encodeURIComponent("/p/mochi-pub123")}`);
  });
});

describe("visitor shell while the session is still resolving", () => {
  it("commits to neither shell", async () => {
    mocks.signedIn = null;
    await renderShell(true);

    expect(screen.getByTestId("social-header-resolving")).toBeTruthy();
    expect(screen.queryByTestId("social-header-public")).toBeNull();
  });
});
