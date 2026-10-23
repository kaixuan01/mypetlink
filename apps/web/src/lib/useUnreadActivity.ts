"use client";

import { useEffect, useState } from "react";
import { getAuthSessionKey, subscribeAuthSession } from "@/services/authStorage";
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
 *
 * It is never another sign-in's number: the cache belongs to the session that
 * read it, is forgotten when the sign-in changes, and an answer that arrives
 * after its sign-in ended is not published.
 */

const freshForMs = 60_000;

let cachedCount = 0;
let cachedAt = 0;
let inFlight: Promise<number> | null = null;
let cachedFor: string | null = null;
let watchingSessions = false;

const listeners = new Set<(count: number) => void>();

function publish(count: number) {
  cachedCount = count;
  cachedAt = Date.now();
  listeners.forEach((listener) => listener(count));
}

function forgetForNewSession() {
  cachedCount = 0;
  cachedAt = 0;
  inFlight = null;
  cachedFor = getAuthSessionKey();
  listeners.forEach((listener) => listener(0));
}

function watchSessions() {
  if (watchingSessions || typeof window === "undefined") return;
  watchingSessions = true;
  subscribeAuthSession(forgetForNewSession);
}

function refresh(): Promise<number> {
  const key = getAuthSessionKey();
  if (key !== cachedFor) forgetForNewSession();
  if (inFlight) return inFlight;

  const request: Promise<number> = getUnreadActivityCount()
    .then((count) => {
      if (getAuthSessionKey() !== key) return 0;
      publish(count);
      return count;
    })
    .catch(() => {
      // A badge is the last thing that should produce an error message.
      return getAuthSessionKey() === key ? cachedCount : 0;
    })
    .finally(() => {
      // Only this request's own slot: a newer sign-in may have started one.
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;

  return request;
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

    watchSessions();
    listeners.add(setCount);

    if (getAuthSessionKey() !== cachedFor || Date.now() - cachedAt > freshForMs) {
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
  cachedFor = null;
  listeners.clear();
}
