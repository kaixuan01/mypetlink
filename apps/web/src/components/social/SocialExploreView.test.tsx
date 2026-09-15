// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMomentPage } from "@/services/publicSocialService";
import type {
  SocialPetCard,
  SocialSpeciesOption,
} from "@/services/socialDiscoveryService";

const mocks = vi.hoisted(() => ({
  getSuggestedPets: vi.fn(),
  getExploreMoments: vi.fn(),
  getSocialSpecies: vi.fn(),
  followOwner: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
}));

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");

  return {
    ...actual,
    getSuggestedPets: (...args: unknown[]) => mocks.getSuggestedPets(...args),
    getExploreMoments: (...args: unknown[]) => mocks.getExploreMoments(...args),
    getSocialSpecies: (...args: unknown[]) => mocks.getSocialSpecies(...args),
  };
});

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    followOwner: (...args: unknown[]) => mocks.followOwner(...args),
  };
});

import { SocialExploreView } from "@/components/social/SocialExploreView";

function pet(name: string, handle: string, species = "Cat"): SocialPetCard {
  return {
    name,
    species,
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

const species: SocialSpeciesOption[] = [
  { species: "Cat", label: "Cats", petCount: 2 },
  { species: "Dog", label: "Dogs", petCount: 1 },
  { species: "Rabbit", label: "Rabbits", petCount: 1 },
];

function momentPage(titles: string[]): PublicMomentPage {
  return {
    items: titles.map((title) => ({
      id: `moment-${title}`,
      title,
      momentDate: null,
      publishedAt: "2026-09-01T00:00:00Z",
      type: "Memory",
      caption: null,
      author: {
        handle: "tanfamily",
        displayName: "The Tan Family",
        avatarUrl: null,
        avatarThumbnailUrl: null,
      },
      subjects: [
        {
          name: "Mochi",
          publicSlug: "mochi-pubmochi",
          photoUrl: null,
          isPrimarySubject: true,
          lostModeEnabled: false,
        },
      ],
      media: [],
      likeCount: 0,
      viewerHasLiked: false,
    })),
    nextCursor: null,
  };
}

function signIn() {
  window.localStorage.setItem(
    "mypetlink_api_auth_session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      user: { id: "viewer", email: "viewer@example.com" },
    })
  );
}

beforeEach(() => {
  mocks.getSocialSpecies.mockResolvedValue(species);
  mocks.getSuggestedPets.mockResolvedValue([
    pet("Mochi", "tanfamily"),
    pet("Buddy", "limfamily", "Dog"),
  ]);
  mocks.getExploreMoments.mockResolvedValue(momentPage(["Beach day"]));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("SocialExploreView", () => {
  it("leads with pets", async () => {
    render(<SocialExploreView />);

    const pets = await screen.findByTestId("explore-pets");

    expect(within(pets).getByText("Mochi")).toBeTruthy();
    expect(within(pets).getByText("Buddy")).toBeTruthy();
  });

  it("says whose handle the Follow button acts on", async () => {
    signIn();

    render(<SocialExploreView />);

    const cards = await screen.findAllByTestId("social-pet-card");
    const follow = within(cards[0]).getByTestId("follow-button");

    // Nobody should be able to read this card and think they followed the pet.
    expect(follow.textContent).toBe("Follow @tanfamily");
    expect(within(cards[0]).getByText("@tanfamily")).toBeTruthy();
  });

  it("shows no follower count on a pet", async () => {
    render(<SocialExploreView />);

    const pets = await screen.findByTestId("explore-pets");

    expect(within(pets).queryByText(/follower/i)).toBeNull();
  });

  it("calls itself Suggested pets, not For you", async () => {
    render(<SocialExploreView />);

    await screen.findByTestId("explore-pets");

    // Nothing here is personalised, so nothing here may claim to be.
    expect(screen.getByText("Suggested pets")).toBeTruthy();
    expect(screen.queryByText(/for you/i)).toBeNull();
  });

  it("offers the species the data actually has", async () => {
    render(<SocialExploreView />);

    const filter = await screen.findByTestId("explore-species");

    expect(within(filter).getByText("All")).toBeTruthy();
    expect(within(filter).getByText("Cats")).toBeTruthy();
    expect(within(filter).getByText("Rabbits")).toBeTruthy();
  });

  it("narrows both sections when a species is chosen", async () => {
    render(<SocialExploreView />);

    fireEvent.click(await screen.findByRole("button", { name: "Dogs" }));

    await waitFor(() =>
      expect(mocks.getSuggestedPets).toHaveBeenLastCalledWith("Dog")
    );
    await waitFor(() =>
      expect(mocks.getExploreMoments).toHaveBeenLastCalledWith("Dog", undefined)
    );
  });

  it("follows a household from a pet card and updates only that card", async () => {
    signIn();
    mocks.followOwner.mockResolvedValue({
      isSelf: false,
      isFollowing: true,
      isFollowedBy: false,
      hasBlocked: false,
      canFollow: true,
      allowsFollowers: true,
      followerCount: 1,
      followingCount: 0,
    });

    render(<SocialExploreView />);

    const buttons = await screen.findAllByTestId("follow-button");
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(mocks.followOwner).toHaveBeenCalledWith("tanfamily"));
    await waitFor(() => expect(buttons[0].textContent).toBe("Following"));
    expect(buttons[1].textContent).toBe("Follow @limfamily");
  });

  it("shows the newest Moments with their household named", async () => {
    render(<SocialExploreView />);

    const tile = (await screen.findAllByTestId("social-moment-tile"))[0];

    // Explore mixes households, so each tile has to say whose it is.
    expect(within(tile).getByTestId("moment-byline").textContent).toContain(
      "The Tan Family"
    );
  });

  it("lets a signed-out visitor browse without offering actions that cannot work", async () => {
    render(<SocialExploreView />);

    await screen.findByTestId("explore-pets");

    // Waited for rather than asserted immediately: the signed-in check settles
    // in an effect, and until it does the control is inert rather than wrong.
    const signInLinks = await screen.findAllByTestId("follow-button-signin");

    expect(signInLinks.length).toBeGreaterThan(0);
    expect(screen.queryByTestId("follow-button")).toBeNull();
  });

  it("offers a retry when the Moments fail without losing the pets", async () => {
    mocks.getExploreMoments.mockRejectedValueOnce(new Error("network"));

    render(<SocialExploreView />);

    expect(await screen.findByTestId("explore-moments-error")).toBeTruthy();
    expect(screen.getByTestId("explore-pets")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByTestId("social-moment-tile")).toBeTruthy();
  });

  it("says plainly when a filter has nothing behind it", async () => {
    mocks.getSuggestedPets.mockResolvedValue([]);

    render(<SocialExploreView />);

    expect(await screen.findByTestId("explore-pets-empty")).toBeTruthy();
  });

  it("still works when the species list cannot be read", async () => {
    mocks.getSocialSpecies.mockRejectedValue(new Error("network"));

    render(<SocialExploreView />);

    expect(await screen.findByTestId("explore-pets")).toBeTruthy();
    expect(screen.queryByTestId("explore-species")).toBeNull();
  });
});
