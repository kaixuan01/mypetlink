"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AdminAccessQueryState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads Admin Portal data for a key, and reloads when that key changes.
 *
 * "Loading" is derived from whether the result in hand belongs to the key being
 * asked for, rather than being flipped on at the start of an effect. That keeps
 * the effect to one job — starting the request and cancelling it — and avoids
 * the extra render a synchronous state change inside an effect would cause.
 *
 * `fetcher` is read through a ref, so it can close over current props without
 * restarting the request on every render. The `key` is what decides when to
 * fetch again.
 */
export function useAdminAccessQuery<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  toErrorMessage: (error: unknown) => string
): AdminAccessQueryState<T> {
  const fetcherRef = useRef(fetcher);
  const errorRef = useRef(toErrorMessage);

  // Declared before the fetching effect so the latest closures are in place by
  // the time it runs in the same commit.
  useEffect(() => {
    fetcherRef.current = fetcher;
    errorRef.current = toErrorMessage;
  });

  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data: T | null;
    error: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({ key, attempt, data, error: null });
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setResult({ key, attempt, data: null, error: errorRef.current(caught) });
        }
      });

    return () => controller.abort();
  }, [key, attempt]);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);
  const current = result?.key === key && result.attempt === attempt ? result : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null,
    reload,
  };
}
