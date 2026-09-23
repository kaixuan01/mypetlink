// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SocialPetCard,
  SocialSpeciesOption,
} from "@/services/socialDiscoveryService";

const mocks = vi.hoisted(() => ({
  getSuggestedPets: vi.fn(),
  getExploreMoments: vi.fn(),
  getSocialSpecies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");

  return {
    ...actual,
    getSuggestedPets: (...a: unknown[]) => mocks.getSuggestedPets(...a),
    getExploreMoments: (...a: unknown[]) => mocks.getExploreMoments(...a),
    getSocialSpecies: (...a: unknown[]) => mocks.getSocialSpecies(...a),
  };
});

const { SocialExploreView } = await import(
  "@/components/social/SocialExploreView"
);

/**
 * What a visitor without an account can and cannot do.
 *
 * Browsing is free; anything that would attach an identity to something asks
 * you to sign in first, and signing in returns you to what you were looking at
 * without having done it on your behalf.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

const species: SocialSpeciesOption[] = [
  { species: "Cat", label: "Cats", petCount: 2 },
  { species: "Dog", label: "Dogs", petCount: 1 },
];

function pet(name: string, handle: string): SocialPetCard {
  return {
    name,
    species: "Cat",
    customSpecies: null,
    breed: "British Shorthair",
    publicSlug: `${name.toLowerCase()}-pub${name.toLowerCase()}`,
    photoThumbnailUrl: null,
    lostModeEnabled: false,
    owner: {
      handle,
      displayName: `The ${handle} Family`,
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    viewerFollowsOwner: false,
  };
}

beforeEach(() => {
  window.history.replaceState({}, "", "/explore?source=c5");
  window.localStorage.clear();
  mocks.getSocialSpecies.mockResolvedValue(species);
  mocks.getSuggestedPets.mockResolvedValue([pet("Mochi", "tanfamily")]);
  mocks.getExploreMoments.mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Explore without an account", () => {
  it("browses without a login wall", async () => {
    render(<SocialExploreView />);

    // Pets, the filter and the search tool are all available to a stranger.
    expect(await screen.findByTestId("explore-pets")).toBeTruthy();
    expect(screen.getByTestId("species-filter-trigger")).toBeTruthy();
    expect(screen.getByTestId("explore-search-trigger")).toBeTruthy();

    // Nothing asks them to sign in before looking.
    expect(screen.queryByText(/sign in to (browse|continue|view)/i)).toBeNull();
    expect(screen.queryByText(/create an account to see/i)).toBeNull();
  });

  it("still fetches discovery data anonymously", async () => {
    render(<SocialExploreView />);

    await waitFor(() => expect(mocks.getSuggestedPets).toHaveBeenCalled());
    expect(mocks.getExploreMoments).toHaveBeenCalled();
  });
});

describe("discoverability is not marketing consent", () => {
  it("still shows real discoverable pets in Explore", async () => {
    render(<SocialExploreView />);

    // The other half of the boundary. Fixing the homepage must not quietly
    // narrow Community: a family who switched Social on still appears here,
    // which is the permission they actually gave.
    const list = await screen.findByTestId("explore-pets");

    expect(within(list).getByText("Mochi")).toBeTruthy();
    expect(list.textContent).toContain("@tanfamily");
    await waitFor(() => expect(mocks.getSuggestedPets).toHaveBeenCalled());
  });

  it("keeps Search on the same real discoverability rules", () => {
    const search = read("components/social/SocialSearchExperience.tsx");

    // Search asks the discovery API and applies no marketing filter of its own.
    expect(search).toContain("searchSocial");
    expect(search).not.toContain("IsSampleEligible");
    expect(search).not.toContain("communityPreview");
  });

  it("keeps the two decisions in different places entirely", () => {
    // The landing teaser cannot consult a discoverability flag, and the
    // discovery surfaces cannot consult the marketing list. Neither can drift
    // into the other by accident.
    const teaser = read("data/communityPreview.ts");
    const explore = read("components/social/SocialExploreView.tsx");

    expect(teaser).not.toContain("Discoverable");
    expect(explore).not.toContain("communityPreview");
    expect(explore).not.toContain("IsSampleEligible");
  });
});

describe("identity actions, for a visitor with no account", () => {
  it("offers Follow as a sign-in that returns to the current Community surface", async () => {
    render(<SocialExploreView />);

    const signIn = (await screen.findAllByTestId("follow-button-signin"))[0];
    const href = signIn.getAttribute("href") ?? "";

    // Sign in, then come back to the discovery context being used.
    expect(href.startsWith("/login?redirect=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("/explore?source=c5");
  });

  it("never follows or likes as a side effect of signing in", () => {
    // Authenticating is not consent to a social relationship. There is no
    // pending-action store, nothing replays on login, and the login screen
    // knows nothing about Follow or Like.
    const follow = read("components/social/FollowButton.tsx");
    const like = read("components/social/LikeButton.tsx");

    for (const source of [follow, like]) {
      expect(source).not.toContain("pendingAction");
      expect(source).not.toContain("resumeAfterLogin");
      expect(source).not.toContain("replayAction");
    }

    const login = read("lib/authRedirect.ts");
    expect(login).not.toContain("followOwner");
    expect(login).not.toContain("likeMoment");
    expect(login).not.toContain("action");
  });

  it("returns only to a safe local address", () => {
    // The return URL is attacker-reachable, so it is validated rather than
    // trusted: absolute URLs, protocol-relative ones and control characters are
    // all refused, and an unsafe value falls back to the dashboard.
    const source = read("lib/authRedirect.ts");

    expect(source).toContain("isSafeLocalRedirect");
    expect(source).toContain('decoded.startsWith("//")');
    expect(source).toContain("ownerRoutes.dashboard");
  });
});

describe("sharing a public link", () => {
  it("needs no account", () => {
    // Copying a URL that anybody can already open is not an identity action,
    // and gating it would only stop people passing the product along.
    const shareButton = read("components/social/MomentShareButton.tsx");

    expect(shareButton).not.toContain("signedIn");
    expect(shareButton).not.toContain("ownerLoginPath");

    // And the Moment page renders it unconditionally.
    const detail = read("components/social/MomentDetailView.tsx");
    expect(detail).toContain("<MomentShareButton");
    expect(detail).not.toMatch(/signedIn[\s\S]{0,40}<MomentShareButton/);
  });
});

describe("what search engines are told", () => {
  it("lists Explore, and only Explore, from Community", () => {
    const seo = read("lib/seo.ts");

    expect(seo).toContain("socialRoutes.explore");
    // The doorway is listed; the families behind it are not.
    expect(seo).not.toContain("ownerSocialProfilePath");
    expect(seo).not.toContain("socialRoutes.search");
    expect(seo).not.toContain("momentPath");
  });

  it("describes Explore as a public destination", () => {
    const page = read("app/explore/page.tsx");

    // Canonical, title and description through the same helper every other
    // public page uses — which is also what makes it indexable.
    expect(page).toContain("createMarketingMetadata");
    expect(page).toContain("socialRoutes.explore");
  });

  it("keeps Search out of the index", () => {
    expect(read("app/search/page.tsx")).toContain("robots: { index: false");
  });

  it("keeps individual households and Moments out of the index", () => {
    // Being discoverable inside Community is not the same as asking to appear
    // in a search engine. That would be a separate, explicit choice.
    for (const page of [
      "app/u/[handle]/page.tsx",
      "app/moments/[momentId]/page.tsx",
    ]) {
      expect(read(page)).toContain("index: false");
    }
  });

  it("leaves the public pet profile's existing policy alone", () => {
    // Only the one sample pet is indexable, and that predates this work.
    const seo = read("lib/seo.ts");

    expect(seo).toContain("isSearchIndexableSample");
    expect(seo).toContain("samplePet.publicProfilePath");
  });
});

describe("Safety is not a social surface", () => {
  it("has no Community anywhere in the finder journey", () => {
    for (const source of [
      "components/marketing/QrSafetyPageView.tsx",
      "components/marketing/QrSafetyRouteView.tsx",
    ]) {
      const text = read(source);

      expect(text).not.toContain("socialRoutes");
      expect(text).not.toContain("/explore");
      expect(text).not.toMatch(/\bCommunity\b/);
    }
  });

  it("keeps the scan routes pointing at the Safety Profile", () => {
    // A tag scan is somebody holding a lost animal. It goes to contact details,
    // never to a social page, and nothing in this change touched that.
    const routes = read("lib/routes.ts");

    // /q is built by qrSafetyPath and nothing in Community reroutes it.
    expect(routes).toContain("qrSafetyPath");
    expect(routes).toMatch(/`\/q\//);
  });
});
