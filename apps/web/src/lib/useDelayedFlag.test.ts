// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDelayedFlag } from "@/lib/useDelayedFlag";

/**
 * Why a skeleton waits.
 *
 * Measured on the Activity screen against a local API, the placeholder appeared
 * for 38ms — about two frames — and then gave way to "Nothing new yet". That is
 * not a loading state, it is a flash. The delay means a fast answer shows no
 * placeholder at all, while a slow one still gets the reassurance a skeleton
 * exists to provide.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDelayedFlag", () => {
  it("stays false while the wait is shorter than the delay", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 180),
      { initialProps: { active: true } }
    );

    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(result.current).toBe(false);

    // Finished well inside the delay, so no skeleton was ever drawn.
    rerender({ active: false });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
  });

  it("becomes true once the wait is long enough to be worth showing", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 180));

    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe(true);
  });

  it("goes back to false as soon as the wait ends", () => {
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, 180),
      { initialProps: { active: true } }
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  it("is false whenever nothing is being waited for", () => {
    const { result } = renderHook(() => useDelayedFlag(false, 180));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(false);
  });
});
