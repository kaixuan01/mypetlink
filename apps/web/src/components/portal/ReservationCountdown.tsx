"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Presentation-only countdown to the server's absolute reservation deadline.
 *
 * The server stays authoritative: this only formats the remaining time and
 * tells the page when the deadline has passed so it can re-check the order.
 * Because every tick recomputes from the absolute timestamp rather than
 * decrementing a stored number, a background tab, a sleeping device, or a
 * clock adjustment cannot leave the display drifting.
 */
export function useReservationCountdown(expiresAt: string | undefined, onExpired?: () => void) {
  const deadline = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
  // Only the clock is state; the remaining time is derived. That keeps the
  // effect a pure subscription and means a suspended tab or an adjusted system
  // clock self-corrects on the next tick instead of drifting.
  const [now, setNow] = useState(() => Date.now());
  const onExpiredRef = useRef(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (Number.isNaN(deadline)) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    // A tab that was suspended can be many minutes stale on return.
    function refreshOnVisible() {
      if (document.visibilityState === "visible") setNow(Date.now());
    }
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [deadline]);

  const remainingMs = Number.isNaN(deadline) ? Number.NaN : deadline - now;
  const expired = !Number.isNaN(deadline) && remainingMs <= 0;

  useEffect(() => {
    if (!expired) return;

    // Ask the page immediately, then keep checking at a calm interval until
    // the server confirms the terminal state. The browser clock never changes
    // the order by itself and a worker poll that lands just after zero is still
    // observed without requiring a manual refresh.
    onExpiredRef.current?.();
    const timer = window.setInterval(() => onExpiredRef.current?.(), 5000);
    return () => window.clearInterval(timer);
  }, [expired, deadline]);

  return {
    hasDeadline: !Number.isNaN(deadline),
    remainingMs,
    deadlineReached: expired,
    // Under fifteen minutes the wording becomes a calm warning rather than a
    // neutral note.
    nearExpiry: !Number.isNaN(deadline) && remainingMs > 0 && remainingMs <= 15 * 60 * 1000,
    label: formatRemaining(remainingMs),
  };
}

export function formatRemaining(remainingMs: number): string {
  if (Number.isNaN(remainingMs) || remainingMs <= 0) return "0 minutes";
  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  if (hours > 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  if (totalMinutes >= 1) return `${totalMinutes} ${totalMinutes === 1 ? "minute" : "minutes"}`;
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

/** Calm inline banner describing how long the reserved tags are held. */
export function ReservationNotice({
  remainingLabel,
  nearExpiry,
  deadlineReached = false,
}: {
  remainingLabel: string;
  nearExpiry: boolean;
  deadlineReached?: boolean;
}) {
  return (
    <p
      className={`rounded-xl p-3 text-sm font-bold ${
        nearExpiry ? "bg-[#fdf3df] text-[#9a6b18]" : "bg-pet-cream text-pet-muted"
      }`}
      data-testid="reservation-countdown"
    >
      {deadlineReached
        ? "Checking your reservation status…"
        : `Complete payment within ${remainingLabel} to keep these items reserved.`}
    </p>
  );
}
