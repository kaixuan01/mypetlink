// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceMomentCreated } from "@/lib/momentChanges";
import {
  REFRESH_EXTRA_PAGES,
  useMomentPages,
  type MomentPageLoader,
} from "@/lib/useMomentPages";
import type {
  PublicMomentListItem,
  PublicMomentPage,
} from "@/services/publicSocialService";

/**
 * A stand-in for the API's Moment listings, with its real paging contract:
 * ordered by a server key (PublishedAt DESC, Id DESC), a page is everything
 * strictly after the cursor's position, and the cursor is that position — not
 * an index, so it stays valid when Moments are added above it or removed.
 *
 * Each Moment's `rank` is that server key. Ids are chosen so that sorting them
 * as strings gives a different order, which is exactly what a browser cannot
 * reproduce for SQL Server's GUID tie-break.
 */
type Row = { id: string; rank: number; visible: boolean };

function fakeServer(pageSize: number) {
  const rows: Row[] = [];
  const calls: Array<string | undefined> = [];

  function visible() {
    return rows.filter((row) => row.visible).sort((a, b) => b.rank - a.rank);
  }

  const respond = (cursor?: string): PublicMomentPage => {
    const after = cursor === undefined ? Infinity : Number(cursor);
    const remaining = visible().filter((row) => row.rank < after);
    const page = remaining.slice(0, pageSize);
    const more = remaining.length > pageSize;
    return {
      items: page.map((row) => item(row.id)),
      nextCursor: more ? String(page[page.length - 1].rank) : null,
    } as PublicMomentPage;
  };

  return {
    calls,
    add(id: string, rank: number, isVisible = true) {
      rows.push({ id, rank, visible: isVisible });
    },
    setVisible(id: string, isVisible: boolean) {
      rows.find((row) => row.id === id)!.visible = isVisible;
    },
    /** Every visible Moment, in the server's order. */
    order: () => visible().map((row) => row.id),
    load: vi.fn<MomentPageLoader>(async (cursor) => {
      calls.push(cursor);
      return respond(cursor);
    }),
    respond,
  };
}

function item(id: string, likeCount = 0) {
  return { id, title: id, likeCount, viewerHasLiked: false } as unknown as PublicMomentListItem;
}

function ids(moments: PublicMomentListItem[]) {
  return moments.map((moment) => moment.id);
}

/** A promise the test resolves when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function ready(result: { current: ReturnType<typeof useMomentPages> }) {
  await waitFor(() => expect(result.current.state).toBe("ready"));
}

/** Reads every remaining page through the hook's own "load more". */
async function loadEverything(result: { current: ReturnType<typeof useMomentPages> }) {
  for (let guard = 0; result.current.hasMore && guard < 50; guard += 1) {
    await act(() => result.current.loadMore());
  }
}

afterEach(cleanup);

describe("a Moment shared while the listing is still loading", () => {
  it("is not lost: the stale first answer lands, then a follow-up read brings it", async () => {
    const server = fakeServer(12);
    server.add("existing", 10);
    const firstAnswer = deferred<PublicMomentPage>();
    const load = vi.fn<MomentPageLoader>((cursor) =>
      server.load.mock.calls.length === 0 && cursor === undefined
        ? (server.load(cursor), firstAnswer.promise)
        : server.load(cursor)
    );

    const { result } = renderHook(() => useMomentPages(load));
    expect(result.current.state).toBe("loading");

    // The first request is out; it was answered before the Moment existed.
    const stale = server.respond();
    server.add("created", 20);
    act(() => announceMomentCreated());

    // Nothing is fetched on top of the pending request...
    expect(load).toHaveBeenCalledTimes(1);

    firstAnswer.resolve(stale);

    // ...the stale answer is shown, then the queued refresh brings the Moment.
    await waitFor(() => expect(ids(result.current.moments)).toEqual(["created", "existing"]));
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("ready");
  });

  it("coalesces several announcements during one read into one follow-up", async () => {
    const server = fakeServer(12);
    server.add("a", 1);
    const first = deferred<PublicMomentPage>();
    let calls = 0;
    const load = vi.fn<MomentPageLoader>((cursor) => {
      calls += 1;
      return calls === 1 ? first.promise : server.load(cursor);
    });

    const { result } = renderHook(() => useMomentPages(load));
    server.add("b", 2);
    act(() => {
      announceMomentCreated();
      announceMomentCreated();
      announceMomentCreated();
    });
    first.resolve(server.respond());

    await waitFor(() => expect(ids(result.current.moments)).toEqual(["b", "a"]));
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("the cursor after a refresh", () => {
  it("empty listing: adopts the new cursor so every new page is reachable", async () => {
    const server = fakeServer(3);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    expect(result.current.moments).toEqual([]);
    expect(result.current.hasMore).toBe(false);

    for (let rank = 1; rank <= 7; rank += 1) server.add(`m${rank}`, rank);
    act(() => announceMomentCreated());

    await waitFor(() => expect(ids(result.current.moments)).toEqual(["m7", "m6", "m5"]));
    expect(result.current.hasMore).toBe(true);

    await loadEverything(result);
    expect(ids(result.current.moments)).toEqual(server.order());
    expect(result.current.hasMore).toBe(false);
  });

  it("short listing: a refresh that creates a second page keeps the old Moments and the end", async () => {
    const server = fakeServer(3);
    server.add("old2", 20);
    server.add("old1", 10);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    expect(result.current.hasMore).toBe(false);

    server.add("new1", 30);
    server.add("new2", 40);
    act(() => announceMomentCreated());

    // "old1" is now on the server's second page; it is read through, not lost.
    await waitFor(() =>
      expect(ids(result.current.moments)).toEqual(["new2", "new1", "old2", "old1"])
    );
    expect(result.current.hasMore).toBe(false);
  });

  it("reads through several pages of new Moments above the loaded ones", async () => {
    const server = fakeServer(3);
    for (let rank = 1; rank <= 9; rank += 1) server.add(`old${rank}`, rank);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    await act(() => result.current.loadMore());
    expect(ids(result.current.moments)).toEqual(["old9", "old8", "old7", "old6", "old5", "old4"]);

    for (let rank = 1; rank <= 7; rank += 1) server.add(`new${rank}`, 100 + rank);
    server.load.mockClear();
    act(() => announceMomentCreated());

    // "old4" was 6th and is now 13th: the server's 5th page. Whole pages are
    // kept, so the listing is the first 15, with that page's cursor.
    await waitFor(() => expect(result.current.moments).toHaveLength(15));
    // Everything that was loaded is still loaded, under the new Moments, in
    // the server's order.
    expect(ids(result.current.moments)).toEqual(server.order().slice(0, 15));
    expect(server.load).toHaveBeenCalledTimes(5);

    await loadEverything(result);
    expect(ids(result.current.moments)).toEqual(server.order());
  });

  it("does not attach the old cursor to a new first page it no longer meets", async () => {
    const server = fakeServer(3);
    for (let rank = 1; rank <= 6; rank += 1) server.add(`old${rank}`, rank);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    expect(ids(result.current.moments)).toEqual(["old6", "old5", "old4"]);

    // More new Moments than the refresh will read.
    const newCount = (1 + REFRESH_EXTRA_PAGES) * 3 + 2;
    for (let rank = 1; rank <= newCount; rank += 1) server.add(`new${rank}`, 100 + rank);
    act(() => announceMomentCreated());

    await waitFor(() =>
      expect(result.current.moments).toHaveLength((1 + REFRESH_EXTRA_PAGES) * 3)
    );
    // The listing is the part that was read; "old6" is not glued on after it.
    expect(ids(result.current.moments)).toEqual(
      server.order().slice(0, (1 + REFRESH_EXTRA_PAGES) * 3)
    );
    expect(ids(result.current.moments)).not.toContain("old6");
    expect(result.current.hasMore).toBe(true);

    // And nothing is skipped: paging on reaches every Moment exactly once.
    await loadEverything(result);
    expect(ids(result.current.moments)).toEqual(server.order());
  });

  it("keeps the loaded Moments it meets again, once each", async () => {
    const server = fakeServer(3);
    for (let rank = 1; rank <= 5; rank += 1) server.add(`old${rank}`, rank);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    await act(() => result.current.loadMore());

    server.add("created", 50);
    act(() => announceMomentCreated());

    await waitFor(() =>
      expect(ids(result.current.moments)).toEqual(["created", "old5", "old4", "old3", "old2", "old1"])
    );
    expect(new Set(ids(result.current.moments)).size).toBe(6);
    expect(result.current.hasMore).toBe(false);
  });
});

describe("the server's order is the listing's order", () => {
  it("puts a new Moment above a newer one, above a Moment restored to public", async () => {
    const server = fakeServer(12);
    server.add("existing-newer", 50);
    server.add("restored-older", 30, false);
    server.add("existing-oldest", 10);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    expect(ids(result.current.moments)).toEqual(["existing-newer", "existing-oldest"]);

    // An older Moment becomes public again, and then a new one is shared.
    server.setVisible("restored-older", true);
    server.add("new", 60);
    act(() => announceMomentCreated());

    await waitFor(() =>
      expect(ids(result.current.moments)).toEqual([
        "new",
        "existing-newer",
        "restored-older",
        "existing-oldest",
      ])
    );
  });

  it("follows the server's tie-break even where the ids sort the other way", async () => {
    const server = fakeServer(2);
    // Same publication time; the server's Id order is not string order.
    server.add("zz-first", 21);
    server.add("aa-second", 20);
    server.add("mm-third", 10);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);

    server.add("bb-created", 30);
    act(() => announceMomentCreated());

    await waitFor(() => expect(result.current.moments).toHaveLength(4));
    expect(ids(result.current.moments)).toEqual(server.order());
    expect(ids(result.current.moments)).toEqual(["bb-created", "zz-first", "aa-second", "mm-third"]);
  });

  it("inserts nothing the server does not list — a Moment kept to Only me", async () => {
    const server = fakeServer(12);
    server.add("a", 2);
    server.add("b", 1);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);

    server.add("private", 99, false);
    act(() => announceMomentCreated());

    await waitFor(() => expect(server.load).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(ids(result.current.moments)).toEqual(["a", "b"]);
  });

  it("drops a loaded Moment the server no longer lists", async () => {
    const server = fakeServer(12);
    server.add("a", 3);
    server.add("b", 2);
    server.add("c", 1);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);

    server.setVisible("b", false);
    server.add("d", 4);
    act(() => announceMomentCreated());

    await waitFor(() => expect(ids(result.current.moments)).toEqual(["d", "a", "c"]));
  });
});

describe("one operation at a time", () => {
  it("queues a refresh behind a further page, and reads after it", async () => {
    const server = fakeServer(2);
    for (let rank = 1; rank <= 5; rank += 1) server.add(`m${rank}`, rank);
    const page2 = deferred<PublicMomentPage>();
    const load = vi.fn<MomentPageLoader>((cursor, context) =>
      cursor && !context?.refresh && page2 ? (server.load(cursor), page2.promise) : server.load(cursor)
    );

    const { result } = renderHook(() => useMomentPages(load));
    await ready(result);

    let more!: Promise<void>;
    act(() => {
      more = result.current.loadMore();
    });
    const staleSecondPage = server.respond(server.load.mock.calls.at(-1)?.[0]);
    server.add("created", 10);
    act(() => announceMomentCreated());
    expect(load).toHaveBeenCalledTimes(2);

    page2.resolve(staleSecondPage);
    await act(() => more);

    // The refresh read after the further page landed, so it looked for "m2"
    // and kept the whole page it was on.
    await waitFor(() => expect(ids(result.current.moments)[0]).toBe("created"));
    expect(ids(result.current.moments)).toEqual(["created", "m5", "m4", "m3", "m2", "m1"]);
    expect(new Set(ids(result.current.moments)).size).toBe(6);
    await loadEverything(result);
    expect(ids(result.current.moments)).toEqual(server.order());
  });

  it("runs a further page asked for during a refresh from the refreshed cursor", async () => {
    const server = fakeServer(2);
    for (let rank = 1; rank <= 4; rank += 1) server.add(`m${rank}`, rank);
    let hold: ReturnType<typeof deferred<PublicMomentPage>> | null = null;
    const load = vi.fn<MomentPageLoader>((cursor, context) => {
      if (context?.refresh && !cursor && hold) return hold.promise;
      return server.load(cursor, context);
    });

    const { result } = renderHook(() => useMomentPages(load));
    await ready(result);

    server.add("created", 10);
    hold = deferred<PublicMomentPage>();
    act(() => announceMomentCreated());
    await act(() => result.current.loadMore()); // queued, not sent
    expect(load).toHaveBeenCalledTimes(2);

    const refreshed = server.respond();
    hold.resolve(refreshed);
    hold = null;

    // Refreshed: created, m4 | m3, m2 (cursor after m2). The queued further
    // page then continues from *that* cursor — not the one before the refresh.
    await waitFor(() => expect(ids(result.current.moments)).toEqual(server.order()));
    expect(result.current.hasMore).toBe(false);
    const furtherPages = load.mock.calls.filter(([cursor, context]) => cursor && !context?.refresh);
    expect(furtherPages.map(([cursor]) => cursor)).toEqual(["2"]);
  });

  it("discards a refresh answer that a reload has superseded", async () => {
    const server = fakeServer(12);
    server.add("a", 1);
    let hold: ReturnType<typeof deferred<PublicMomentPage>> | null = null;
    const load = vi.fn<MomentPageLoader>((cursor, context) =>
      context?.refresh && hold ? hold.promise : server.load(cursor, context)
    );

    const { result } = renderHook(() => useMomentPages(load));
    await ready(result);

    hold = deferred<PublicMomentPage>();
    act(() => announceMomentCreated());
    const staleRefresh = { items: [item("stale")], nextCursor: null } as PublicMomentPage;

    server.add("b", 2);
    act(() => result.current.reload());
    await waitFor(() => expect(ids(result.current.moments)).toEqual(["b", "a"]));

    hold.resolve(staleRefresh);
    await act(async () => {});
    expect(ids(result.current.moments)).toEqual(["b", "a"]);
  });

  it("keeps a like given while a refresh is in flight", async () => {
    const server = fakeServer(12);
    server.add("a", 1);
    let hold: ReturnType<typeof deferred<PublicMomentPage>> | null = null;
    const load = vi.fn<MomentPageLoader>((cursor, context) =>
      context?.refresh && hold ? hold.promise : server.load(cursor, context)
    );

    const { result } = renderHook(() => useMomentPages(load));
    await ready(result);

    hold = deferred<PublicMomentPage>();
    act(() => announceMomentCreated());
    // The refresh was answered before the like reached the server.
    server.add("new", 2);
    const answer = server.respond();
    act(() => result.current.onLikeChange("a", { likeCount: 1, viewerHasLiked: true }));

    hold.resolve(answer);
    await waitFor(() => expect(ids(result.current.moments)).toEqual(["new", "a"]));
    expect(result.current.moments[1]).toMatchObject({ likeCount: 1, viewerHasLiked: true });
  });
});

describe("failures and lifecycle", () => {
  it("keeps the listing and its cursor when the refresh fails", async () => {
    const server = fakeServer(2);
    for (let rank = 1; rank <= 3; rank += 1) server.add(`m${rank}`, rank);
    const load = vi.fn<MomentPageLoader>((cursor, context) =>
      context?.refresh ? Promise.reject(new Error("offline")) : server.load(cursor, context)
    );

    const { result } = renderHook(() => useMomentPages(load));
    await ready(result);
    act(() => announceMomentCreated());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(ids(result.current.moments)).toEqual(["m3", "m2"]);
    expect(result.current.hasMore).toBe(true);
    await loadEverything(result);
    expect(ids(result.current.moments)).toEqual(["m3", "m2", "m1"]);
  });

  it("tries again when the listing had failed to load", async () => {
    const load = vi
      .fn<MomentPageLoader>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [item("a")], nextCursor: null } as PublicMomentPage);

    const { result } = renderHook(() => useMomentPages(load));
    await waitFor(() => expect(result.current.state).toBe("error"));

    act(() => announceMomentCreated());

    await ready(result);
    expect(ids(result.current.moments)).toEqual(["a"]);
  });

  it("reads once per announcement, with one listener per listing", async () => {
    const server = fakeServer(12);
    server.add("a", 1);
    const { result } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    server.load.mockClear();

    act(() => announceMomentCreated());
    await waitFor(() => expect(server.load).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(server.load).toHaveBeenCalledTimes(1);
  });

  it("stops listening once the listing is gone", async () => {
    const server = fakeServer(12);
    server.add("a", 1);
    const { result, unmount } = renderHook(() => useMomentPages(server.load));
    await ready(result);
    unmount();

    announceMomentCreated();

    expect(server.load).toHaveBeenCalledTimes(1);
  });
});
