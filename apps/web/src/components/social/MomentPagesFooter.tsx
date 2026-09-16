"use client";

import { useEffect, useRef } from "react";
import { CTAButton } from "@/components/ui/CTAButton";

/**
 * The end of a cursor-paged listing: loads the next page as the reader reaches
 * it, and always offers a button as well.
 *
 * The button is not a fallback bolted on for old browsers. Automatic loading is
 * a convenience for somebody scrolling with a thumb; somebody moving by
 * keyboard or screen reader needs a control they can actually reach and
 * operate, and a page that only grows when you scroll past an invisible marker
 * is not operable that way. So both exist, both call the same single-flight
 * loader, and neither can double-spend a cursor.
 *
 * Three rules this enforces:
 *
 * - **Nothing loads automatically after a failure.** The observer would fire
 *   again the instant the sentinel is still on screen, which is a retry loop
 *   against a server that just said no. After a failed page the reader asks.
 * - **Nothing loads when there is no cursor.** The end of a listing is a null
 *   cursor, never a short page.
 * - **Progress is announced.** `role="status"` on the live region means the
 *   arrival of more Moments is not something you have to see.
 */
export function MomentPagesFooter({
  hasMore,
  loading,
  failed,
  onLoadMore,
  label = "Show more Moments",
  endText,
}: {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoadMore: () => void;
  label?: string;
  /** Shown once the listing has run out. Omit for surfaces that say nothing. */
  endText?: string;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // The callback is held in a ref, and the ref is written in an effect rather
  // than during render. Two reasons: writing a ref while rendering is a bug
  // waiting to happen, and keeping the observer independent of the callback's
  // identity means it is not torn down and rebuilt every time the cursor moves
  // — a rebuild while the sentinel is still on screen fires immediately, which
  // is how an observer turns into a loop.
  const loadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    loadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  const autoLoad = hasMore && !failed;

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !autoLoad || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreRef.current();
        }
      },
      // A modest margin so the next page is arriving as the reader gets there,
      // without reaching pages ahead they may never scroll to.
      { rootMargin: "400px 0px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [autoLoad]);

  if (!hasMore) {
    return endText ? (
      <p
        className="mt-6 text-center text-sm font-semibold text-pet-muted"
        data-testid="feed-end"
      >
        {endText}
      </p>
    ) : null;
  }

  return (
    <div className="mt-6 grid justify-items-center gap-2">
      <div aria-hidden="true" data-testid="moment-pages-sentinel" ref={sentinelRef} />

      {failed ? (
        <p className="text-sm font-semibold text-pet-muted" role="alert">
          We couldn&rsquo;t load more just now.
        </p>
      ) : null}

      <CTAButton
        disabled={loading}
        onClick={onLoadMore}
        type="button"
        variant="secondary"
      >
        {loading ? "Loading…" : failed ? "Try again" : label}
      </CTAButton>

      <span className="sr-only" role="status">
        {loading ? "Loading more Moments." : ""}
      </span>
    </div>
  );
}
