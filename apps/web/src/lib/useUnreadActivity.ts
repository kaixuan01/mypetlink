"use client";

import { useEffect, useState } from "react";
import { getUnreadActivityCount } from "@/services/socialNotificationService";

/**
 * The Activity badge, read once and shared.
 *
 * Every navigation surface wants this number and they are all on screen at the
 * same time, so the fetch lives here behind one small cache rather than in each
 * of them. Without it, a desktop sidebar and a mobile bar and a header would
 * each ask on every route change — the refetch storm that makes a badge
 * expensive.
 *
 * The number is allowed to be a little stale. It is a nudge towards a screen,
 * not a figure anybody acts on, and that screen corrects it on arrival.
 */

const freshForMs = 60_000;

let cachedCount = 0;
let cachedAt = 0;
let inFlight: Promise<number> | null = null;

const listeners = new Set<(count: number) => void>();

function publish(count: number) {
  cachedCount = count;
  cachedAt = Date.now();
  listeners.forEach((listener) => listener(count));
}

function refresh(): Promise<number> {
  inFlight ??= getUnreadActivityCount()
    .then((count) => {
      publish(count);
      return count;
    })
    .catch(() => {
      // A badge is the last thing that should produce an error message.
      return cachedCount;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Call after marking activity read, so every badge on screen drops at once. */
export function setUnreadActivityCount(count: number) {
  publish(count);
}

export function useUnreadActivity(enabled: boolean) {
  // Seeded from the cache at mount, so a badge that is already known renders
  // with its number rather than flashing zero and then correcting itself.
  const [count, setCount] = useState(() => cachedCount);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    listeners.add(setCount);

    if (Date.now() - cachedAt > freshForMs) {
      void refresh();
    }

    return () => {
      listeners.delete(setCount);
    };
  }, [enabled]);

  return count;
}

/** Test seam: forgets the cache so each case starts from nothing. */
export function resetUnreadActivityCache() {
  cachedCount = 0;
  cachedAt = 0;
  inFlight = null;
  listeners.clear();
}
