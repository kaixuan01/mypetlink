// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { OwnerSocialProfile } from "@/services/ownerSocialService";

const mocks = vi.hoisted(() => ({
  getOwnerSocialProfile: vi.fn(),
  profileView: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/community/profile",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/services/ownerSocialService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/ownerSocialService")
  >("@/services/ownerSocialService");
  return {
    ...actual,
    getOwnerSocialProfile: (...args: unknown[]) => mocks.getOwnerSocialProfile(...args),
  };
});

// The real profile renderer is exercised by its own tests; here we only care
// that this route reaches it rather than re-implementing a second profile.
vi.mock("@/components/social/OwnerSocialProfileView", () => ({
  OwnerSocialProfileView: (props: { handle: string; audience?: string }) => {
    mocks.profileView(props);
    return <div data-testid="shared-profile-view">{props.audience}</div>;
  },
}));

import { CommunityMyProfileView } from "@/components/social/CommunityMyProfileView";
import { ownerRoutes } from "@/lib/routes";

const webRoot = join(__dirname, "..", "..", "..");
const source = (relative: string) =>
  readFileSync(join(webRoot, "src", relative), "utf8");

function profile(overrides: Partial<OwnerSocialProfile> = {}): OwnerSocialProfile {
  return {
    handle: "tanfamily",
    displayName: "The Tan Family",
    bio: "",
    avatarMediaId: "",
    avatarUrl: "",
    avatarThumbnailUrl: "",
    generalArea: "",
    isSocialEnabled: true,
    isDiscoverable: false,
    allowFollowers: true,
    canEnableSocial: true,
    missingRequirements: [],
    handleChangeAvailableAt: "",
    rowVersion: "rv-1",
    ...overrides,
  };
}

function respond(value: OwnerSocialProfile) {
  return { data: value, meta: { requestId: "t", source: "api" as const } };
}

/**
 * The owner's own profile, inside Community.
 *
 * "My profile" used to push the owner to the public /u/{handle} page, which
 * renders in a bare shell — no sidebar, no bottom bar. Opening your own profile
 * looked like leaving the product to view yourself from outside, and an owner
 * who had not set Social up was sent to Owner Settings in the other half of the
 * app entirely.
 */

beforeEach(() => {
  mocks.getOwnerSocialProfile.mockResolvedValue(respond(profile()));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Community My Profile", () => {
  it("renders the shared profile component, told the reader owns it", async () => {
    render(<CommunityMyProfileView />);

    await waitFor(() => expect(screen.getByTestId("shared-profile-view")).toBeTruthy());

    // One implementation, two audiences — never a second profile page.
    expect(mocks.profileView).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "tanfamily", audience: "own" })
    );
  });

  it("offers a setup state instead of a broken public link when no handle exists", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(respond(profile({ handle: "" })));

    render(<CommunityMyProfileView />);

    const setup = await screen.findByTestId("my-profile-setup");

    expect(setup.textContent).toContain("Set up your Community profile");
    expect(
      screen.getByRole("link", { name: /set up profile/i }).getAttribute("href")
    ).toBe(ownerRoutes.socialProfileEdit);

    // Never renders the public profile for somebody who has no handle, and
    // never sends them to Owner Settings to find the form.
    expect(screen.queryByTestId("shared-profile-view")).toBeNull();
  });

  it("says plainly when the profile exists but is switched off", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue(
      respond(profile({ isSocialEnabled: false }))
    );

    render(<CommunityMyProfileView />);

    const inactive = await screen.findByTestId("my-profile-inactive");

    expect(inactive.textContent).toContain("currently off");
    expect(inactive.textContent).toContain("@tanfamily");

    // Does not pretend the public page is live.
    expect(screen.queryByTestId("shared-profile-view")).toBeNull();
    expect(
      screen.getByRole("link", { name: /turn on my profile/i }).getAttribute("href")
    ).toBe(ownerRoutes.socialProfileEdit);
  });

  it("holds a modest skeleton rather than a full-page placeholder", async () => {
    let release: (value: unknown) => void = () => {};
    mocks.getOwnerSocialProfile.mockImplementation(
      () => new Promise((resolve) => { release = resolve; })
    );

    render(<CommunityMyProfileView />);

    const loading = screen.getByTestId("my-profile-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");

    release(respond(profile()));
    await waitFor(() => expect(screen.getByTestId("shared-profile-view")).toBeTruthy());
  });
});

describe("Community profile routing", () => {
  it("puts My Profile and its editor inside the Community shell", () => {
    expect(source("app/community/profile/page.tsx")).toContain("AppLayout");
    expect(source("app/community/profile/edit/page.tsx")).toContain("AppLayout");
  });

  it("leaves the public profile on its own bare shell", () => {
    const publicPage = source("app/u/[handle]/page.tsx");

    // A visitor must not receive owner navigation. The public route renders the
    // profile directly rather than through the authenticated shell.
    expect(publicPage).not.toContain("AppLayout");
    expect(publicPage).toContain("OwnerSocialProfileView");
  });

  it("navigates My Profile to the Community route, not the public one", () => {
    const actions = source("lib/useSocialActions.ts");

    expect(actions).toContain("ownerRoutes.socialProfile");
    // The old behaviour: resolve the handle, then push /u/{handle}.
    expect(actions).not.toContain("`/u/${handle");
  });

  it("keeps both Community profile routes in Community mode", async () => {
    const { getAppMode } = await import("@/lib/appMode");

    expect(getAppMode(ownerRoutes.socialProfile)).toBe("community");
    expect(getAppMode(ownerRoutes.socialProfileEdit)).toBe("community");
  });
});
