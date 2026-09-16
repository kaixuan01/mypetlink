// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMomentPage } from "@/services/publicSocialService";

const mocks = vi.hoisted(() => ({
  getSocialFeed: vi.fn(),
  getSuggestedPets: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));

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
  likeMoment: vi.fn(),
  unlikeMoment: vi.fn(),
}));

vi.mock("@/lib/analytics", async () => {
  const actual = await vi.importActual<typeof import("@/lib/analytics")>(
    "@/lib/analytics"
  );
  return { ...actual, trackEvent: (...args: unknown[]) => mocks.trackEvent(...args) };
});

import { SocialFeedView } from "@/components/social/SocialFeedView";

/**
 * How the feed grows.
 *
 * The backend already pages properly — fifteen Moments, clamped at thirty, over
 * an opaque cursor ordered by PublishedAt then Id — so none of this is about
 * changing what the server does. It is about the client never asking for the
 * whole history, never asking for the same page twice, and never losing what a
 * reader already has because one request failed.
 *
 * jsdom has no IntersectionObserver and no layout, so automatic loading cannot
 * be observed here: a stub stands in for the browser's part and the button
 * drives the same single-flight loader the observer calls. The scroll behaviour
 * itself is verified in a real browser and recorded separately.
 */

function moment(id: string, title: string) {
  return {
    id,
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
  };
}

function page(ids: string[], nextCursor: string | null = null): PublicMomentPage {
  return {
    items: ids.map((id) => moment(id, `Moment ${id}`)),
    nextCursor,
  } as PublicMomentPage;
}

function signIn() {
  window.localStorage.setItem(
    "mypetlink_api_auth_session",
    JSON.stringify({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 600_000,
      user: { id: "u", email: "o@example.com", displayName: "Owner", roles: [], status: "Active" },
    })
  );
}

function cards() {
  return screen.queryAllByTestId("social-moment-card");
}

async function showMore() {
  const button = await screen.findByRole("button", { name: /show more moments/i });
  fireEvent.click(button);
  return button;
}

beforeEach(() => {
  window.localStorage.clear();
  signIn();
  mocks.getSuggestedPets.mockResolvedValue({ items: [] });
  mocks.trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("feed paging", () => {
  it("loads one bounded first page, not the whole history", async () => {
    mocks.getSocialFeed.mockResolvedValue(page(["a", "b", "c"], "cursor-2"));

    render(<SocialFeedView />);

    await waitFor(() => expect(cards().length).toBe(3));

    // One request, and it asked for the first page — no cursor.
    expect(mocks.getSocialFeed).toHaveBeenCalledTimes(1);
    expect(mocks.getSocialFeed).toHaveBeenCalledWith(undefined);
  });

  it("loads the next page by cursor and appends it", async () => {
    mocks.getSocialFeed
      .mockResolvedValueOnce(page(["a", "b"], "cursor-2"))
      .mockResolvedValueOnce(page(["c", "d"], null));

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(2));

    await showMore();

    await waitFor(() => expect(cards().length).toBe(4));
    expect(mocks.getSocialFeed).toHaveBeenLastCalledWith("cursor-2");
  });

  it("does not request the next page twice while one is in flight", async () => {
    let release: (value: PublicMomentPage) => void = () => {};
    mocks.getSocialFeed
      .mockResolvedValueOnce(page(["a"], "cursor-2"))
      .mockImplementationOnce(
        () => new Promise<PublicMomentPage>((resolve) => { release = resolve; })
      );

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(1));

    const button = await showMore();
    // Every extra press — or every extra intersection — while the first is
    // still open must be ignored, or the same cursor is spent repeatedly.
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.getSocialFeed).toHaveBeenCalledTimes(2);

    release(page(["b"], null));
    await waitFor(() => expect(cards().length).toBe(2));
  });

  it("stops when the cursor is null, not when a page is short", async () => {
    // A single short page with no cursor is the end. A short page WITH a cursor
    // is not, and must still offer more.
    mocks.getSocialFeed.mockResolvedValue(page(["a"], null));

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(1));

    expect(screen.queryByRole("button", { name: /show more moments/i })).toBeNull();
    expect(screen.getByTestId("feed-end")).toBeTruthy();
  });

  it("keeps offering more while the server still returns a cursor", async () => {
    mocks.getSocialFeed.mockResolvedValue(page(["a"], "cursor-2"));

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(1));

    expect(
      await screen.findByRole("button", { name: /show more moments/i })
    ).toBeTruthy();
    expect(screen.queryByTestId("feed-end")).toBeNull();
  });

  it("preserves what is already on screen when a further page fails", async () => {
    mocks.getSocialFeed
      .mockResolvedValueOnce(page(["a", "b"], "cursor-2"))
      .mockRejectedValueOnce(new Error("network"));

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(2));

    await showMore();

    // Somebody reading on a train must not lose the feed to one dropped
    // request.
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(cards().length).toBe(2);

    // And it can be retried with the same cursor rather than starting over.
    mocks.getSocialFeed.mockResolvedValueOnce(page(["c"], null));
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => expect(cards().length).toBe(3));
    expect(mocks.getSocialFeed).toHaveBeenLastCalledWith("cursor-2");
  });

  it("does not duplicate Moments that appear in two cursor pages", async () => {
    // A Moment published between the two requests shifts the window, so the
    // server can legitimately return one the client already has.
    mocks.getSocialFeed
      .mockResolvedValueOnce(page(["a", "b"], "cursor-2"))
      .mockResolvedValueOnce(page(["b", "c"], null));

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(2));

    await showMore();

    await waitFor(() => expect(cards().length).toBe(3));
  });

  it("counts the screen opening once, however many pages are read", async () => {
    mocks.getSocialFeed
      .mockResolvedValueOnce(page(["a"], "cursor-2"))
      .mockResolvedValueOnce(page(["b"], "cursor-3"))
      .mockResolvedValueOnce(page(["c"], null));

    render(<SocialFeedView />);
    await waitFor(() => expect(cards().length).toBe(1));

    await showMore();
    await waitFor(() => expect(cards().length).toBe(2));
    await showMore();
    await waitFor(() => expect(cards().length).toBe(3));

    const viewed = mocks.trackEvent.mock.calls.filter(
      ([name]) => name === "social_feed_viewed"
    );
    const pages = mocks.trackEvent.mock.calls.filter(
      ([name]) => name === "social_feed_page_loaded"
    );

    // Scrolling is not re-opening the feed. One "viewed", one "page loaded"
    // per further cursor page — the first page is counted by "viewed" and
    // never twice.
    expect(viewed).toHaveLength(1);
    expect(pages).toHaveLength(2);
  });
});
