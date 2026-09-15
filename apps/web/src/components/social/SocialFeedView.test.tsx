// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMomentPage } from "@/services/publicSocialService";
import type { SocialPetCard } from "@/services/socialDiscoveryService";

const mocks = vi.hoisted(() => ({
  getSocialFeed: vi.fn(),
  getSuggestedPets: vi.fn(),
  likeMoment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/feed",
}));

vi.mock("@/services/socialFeedService", () => ({
  getSocialFeed: (...args: unknown[]) => mocks.getSocialFeed(...args),
}));

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");

  return {
    ...actual,
    getSuggestedPets: (...args: unknown[]) => mocks.getSuggestedPets(...args),
  };
});

vi.mock("@/services/momentLikeService", () => ({
  likeMoment: (...args: unknown[]) => mocks.likeMoment(...args),
  unlikeMoment: vi.fn(),
}));

import { SocialFeedView } from "@/components/social/SocialFeedView";

function page(titles: string[], nextCursor: string | null = null): PublicMomentPage {
  return {
    items: titles.map((title, index) => ({
      id: `moment-${title}`,
      title,
      momentDate: null,
      publishedAt: `2026-09-0${index + 1}T00:00:00Z`,
      type: "Memory",
      caption: `${title} caption`,
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
        {
          name: "Coco",
          publicSlug: "coco-pubcoco",
          photoUrl: null,
          isPrimarySubject: false,
          lostModeEnabled: false,
        },
      ],
      media: [
        {
          id: `media-${title}`,
          type: "image" as const,
          url: "https://media.test/thumb.jpg",
          caption: null,
          altText: "Mochi and Coco",
          sortOrder: 0,
        },
      ],
      likeCount: 3,
      viewerHasLiked: false,
    })),
    nextCursor,
  };
}

function suggestion(name: string, handle: string): SocialPetCard {
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
  signIn();
  mocks.getSocialFeed.mockResolvedValue(page(["Beach day", "Nap time"]));
  mocks.getSuggestedPets.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("SocialFeedView", () => {
  it("shows the Moments the feed returned, newest first as given", async () => {
    render(<SocialFeedView />);

    const list = await screen.findByTestId("feed-list");
    const titles = within(list)
      .getAllByTestId("moment-title")
      .map((node) => node.textContent);

    expect(titles).toEqual(["Beach day", "Nap time"]);
  });

  it("leads each card with the pets and follows with the household", async () => {
    render(<SocialFeedView />);

    const card = (await screen.findAllByTestId("social-moment-card"))[0];
    const subjects = within(card).getByTestId("moment-subjects");
    const byline = within(card).getByTestId("moment-byline");

    expect(subjects.textContent).toContain("Mochi & Coco");
    expect(byline.textContent).toContain("The Tan Family");
    expect(byline.getAttribute("href")).toBe("/u/tanfamily");

    // The pets come first in the DOM, not just visually.
    expect(
      subjects.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("offers no comment control, because comments do not exist", async () => {
    render(<SocialFeedView />);

    await screen.findByTestId("feed-list");

    expect(screen.queryByText(/comment/i)).toBeNull();
  });

  it("likes a Moment in place", async () => {
    mocks.likeMoment.mockResolvedValue({
      momentId: "moment-Beach day",
      likeCount: 4,
      viewerHasLiked: true,
    });

    render(<SocialFeedView />);

    const buttons = await screen.findAllByTestId("like-button");
    fireEvent.click(buttons[0]);

    await waitFor(() =>
      expect(mocks.likeMoment).toHaveBeenCalledWith("moment-Beach day")
    );
    await waitFor(() =>
      expect(screen.getAllByTestId("like-count")[0].textContent).toBe("4")
    );
    expect(screen.getAllByTestId("like-count")[1].textContent).toBe("3");
  });

  it("pages with the cursor and keeps what is already on screen", async () => {
    mocks.getSocialFeed
      .mockResolvedValueOnce(page(["Beach day"], "cursor-2"))
      .mockResolvedValueOnce(page(["Nap time"]));

    render(<SocialFeedView />);

    fireEvent.click(await screen.findByRole("button", { name: /show more/i }));

    await waitFor(() =>
      expect(mocks.getSocialFeed).toHaveBeenLastCalledWith("cursor-2")
    );
    expect(await screen.findByText("Nap time")).toBeTruthy();
    expect(screen.getByText("Beach day")).toBeTruthy();
  });

  it("says when there is nothing further rather than looping forever", async () => {
    render(<SocialFeedView />);

    expect(await screen.findByTestId("feed-end")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /show more/i })).toBeNull();
  });

  it("gives a brand-new owner somewhere to start", async () => {
    mocks.getSocialFeed.mockResolvedValue({ items: [], nextCursor: null });

    render(<SocialFeedView />);

    const empty = await screen.findByTestId("feed-empty");

    expect(empty.textContent).toContain("Your feed starts with pets you care about");
    expect(
      within(empty).getByRole("link", { name: /explore pets/i }).getAttribute("href")
    ).toBe("/explore");
  });

  it("offers a retry instead of a dead screen when the feed fails", async () => {
    mocks.getSocialFeed.mockRejectedValueOnce(new Error("network"));

    render(<SocialFeedView />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByTestId("feed-list")).toBeTruthy();
  });

  it("keeps discovery in its own section below a short feed", async () => {
    mocks.getSocialFeed.mockResolvedValue(page(["Beach day"]));
    mocks.getSuggestedPets.mockResolvedValue([suggestion("Buddy", "limfamily")]);

    render(<SocialFeedView />);

    const suggestions = await screen.findByTestId("feed-suggestions");
    const feed = screen.getByTestId("feed-list");

    // Below the feed, with its own heading — never interleaved, so a reader can
    // always tell why something is in front of them.
    expect(within(suggestions).getByText("Meet more pets")).toBeTruthy();
    expect(within(suggestions).queryByTestId("social-moment-card")).toBeNull();
    expect(
      feed.compareDocumentPosition(suggestions) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("does not suggest anybody when the feed is already full", async () => {
    mocks.getSocialFeed.mockResolvedValue(
      page(["One", "Two", "Three", "Four", "Five"])
    );
    mocks.getSuggestedPets.mockResolvedValue([suggestion("Buddy", "limfamily")]);

    render(<SocialFeedView />);

    await screen.findByTestId("feed-list");

    expect(screen.queryByTestId("feed-suggestions")).toBeNull();
    expect(mocks.getSuggestedPets).not.toHaveBeenCalled();
  });

  it("never turns a failed suggestion load into a feed error", async () => {
    mocks.getSocialFeed.mockResolvedValue(page(["Beach day"]));
    mocks.getSuggestedPets.mockRejectedValue(new Error("network"));

    render(<SocialFeedView />);

    await screen.findByTestId("feed-list");

    expect(screen.queryByTestId("feed-error")).toBeNull();
    expect(screen.queryByTestId("feed-suggestions")).toBeNull();
  });
});
