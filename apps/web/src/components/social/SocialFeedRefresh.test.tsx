// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announceMomentCreated } from "@/lib/momentChanges";

/**
 * Sharing a Moment, as Home shows it — from the announcement to the cards.
 *
 * Nothing between the page and the network is replaced except `apiRequest`:
 * the feed view, `useMomentPages`, `getSocialFeed` and its URL are the real
 * ones. The stand-in API pages the way the real one does — ordered by a server
 * key, strictly after an opaque cursor — so a client that guessed an order,
 * dropped an announcement or kept a stale cursor fails here, where it would
 * fail for a reader.
 */

type Row = { id: string; rank: number; visible: boolean };

const server = vi.hoisted(() => ({
  rows: [] as Row[],
  pageSize: 2,
  hold: null as null | { resolve: () => void; promise: Promise<void> },
  paths: [] as string[],
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/feed" }));

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>(
    "@/services/apiClient"
  );
  return { ...actual, apiRequest: (path: string) => respond(path) };
});

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");
  return { ...actual, getSuggestedPets: async () => [] };
});

vi.mock("@/services/momentLikeService", () => ({
  likeMoment: vi.fn(),
  unlikeMoment: vi.fn(),
}));

import { SocialFeedView } from "@/components/social/SocialFeedView";

async function respond(path: string) {
  server.paths.push(path);
  const url = new URL(path, "http://api.test");
  if (url.pathname !== "/api/v1/social/feed") throw new Error(`unexpected ${path}`);

  // What the server would say *now*, even if the answer is delivered later.
  const cursor = url.searchParams.get("cursor");
  const after = cursor === null ? Infinity : Number(cursor);
  const remaining = server.rows
    .filter((row) => row.visible && row.rank < after)
    .sort((a, b) => b.rank - a.rank);
  const page = remaining.slice(0, server.pageSize);
  const data = {
    items: page.map((row) => moment(row.id)),
    nextCursor: remaining.length > server.pageSize ? String(page[page.length - 1].rank) : null,
    hasFollowing: true,
  };

  const hold = server.hold;
  if (hold) {
    server.hold = null;
    await hold.promise;
  }
  return { data };
}

function moment(id: string) {
  return {
    id,
    title: `Moment [${id}]`,
    momentDate: null,
    publishedAt: "2026-09-01T00:00:00Z",
    type: "Memory",
    caption: null,
    author: { handle: "tanfamily", displayName: "The Tan Family", avatarUrl: null, avatarThumbnailUrl: null },
    subjects: [],
    media: [],
    likeCount: 0,
    commentCount: 0,
    viewerHasLiked: false,
  };
}

function add(id: string, rank: number, visible = true) {
  server.rows.push({ id, rank, visible });
}

function holdNextAnswer() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  server.hold = { resolve, promise };
  return resolve;
}

function renderedIds() {
  return screen
    .queryAllByTestId("social-moment-card")
    .map((card) => /Moment \[([\w-]+)\]/.exec(card.textContent ?? "")?.[1]);
}

function serverOrder() {
  return server.rows
    .filter((row) => row.visible)
    .sort((a, b) => b.rank - a.rank)
    .map((row) => row.id);
}

async function showEverything() {
  for (let guard = 0; guard < 20; guard += 1) {
    const button = screen.queryByRole("button", { name: /show more moments/i });
    if (!button) return;
    const before = renderedIds().length;
    fireEvent.click(button);
    await waitFor(() => expect(renderedIds().length).toBeGreaterThan(before));
  }
}

beforeEach(() => {
  server.rows = [];
  server.paths = [];
  server.hold = null;
  window.localStorage.setItem(
    "mypetlink_api_auth_session",
    JSON.stringify({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 600_000,
      user: { id: "u", email: "o@example.com", displayName: "Owner", roles: [], status: "Active" },
    })
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Home after Share a Moment", () => {
  it("shows a Moment shared while the feed was still loading, then pages on in order", async () => {
    add("m1", 1);
    add("m2", 2);
    add("m3", 3);
    const release = holdNextAnswer();

    render(<SocialFeedView />);
    await waitFor(() => expect(server.paths).toEqual(["/api/v1/social/feed"]));

    // The first answer was decided before the Moment existed.
    add("shared", 10);
    act(() => announceMomentCreated());
    release();

    // The stale first answer showed m3 and m2. The queued re-read reads until
    // it meets m2 again, so nothing already shown is lost and the order is the
    // server's. Nothing was sent on top of the first request.
    await waitFor(() => expect(renderedIds()[0]).toBe("shared"));
    expect(renderedIds()).toEqual(["shared", "m3", "m2", "m1"]);
    expect(server.paths).toEqual([
      "/api/v1/social/feed",
      "/api/v1/social/feed",
      "/api/v1/social/feed?cursor=3",
    ]);

    await showEverything();
    expect(renderedIds()).toEqual(serverOrder());
  });

  it("renders the server's order when an older Moment returns alongside a new one", async () => {
    add("existing-newer", 50);
    add("restored-older", 30, false);
    add("existing-oldest", 10);
    server.pageSize = 12;

    render(<SocialFeedView />);
    await waitFor(() => expect(renderedIds()).toEqual(["existing-newer", "existing-oldest"]));

    server.rows.find((row) => row.id === "restored-older")!.visible = true;
    add("new", 60);
    act(() => announceMomentCreated());

    await waitFor(() =>
      expect(renderedIds()).toEqual(["new", "existing-newer", "restored-older", "existing-oldest"])
    );
    server.pageSize = 2;
  });

  it("offers the next page when a refresh gives an empty feed more than one page", async () => {
    render(<SocialFeedView />);
    await waitFor(() => expect(server.paths).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /show more moments/i })).toBeNull();

    for (let rank = 1; rank <= 5; rank += 1) add(`m${rank}`, rank);
    act(() => announceMomentCreated());

    await waitFor(() => expect(renderedIds()).toEqual(["m5", "m4"]));
    await showEverything();
    expect(renderedIds()).toEqual(serverOrder());
    expect(new Set(renderedIds()).size).toBe(renderedIds().length);
  });

  it("adds nothing for a Moment the server does not list", async () => {
    add("a", 2);
    add("b", 1);

    render(<SocialFeedView />);
    await waitFor(() => expect(renderedIds()).toEqual(["a", "b"]));

    add("only-me", 99, false);
    act(() => announceMomentCreated());

    await waitFor(() => expect(server.paths).toHaveLength(2));
    await act(async () => {});
    expect(renderedIds()).toEqual(["a", "b"]);
  });
});
