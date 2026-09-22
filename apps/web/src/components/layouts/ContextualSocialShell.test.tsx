// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signedIn: { current: null as boolean | null },
  pathname: "/u/tanfamily",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/useSignedIn", () => ({
  useSignedIn: () => mocks.signedIn.current,
}));

// The signed-in branch renders the whole owner shell, which loads pets and
// guards the session. Neither is what these tests are about.
vi.mock("@/components/layouts/AppLayout", () => ({
  AppLayout: ({ children, bleed }: { children: React.ReactNode; bleed?: boolean }) => (
    <div data-bleed={bleed ? "true" : "false"} data-testid="community-shell">
      {children}
    </div>
  ),
}));

import { SocialLayout } from "@/components/layouts/SocialLayout";

/**
 * Who is looking decides the chrome; the URL decides the content.
 *
 * `/u/{handle}` is a public, shareable address, and the page treated "public
 * URL" as "public UI": it rendered a bare `<main>` with no shell at all. A
 * signed-in member who tapped a household from Explore arrived somewhere with no
 * sidebar, no bottom bar, no mode switch and no way onward — a dead end inside
 * their own app. The content was never the problem, so the content does not
 * change: only what surrounds it.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

beforeEach(() => {
  mocks.signedIn.current = null;
  mocks.pathname = "/u/tanfamily";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a signed-in member", () => {
  beforeEach(() => {
    mocks.signedIn.current = true;
  });

  it("stays inside Community on somebody else's profile", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    expect(screen.getByTestId("community-shell")).toBeTruthy();
    expect(screen.queryByTestId("social-header-public")).toBeNull();
  });

  it("gets the same shell on a pet's public page, which paints its own canvas", () => {
    mocks.pathname = "/p/mochi-pubmochi";

    render(
      <SocialLayout bleed>
        <p>pet</p>
      </SocialLayout>
    );

    const shell = screen.getByTestId("community-shell");

    // Same navigation, no container: a pet page themes its whole background, and
    // boxed inside a padded column that gradient stops at the gutter.
    expect(shell.getAttribute("data-bleed")).toBe("true");
  });
});

describe("an anonymous visitor", () => {
  beforeEach(() => {
    mocks.signedIn.current = false;
  });

  it("gets the public header, never the member shell", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    expect(screen.getByTestId("social-header-public")).toBeTruthy();
    expect(screen.queryByTestId("community-shell")).toBeNull();
  });

  it("is offered a way in and a way to start", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    const header = screen.getByTestId("social-header-public");

    // A shared profile that offers only "sign in" is a microsite, so the header
    // also carries the action that starts an account. Whether it additionally
    // offers Explore and Search depends on the Community flag, which is the
    // subject of SocialLayoutVisitorShell.test.tsx — this build has it off, and
    // a Share Profile must work either way.
    expect(header.textContent).toContain("Sign in");
    expect(header.textContent).toMatch(/create free pet profile/i);
  });

  it("is offered no Community destination while Community is off", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    const header = screen.getByTestId("social-header-public");

    expect(header.querySelector('a[href="/explore"]')).toBeNull();
    expect(header.querySelector('a[href="/search"]')).toBeNull();
  });

  it("is shown no owner destination at all", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    const header = screen.getByTestId("social-header-public");

    for (const owned of ["/dashboard", "/pets", "/tags", "/orders", "/settings", "/notifications", "/community/profile"]) {
      expect(header.querySelector(`a[href="${owned}"]`)).toBeNull();
    }
  });
});

describe("while the session is still resolving", () => {
  it("commits to neither shell", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    // Showing a visitor owner navigation for a frame is a bug, and flashing
    // "Sign in" at somebody already signed in is the kind of small wrongness
    // that makes an app feel unfinished. A third header holds the space.
    expect(screen.getByTestId("social-header-resolving")).toBeTruthy();
    expect(screen.queryByTestId("social-header-public")).toBeNull();
    expect(screen.queryByTestId("community-shell")).toBeNull();
  });

  it("renders the page underneath either way", () => {
    render(
      <SocialLayout>
        <p>profile</p>
      </SocialLayout>
    );

    // The content is public. There is nothing to wait for.
    expect(screen.getByText("profile")).toBeTruthy();
  });
});

describe("the routes themselves", () => {
  it("send every public social page through the one shell", () => {
    for (const page of [
      "app/u/[handle]/page.tsx",
      "app/u/[handle]/followers/page.tsx",
      "app/u/[handle]/following/page.tsx",
      "app/p/[slug]/page.tsx",
    ]) {
      const source = read(page);

      expect(source).toContain("SocialLayout");
      expect(source).not.toContain("<main");
    }

    // A Moment's page already used it.
    expect(read("components/social/MomentDetailView.tsx")).toContain("SocialLayout");
  });

  it("never redirects a public profile to the owner's own one", () => {
    const source = read("app/u/[handle]/page.tsx");

    // `/u/{handle}` is the canonical public address. An owner may deliberately
    // want to see their own page the way a visitor does.
    expect(source).not.toContain("redirect");
    expect(source).not.toContain("community/profile");
  });

  it("keeps public metadata out of the session's hands", () => {
    const source = read("app/u/[handle]/page.tsx");
    const start = source.indexOf("export const metadata");
    const metadata = source.slice(start, source.indexOf("};", start));

    // The shell is a client concern. What a crawler reads is decided at build
    // time and rewritten at the edge, with no idea who is looking — so the page
    // stays a server component that pre-renders and exports its own metadata.
    expect(metadata).not.toContain("useSignedIn");
    expect(metadata).not.toContain("signedIn");
    expect(source).toContain("generateStaticParams");
    expect(source).not.toContain('"use client"');
  });
});
