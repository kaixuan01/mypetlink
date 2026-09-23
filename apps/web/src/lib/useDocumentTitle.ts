"use client";

import { useEffect } from "react";

/**
 * Holds the browser tab's title for as long as a view is on screen.
 *
 * Setting `document.title` once is not enough on routes that arrive through the
 * exported 404 shell — every real `/moments/{id}` does. That shell's metadata
 * title is "Loading", and Next commits it into `<head>` again after hydration,
 * which is after any effect a view has already run. A one-off assignment made
 * before that point is simply overwritten, and the tab went on saying
 * "Loading" beside a Moment that had finished loading.
 *
 * So this re-applies the title whenever something else rewrites it, while the
 * view is mounted and the address is still the one it was set for. The second
 * condition matters: the router updates the address before the next page's
 * title lands, so a page being navigated away from never fights its successor.
 * MutationObserver callbacks run before the next paint, so the stale title is
 * never actually shown.
 *
 * Pass `null` to leave the title alone — for example while there is nothing
 * truthful to say yet.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title || typeof document === "undefined") {
      return undefined;
    }

    const pathname = window.location.pathname;
    let active = true;

    const apply = () => {
      if (document.title !== title) {
        document.title = title;
      }
    };

    apply();

    if (typeof MutationObserver === "undefined") {
      return () => {
        active = false;
      };
    }

    const observer = new MutationObserver(() => {
      if (!active || window.location.pathname !== pathname) {
        return;
      }

      apply();
    });

    observer.observe(document.head, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [title]);
}
