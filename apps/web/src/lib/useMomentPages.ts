"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeMomentCreated } from "@/lib/momentChanges";
import type {
  PublicMomentListItem,
  PublicMomentPage,
} from "@/services/publicSocialService";

export type MomentPagesState = "loading" | "ready" | "error";

/**
 * Loads one page. Must be stable — wrap it in `useCallback` with whatever the
 * selection actually depends on (a handle, a slug, a species filter), because a
 * new identity here restarts the listing from its first page.
 */
export type MomentPageLoader = (cursor?: string) => Promise<PublicMomentPage>;

/**
 * Cursor-paged Moments, shared by every social listing.
 *
 * Each surface differs only in which Moments it asks for, so the paging, the
 * like bookkeeping and the failure behaviour live here once. Three rules the
 * callers all depend on:
 *
 * - A failed *further* page never clears what is already on screen. Somebody
 *   scrolling a feed on a train must not lose it to one dropped request.
 * - The cursor is whatever the server last said. Nothing here constructs one,
 *   and a short page is never read as the end — only a null cursor is.
 * - `loadedAt` is captured once per load so relative ages ("2h") are computed
 *   from a fixed point rather than from the clock during render.
 */
export function useMomentPages(load: MomentPageLoader) {
  const [state, setState] = useState<MomentPagesState>("loading");
  const [moments, setMoments] = useState<PublicMomentListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    load()
      .then((page) => {
        if (!active) return;

        setMoments(page.items);
        setNextCursor(page.nextCursor);
        setLoadedAt(Date.now());
        setState("ready");
      })
      .catch(() => {
        if (!active) return;

        setMoments([]);
        setNextCursor(null);
        setState("error");
      });

    return () => {
      active = false;
    };
  }, [load, reloadToken]);

  const loadMore = useCallback(async () => {
    // Single flight. A scroll sentinel can fire several times before a request
    // settles, and each extra call would spend the same cursor again.
    if (!nextCursor || loadingMore) {
      return;
    }

    setLoadingMore(true);
    setLoadMoreFailed(false);

    try {
      const page = await load(nextCursor);

      setMoments((current) => {
        // A Moment published between two requests shifts the window, so a
        // cursor page can legitimately overlap the one before it. Appending
        // blindly would render the same card twice and give React duplicate
        // keys; the first copy wins because it is the one already on screen.
        const seen = new Set(current.map((moment) => moment.id));
        return [...current, ...page.items.filter((moment) => !seen.has(moment.id))];
      });

      setNextCursor(page.nextCursor);
    } catch {
      // Keep the cursor so the same page can be retried, and keep every item
      // already rendered. The flag stops an automatic loader retrying straight
      // into the same failure — the reader asks again instead.
      setNextCursor(nextCursor);
      setLoadMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }, [load, loadingMore, nextCursor]);

  const onLikeChange = useCallback(
    (
      momentId: string,
      change: { likeCount: number; viewerHasLiked: boolean }
    ) => {
      setMoments((current) =>
        current.map((moment) =>
          moment.id === momentId ? { ...moment, ...change } : moment
        )
      );
    },
    []
  );

  const reload = useCallback(() => {
    setState("loading");
    setReloadToken((token) => token + 1);
  }, []);

  /*
    A Moment shared from the Community composer, which sits above this listing.
    Ask for the first page again and put anything not already here at the top:
    every listing is newest-first, so a new Moment can only arrive there. The
    pages already loaded, the reader's scroll position and every like stay as
    they are — no skeleton, no jump back to the top. The server decides whether
    the Moment belongs here; one kept to "Only me" is simply not in the answer.
  */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;

    const unsubscribe = subscribeMomentCreated(() => {
      if (stateRef.current === "error") {
        // Nothing on screen to keep. Somebody who just shared a Moment
        // deserves another attempt at the listing it should appear in.
        reload();
        return;
      }

      if (stateRef.current !== "ready") {
        return;
      }

      load()
        .then((page) => {
          if (!active) return;

          setMoments((current) => {
            const seen = new Set(current.map((moment) => moment.id));
            const arrived = page.items.filter((moment) => !seen.has(moment.id));
            return arrived.length > 0 ? [...arrived, ...current] : current;
          });
        })
        .catch(() => {
          // The listing stays exactly as it was; the Moment is shared either
          // way, and the next visit to this page will include it.
        });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [load, reload]);

  return {
    state,
    moments,
    hasMore: Boolean(nextCursor),
    loadingMore,
    /** The last further page failed. Cleared by the next attempt. */
    loadMoreFailed,
    loadedAt,
    loadMore,
    onLikeChange,
    reload,
  };
}
