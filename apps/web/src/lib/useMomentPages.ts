"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeMomentCreated } from "@/lib/momentChanges";
import type {
  PublicMomentListItem,
  PublicMomentPage,
} from "@/services/publicSocialService";

export type MomentPagesState = "loading" | "ready" | "error";

/** Why a page is being asked for, for a caller that counts its own pages. */
export type MomentPageContext = {
  /** Part of re-reading the listing after a Moment was shared, not the reader paging. */
  refresh: boolean;
};

/**
 * Loads one page. Must be stable — wrap it in `useCallback` with whatever the
 * selection actually depends on (a handle, a slug, a species filter), because a
 * new identity here restarts the listing from its first page.
 */
export type MomentPageLoader = (
  cursor?: string,
  context?: MomentPageContext
) => Promise<PublicMomentPage>;

type LikeChange = { likeCount: number; viewerHasLiked: boolean };

/**
 * What is listed: the Moments, in the server's order, and the cursor that
 * continues exactly after the last of them.
 */
type Listing = {
  moments: PublicMomentListItem[];
  nextCursor: string | null;
  /** Pages this listing was built from; bounds how far a refresh re-reads. */
  pages: number;
};

const emptyListing: Listing = { moments: [], nextCursor: null, pages: 0 };

/**
 * How many pages beyond those already loaded a refresh may read while looking
 * for the end of what was on screen. Sharing adds one Moment; this allows for
 * a few pages of other people's too. It bounds cost, not correctness: stopping
 * early only leaves a shorter listing whose own cursor still reaches the rest.
 */
export const REFRESH_EXTRA_PAGES = 3;

/**
 * Cursor-paged Moments, shared by every social listing.
 *
 * Each surface differs only in which Moments it asks for, so the paging, the
 * like bookkeeping, the failure behaviour and the refresh after a share live
 * here once. What callers can rely on:
 *
 * - **Server order, always.** The listing is a run of pages exactly as the API
 *   returned them (`PublishedAt DESC, Id DESC`). Nothing here sorts, and nothing
 *   is inserted by guessing where it belongs: the Id tie-break follows SQL
 *   Server's GUID ordering, which a browser cannot reproduce.
 * - **The cursor belongs to the listing it continues.** It is only ever the
 *   cursor of the last page the listing was built from, so "load more" can
 *   never skip Moments or join two different reads together.
 * - **No duplicates.** A Moment published between two requests shifts the
 *   window, so pages can overlap; the first copy wins.
 * - **One operation at a time.** The first load, a refresh and a further page
 *   never overlap. A refresh asked for while one of them is in flight is queued
 *   and runs after it — never dropped — and so is a further page asked for
 *   during a refresh. A reload supersedes everything, and an answer to a
 *   superseded request is discarded rather than written over newer state.
 * - A failed *further* page never clears what is already on screen. Somebody
 *   scrolling a feed on a train must not lose it to one dropped request.
 * - `loadedAt` is captured per load so relative ages ("2h") are computed from a
 *   fixed point rather than from the clock during render.
 */
export function useMomentPages(load: MomentPageLoader) {
  const [state, setState] = useState<MomentPagesState>("loading");
  const [listing, setListing] = useState<Listing>(emptyListing);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | undefined>(undefined);

  const [controller] = useState(() =>
    createMomentPagesController({
      setState,
      setListing,
      setLoadingMore,
      setLoadMoreFailed,
      setLoadedAt,
    })
  );

  useEffect(() => {
    controller.start(load);
    return () => controller.dispose();
  }, [controller, load]);

  /*
    A Moment shared from the Community composer, which sits above this
    listing. The server decides whether it belongs here — one kept to "Only
    me" is simply not in the answer — and where: see `refresh`.
  */
  useEffect(() => subscribeMomentCreated(controller.refresh), [controller]);

  const reload = useCallback(() => controller.reload(), [controller]);

  return {
    state,
    moments: listing.moments,
    hasMore: Boolean(listing.nextCursor),
    loadingMore,
    /** The last further page failed. Cleared by the next attempt. */
    loadMoreFailed,
    loadedAt,
    loadMore: controller.loadMore,
    onLikeChange: controller.onLikeChange,
    reload,
  };
}

type View = {
  setState: (state: MomentPagesState) => void;
  setListing: (listing: Listing) => void;
  setLoadingMore: (loading: boolean) => void;
  setLoadMoreFailed: (failed: boolean) => void;
  setLoadedAt: (at: number) => void;
};

/**
 * The one place a listing changes. Plain closure state rather than React
 * state, because each decision here depends on what is in flight *now*, not
 * on the last render; every change is also pushed to the view.
 */
function createMomentPagesController(view: View) {
  /** Bumped by a (re)load and on unmount. Answers from an older epoch are dropped. */
  let epoch = 0;
  let busy: "load" | "refresh" | "more" | null = null;
  let refreshQueued = false;
  let moreQueued = false;
  let status: MomentPagesState = "loading";
  let listing = emptyListing;
  let loader: MomentPageLoader | null = null;
  /** Likes given while a refresh is in flight, re-applied over its answer. */
  let likesDuringRefresh: Map<string, LikeChange> | null = null;

  function commit(next: Listing) {
    listing = next;
    view.setListing(next);
  }

  function setStatus(next: MomentPagesState) {
    status = next;
    view.setState(next);
  }

  /** Ends the operation that began in `owner`, then runs whatever was queued. */
  function settle(owner: number) {
    if (owner !== epoch) return;
    busy = null;

    if (refreshQueued) {
      refreshQueued = false;
      refresh();
      return;
    }

    if (moreQueued) {
      moreQueued = false;
      void loadMore();
    }
  }

  function start(nextLoader: MomentPageLoader, showLoading = false) {
    epoch += 1;
    const owner = epoch;
    loader = nextLoader;
    busy = "load";
    // This request is issued now, after anything announced so far, so it
    // already answers a queued refresh; a queued further page belonged to the
    // listing being replaced.
    refreshQueued = false;
    moreQueued = false;
    likesDuringRefresh = null;
    view.setLoadingMore(false);
    view.setLoadMoreFailed(false);
    if (showLoading) setStatus("loading");

    nextLoader()
      .then((page) => {
        if (owner !== epoch) return;
        commit({
          moments: uniqueById(page.items),
          nextCursor: page.nextCursor,
          pages: 1,
        });
        view.setLoadedAt(Date.now());
        setStatus("ready");
      })
      .catch(() => {
        if (owner !== epoch) return;
        commit(emptyListing);
        setStatus("error");
      })
      .finally(() => settle(owner));
  }

  /**
   * Re-read the listing from its first page after a Moment was shared.
   *
   * Pages are read in the server's order until the last Moment that was on
   * screen turns up again (or the list ends, or the page budget runs out), and
   * then that read *replaces* the listing, with its own cursor. So:
   *
   * - new Moments land wherever the server puts them — including a newer
   *   Moment above one that was restored to public in the meantime;
   * - every Moment still visible from the pages already loaded stays loaded;
   * - one that is no longer visible (deleted, hidden, made "Only me") goes;
   * - a listing that was empty or short picks up the cursor the server now
   *   gives it, so the next page is reachable;
   * - several pages of new Moments above the old ones are read through rather
   *   than skipped. If the budget runs out first, the listing is simply the
   *   part that was read, and its cursor continues from there — the old cursor
   *   is never attached to a new first page, so nothing can fall in a gap.
   */
  function refresh() {
    if (!loader) return;

    if (busy) {
      refreshQueued = true;
      return;
    }

    if (status === "error") {
      // Nothing on screen to keep. Somebody who just shared a Moment deserves
      // another attempt at the listing it should appear in.
      start(loader, true);
      return;
    }

    if (status !== "ready") return;

    const owner = epoch;
    const currentLoader = loader;
    const previous = listing;
    busy = "refresh";
    likesDuringRefresh = new Map();

    readThrough(currentLoader, previous)
      .then((read) => {
        if (owner !== epoch) return;
        const likes = likesDuringRefresh;
        commit({
          moments:
            likes && likes.size > 0
              ? read.moments.map((moment) =>
                  likes.has(moment.id) ? { ...moment, ...likes.get(moment.id) } : moment
                )
              : read.moments,
          nextCursor: read.nextCursor,
          pages: read.pages,
        });
        view.setLoadMoreFailed(false);
        view.setLoadedAt(Date.now());
      })
      .catch(() => {
        // The listing stays exactly as it was, cursor included. The Moment is
        // shared either way, and the next visit to this page will include it.
      })
      .finally(() => {
        if (owner === epoch) likesDuringRefresh = null;
        settle(owner);
      });
  }

  async function loadMore() {
    const cursor = listing.nextCursor;
    if (!loader || !cursor || status !== "ready") return;

    // Single flight. A scroll sentinel can fire several times before a request
    // settles, and each extra call would spend the same cursor again.
    if (busy === "more") return;

    // A different listing is on its way (a reload, or a new filter): its first
    // page is what comes next, not a page after this one.
    if (busy === "load") return;

    if (busy) {
      // The listing is being re-read and its cursor is about to change. Ask
      // again once it has, from wherever it then ends.
      moreQueued = true;
      return;
    }

    const owner = epoch;
    busy = "more";
    view.setLoadingMore(true);
    view.setLoadMoreFailed(false);

    try {
      const page = await loader(cursor);
      if (owner !== epoch) return;

      commit({
        moments: appendUnique(listing.moments, page.items),
        nextCursor: page.nextCursor,
        pages: listing.pages + 1,
      });
    } catch {
      if (owner !== epoch) return;
      // Keep the cursor so the same page can be retried, and keep every item
      // already rendered. The flag stops an automatic loader retrying straight
      // into the same failure — the reader asks again instead.
      view.setLoadMoreFailed(true);
    } finally {
      if (owner === epoch) {
        view.setLoadingMore(false);
        settle(owner);
      }
    }
  }

  function onLikeChange(momentId: string, change: LikeChange) {
    likesDuringRefresh?.set(momentId, change);
    commit({
      ...listing,
      moments: listing.moments.map((moment) =>
        moment.id === momentId ? { ...moment, ...change } : moment
      ),
    });
  }

  return {
    start: (nextLoader: MomentPageLoader) => start(nextLoader),
    reload: () => {
      if (loader) start(loader, true);
    },
    refresh,
    loadMore,
    onLikeChange,
    dispose: () => {
      epoch += 1;
      busy = null;
      refreshQueued = false;
      moreQueued = false;
    },
  };
}

/**
 * Pages from the top, in the server's order, until `previous`'s last Moment is
 * among them, the list ends, or the page budget is spent.
 */
async function readThrough(
  load: MomentPageLoader,
  previous: Listing
): Promise<Listing> {
  const anchor = previous.moments.at(-1)?.id;
  const budget = Math.max(previous.pages, 1) + REFRESH_EXTRA_PAGES;
  const moments: PublicMomentListItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let nextCursor: string | null = null;
  let pages = 0;

  do {
    const page = await load(cursor, { refresh: true });
    pages += 1;

    for (const moment of page.items) {
      if (seen.has(moment.id)) continue;
      seen.add(moment.id);
      moments.push(moment);
    }

    nextCursor = page.nextCursor;
    cursor = nextCursor ?? undefined;
  } while (
    nextCursor &&
    anchor !== undefined &&
    !seen.has(anchor) &&
    pages < budget
  );

  return { moments, nextCursor, pages };
}

function uniqueById(items: PublicMomentListItem[]) {
  return appendUnique([], items);
}

/** Appends in order, skipping any Moment already listed; the first copy wins. */
function appendUnique(
  current: PublicMomentListItem[],
  items: PublicMomentListItem[]
) {
  const seen = new Set(current.map((moment) => moment.id));
  const added: PublicMomentListItem[] = [];

  for (const moment of items) {
    if (seen.has(moment.id)) continue;
    seen.add(moment.id);
    added.push(moment);
  }

  return added.length > 0 ? [...current, ...added] : current;
}
