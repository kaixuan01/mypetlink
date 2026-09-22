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

  it("names the household the Follow button acts on, right above it", async () => {
    signIn();

    render(<SocialExploreView />);

    const cards = await screen.findAllByTestId("social-pet-card");
    const follow = within(cards[0]).getByTestId("follow-button");

    // Two cards to a row on a small phone is narrower than a long handle on a
    // button, so the handle is stated in full on its own line and the button
    // sits directly beneath it. The pairing is what makes the target
    // unambiguous — nobody should read this card and think they followed Mochi.
    expect(follow.textContent).toBe("Follow");
    expect(within(cards[0]).getByText("@tanfamily")).toBeTruthy();
    expect(within(cards[0]).getByText(/Shared by/)).toBeTruthy();
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

  it("offers one selector rather than a chip for every species", async () => {
    render(<SocialExploreView />);

    const trigger = await screen.findByTestId("species-filter-trigger");

    // Closed, the filter is one control saying what is currently shown — not a
    // row that grows a chip every time the product supports another animal.
    expect(trigger.textContent).toContain("All pets");
    expect(screen.queryByText("Cats")).toBeNull();
    expect(screen.queryByText("Rabbits")).toBeNull();
  });

  it("lists the species the data actually has, from the catalogue", async () => {
    render(<SocialExploreView />);

    fireEvent.click(await screen.findByTestId("species-filter-trigger"));

    const panel = await screen.findByTestId("species-filter-panel");

    // The labels come from the species endpoint, which derives them from
    // discoverable pets. Nothing here is a hardcoded Dogs-and-Cats pair.
    expect(within(panel).getByText("All pets")).toBeTruthy();
    expect(within(panel).getByText("Cats")).toBeTruthy();
    expect(within(panel).getByText("Dogs")).toBeTruthy();
    expect(within(panel).getByText("Rabbits")).toBeTruthy();
  });

  it("narrows both sections when a species is chosen", async () => {
    render(<SocialExploreView />);

    fireEvent.click(await screen.findByTestId("species-filter-trigger"));
    fireEvent.click(await screen.findByRole("option", { name: /Dogs/ }));

    await waitFor(() =>
      expect(mocks.getSuggestedPets).toHaveBeenLastCalledWith("Dog")
    );
    await waitFor(() =>
      expect(mocks.getExploreMoments).toHaveBeenLastCalledWith("Dog", undefined)
    );

    // A single-select filter needs no Apply: choosing is the whole decision,
    // so the panel closes and the trigger says what was chosen.
    expect(screen.queryByTestId("species-filter-panel")).toBeNull();
    expect(screen.getByTestId("species-filter-trigger").textContent).toContain(
      "Dogs"
    );
  });

  it("goes back to everything when All pets is chosen again", async () => {
    render(<SocialExploreView />);

    fireEvent.click(await screen.findByTestId("species-filter-trigger"));
    fireEvent.click(await screen.findByRole("option", { name: /Dogs/ }));
    await waitFor(() =>
      expect(mocks.getSuggestedPets).toHaveBeenLastCalledWith("Dog")
    );

    fireEvent.click(screen.getByTestId("species-filter-trigger"));
    fireEvent.click(await screen.findByRole("option", { name: /All pets/ }));

    // "all" is what the service treats as no filter, and it must reach both
    // sections — a cleared filter that only clears one is worse than no filter.
    await waitFor(() =>
      expect(mocks.getSuggestedPets).toHaveBeenLastCalledWith("all")
    );
    await waitFor(() =>
      expect(mocks.getExploreMoments).toHaveBeenLastCalledWith("all", undefined)
    );
  });

  it("opens search over Explore instead of sending somebody to a page", async () => {
    render(<SocialExploreView />);

    const trigger = await screen.findByTestId("explore-search-trigger");
    fireEvent.click(trigger);

    // The same search component the /search route renders, in a dialog.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("social-search-dialog")).toBeTruthy();
    expect(
      within(dialog).getByLabelText("Search pets or pet parents")
    ).toBeTruthy();

    // Explore is still underneath — searching did not navigate away from it.
    expect(screen.getByTestId("explore-pets")).toBeTruthy();
  });

  it("closes search on Escape and gives focus back to the trigger", async () => {
    render(<SocialExploreView />);

    const trigger = await screen.findByTestId("explore-search-trigger");
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");

    // Focus moves into the dialog, which is the half of the contract jsdom can
    // speak to. Where it lands when the dialog closes is the browser's business
    // — jsdom has an `inert` attribute but no inertness — so focus return is
    // verified against a real browser rather than asserted here.
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
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

    // The signed-in check settles in an effect, and the control is deliberately
    // inert until it does — clicking before then is the test racing the page,
    // not the page failing to follow.
    await waitFor(() =>
      expect((buttons[0] as HTMLButtonElement).disabled).toBe(false)
    );

    fireEvent.click(buttons[0]);

    await waitFor(() => expect(mocks.followOwner).toHaveBeenCalledWith("tanfamily"));
    await waitFor(() => expect(buttons[0].textContent).toBe("Following"));
    expect(buttons[1].textContent).toBe("Follow");
  });

  it("shows the newest Moments with their household named", async () => {
    render(<SocialExploreView />);

    const card = (await screen.findAllByTestId("social-moment-card"))[0];

    // Explore mixes households, so every card has to say whose Moment it is.
    expect(within(card).getByTestId("moment-byline").textContent).toContain(
      "@tanfamily"
    );

    // And when it was published, which the tile it replaces never said at all.
    expect(within(card).getByTestId("moment-age").tagName).toBe("TIME");
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

    expect(await screen.findByTestId("social-moment-card")).toBeTruthy();
  });

  it("says plainly when a filter has nothing behind it", async () => {
    mocks.getSuggestedPets.mockResolvedValue([]);

    render(<SocialExploreView />);

    expect(await screen.findByTestId("explore-pets-empty")).toBeTruthy();
  });

  it("does not report a failed suggestion request as an empty filter", async () => {
    // A failed request used to set an empty list and mark it loaded, so the
    // section read "No pets to show here yet. Try another pet type." - which
    // states there are no pets, and sends the reader to change a filter that
    // was never the problem.
    mocks.getSuggestedPets.mockRejectedValue(new Error("network"));

    render(<SocialExploreView />);

    const failed = await screen.findByTestId("explore-pets-error");

    expect(failed.textContent).toMatch(/couldn.t load suggestions/i);
    expect(screen.queryByTestId("explore-pets-empty")).toBeNull();
    expect(
      within(failed).getByRole("button", { name: "Try again" })
    ).toBeTruthy();
  });

  it("retries the suggestions when the visitor asks", async () => {
    mocks.getSuggestedPets.mockRejectedValueOnce(new Error("network"));

    render(<SocialExploreView />);

    const failed = await screen.findByTestId("explore-pets-error");
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));

    // Resolves from the default mock configured in beforeEach.
    expect(await screen.findByTestId("explore-pets")).toBeTruthy();
    expect(screen.queryByTestId("explore-pets-error")).toBeNull();
  });

  it("still works when the species list cannot be read", async () => {
    mocks.getSocialSpecies.mockRejectedValue(new Error("network"));

    render(<SocialExploreView />);

    expect(await screen.findByTestId("explore-pets")).toBeTruthy();

    // The selector still stands, offering the one choice that always applies.
    const trigger = screen.getByTestId("species-filter-trigger");
    expect(trigger.textContent).toContain("All pets");

    fireEvent.click(trigger);
    const panel = await screen.findByTestId("species-filter-panel");
    expect(within(panel).getAllByRole("option")).toHaveLength(1);
  });
});
