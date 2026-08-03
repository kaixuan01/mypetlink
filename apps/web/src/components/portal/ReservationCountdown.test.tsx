// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReservationNotice, formatRemaining, useReservationCountdown } from "./ReservationCountdown";

function Harness({ expiresAt, onExpired }: { expiresAt: string; onExpired: () => void }) {
  const countdown = useReservationCountdown(expiresAt, onExpired);
  return (
    <ReservationNotice
      deadlineReached={countdown.deadlineReached}
      nearExpiry={countdown.nearExpiry}
      remainingLabel={countdown.label}
    />
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ReservationCountdown", () => {
  it("formats positive durations without negative output", () => {
    expect(formatRemaining(2 * 60 * 60 * 1000)).toBe("2 hours");
    expect(formatRemaining(61 * 60 * 1000)).toBe("1 hour 1 minute");
    expect(formatRemaining(-1)).toBe("0 minutes");
  });

  it("recomputes from the absolute deadline and requests server refresh at zero", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T12:00:00Z"));
    const onExpired = vi.fn();
    render(<Harness expiresAt="2026-08-03T12:01:00Z" onExpired={onExpired} />);

    expect(screen.getByText("Complete payment within 1 minute to keep these items reserved.")).toBeTruthy();
    expect(screen.getByTestId("reservation-countdown").getAttribute("aria-live")).toBeNull();

    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(screen.getByText("Checking your reservation status…")).toBeTruthy();
    expect(onExpired).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(onExpired).toHaveBeenCalledTimes(2);
  });

  it("uses the calm warning treatment inside fifteen minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T12:00:00Z"));
    render(<Harness expiresAt="2026-08-03T12:10:00Z" onExpired={() => {}} />);
    expect(screen.getByTestId("reservation-countdown").className).toContain("bg-[#fdf3df]");
  });
});
