// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetListItem, WeeklyRecap } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getWeeklyRecap: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/weeklyRecapService", () => ({
  getWeeklyRecap: (...args: unknown[]) => mocks.getWeeklyRecap(...args),
}));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: () => {} };
});

const { WeeklyRecapClient, RECAP_REVALIDATE_MIN_INTERVAL_MS } = await import("./WeeklyRecapClient");
const { ApiClientError } = await import("@/services/apiClient");

const pets = [
  { id: "milo", name: "Milo", species: "Cat", photoTone: "apricot", lifecycleStatus: "Active", lostModeEnabled: false, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "oyen", name: "Oyen", species: "Cat", photoTone: "apricot", lifecycleStatus: "Active", lostModeEnabled: false, createdAt: "2025-01-01T00:00:00.000Z" },
] as PetListItem[];

function recap(overrides: Partial<WeeklyRecap> = {}, loggedTitles: string[] = ["Bath"]): WeeklyRecap {
  return {
    petId: "milo",
    petName: "Milo",
    weekStart: "2026-10-12",
    weekEnd: "2026-10-18",
    asOfDate: "2026-10-22",
    isCurrentWeek: false,
    earliestWeekStart: "2026-07-27",
    latestWeekStart: "2026-10-19",
    moments: { total: 0, sharedPubliclyCount: 0, onlyMeCount: 0, items: [] },
    care: {
      hasCareRecords: true,
      logged: {
        total: loggedTitles.length,
        items: loggedTitles.map((title, index) => ({
          id: `log-${index}`,
          type: "Grooming",
          title,
          recordDate: "2026-10-14",
          loggedAsDone: false,
        })),
      },
      stillDue: { total: 0, items: [] },
      overdueTotal: 0,
      comingUp: { total: 0, items: [] },
    },
    ...overrides,
  };
}

let visibility: DocumentVisibilityState = "visible";

async function flush() {
  for (let index = 0; index < 4; index++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await flush();
}

async function open(url: string) {
  window.history.replaceState({}, "", url);
  const view = render(<WeeklyRecapClient />);
  await flush();
  return view;
}

function returnToTab() {
  window.dispatchEvent(new Event("focus"));
  document.dispatchEvent(new Event("visibilitychange"));
}

function readCount() {
  return mocks.getWeeklyRecap.mock.calls.length;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-22T02:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  mocks.getPets.mockReset();
  mocks.getWeeklyRecap.mockReset();
  mocks.getPets.mockResolvedValue({ data: pets });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Weekly Recap revalidation", () => {
  it("reads the same week again when the owner comes back, without clearing the page", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    await open("/recap?pet=milo");
    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", undefined, expect.anything());
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    let resolve: (value: WeeklyRecap) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    window.dispatchEvent(new Event("focus"));
    await flush();

    // The default week the server chose is asked for by its date now, so a
    // Monday turning over cannot move the owner to another week.
    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", "2026-10-12", expect.anything());
    expect(document.querySelector("[data-recap-loading]")).toBeNull();
    expect(screen.getByText("Bath")).toBeTruthy();

    await act(async () => resolve(recap({}, ["Bath", "Rabies booster"])));
    await flush();
    expect(screen.getByText("Rabies booster")).toBeTruthy();
    expect(window.location.search).toBe("?pet=milo");
  });

  it("reads once when focus and visibility arrive together, and not again straight away", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    returnToTab();
    await flush();
    expect(readCount()).toBe(2);

    await advance(500);
    returnToTab();
    await flush();
    expect(readCount()).toBe(2);

    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS);
    returnToTab();
    await flush();
    expect(readCount()).toBe(3);
  });

  it("ignores a return while a read is still on its way", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    mocks.getWeeklyRecap.mockImplementation(() => new Promise(() => {}));
    window.dispatchEvent(new Event("focus"));
    await flush();
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS * 3);
    window.dispatchEvent(new Event("focus"));
    await flush();

    expect(readCount()).toBe(2);
  });

  it("does nothing while the tab is hidden, and reads when it is shown again", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    visibility = "hidden";
    returnToTab();
    await flush();
    expect(readCount()).toBe(1);

    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(readCount()).toBe(2);
  });

  it("reads a page restored from the back-forward cache", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    const restored = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    await flush();

    expect(readCount()).toBe(2);
  });

  it("reads again at Malaysia's midnight while the tab stays open, keeping the week", async () => {
    // Sunday 25 Oct, 23:00 in Malaysia, looking at this week so far.
    vi.setSystemTime(new Date("2026-10-25T15:00:00Z"));
    mocks.getWeeklyRecap.mockResolvedValueOnce(
      recap({ weekStart: "2026-10-19", weekEnd: "2026-10-25", asOfDate: "2026-10-25", isCurrentWeek: true })
    );
    await open("/recap?pet=milo&week=2026-10-19");
    expect(screen.getByText("This week so far")).toBeTruthy();

    mocks.getWeeklyRecap.mockResolvedValueOnce(
      recap({
        weekStart: "2026-10-19",
        weekEnd: "2026-10-25",
        asOfDate: "2026-10-26",
        isCurrentWeek: false,
        earliestWeekStart: "2026-08-03",
        latestWeekStart: "2026-10-26",
      })
    );
    await advance(59 * 60_000);
    expect(readCount()).toBe(1);
    await advance(2 * 60_000);

    expect(readCount()).toBe(2);
    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", "2026-10-19", expect.anything());
    expect(screen.queryByText("This week so far")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Next week, 26 October to 1 November" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("reads at once when the owner returns after midnight, even right after a read", async () => {
    vi.setSystemTime(new Date("2026-10-25T15:59:58Z"));
    mocks.getWeeklyRecap.mockResolvedValue(recap({ asOfDate: "2026-10-25" }));
    await open("/recap?pet=milo");

    // The midnight timer never fired here (a sleeping laptop, say).
    vi.setSystemTime(new Date("2026-10-25T16:00:01Z"));
    window.dispatchEvent(new Event("focus"));
    await flush();

    expect(readCount()).toBe(2);
  });

  it("keeps the week with a note when a refresh fails, and Refresh tries again", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    mocks.getWeeklyRecap.mockRejectedValueOnce(new ApiClientError(503, "database_waking_up", "Busy"));
    window.dispatchEvent(new Event("focus"));
    await flush();

    const note = document.querySelector("[data-recap-refresh-failed]") as HTMLElement;
    expect(note.textContent).toContain("couldn't refresh this week");
    expect(screen.getByText("Bath")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();

    mocks.getWeeklyRecap.mockResolvedValueOnce(recap({}, ["Bath", "Nail trim"]));
    await act(async () => fireEvent.click(within(note).getByRole("button", { name: "Refresh" })));
    await flush();
    expect(screen.getByText("Nail trim")).toBeTruthy();
    expect(document.querySelector("[data-recap-refresh-failed]")).toBeNull();
  });

  it("clears the week when the owner was signed out in the meantime", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    mocks.getWeeklyRecap.mockRejectedValueOnce(new ApiClientError(401, "unauthorized", "Sign in"));
    window.dispatchEvent(new Event("focus"));
    await flush();

    // Signed out: nothing of the owner's stays, not even the pet's name.
    expect(document.querySelector("[data-recap-state=signed-out]")).not.toBeNull();
    expect(screen.queryByText("Bath")).toBeNull();
    expect(document.body.textContent).not.toContain("Milo");
  });

  it("opens the default week when the week shown has left the history window", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap({ weekStart: "2026-07-27", weekEnd: "2026-08-02" }));
    await open("/recap?pet=milo&week=2026-07-27");

    // A week later the oldest week a recap can show is 3 August.
    vi.setSystemTime(new Date("2026-10-29T02:00:00Z"));
    window.dispatchEvent(new Event("focus"));
    await flush();

    expect(window.location.search).toBe("?pet=milo");
    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", undefined, expect.anything());
  });

  it("drops a refresh for a pet that is no longer shown", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    let resolveMilo: (value: WeeklyRecap) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((done) => (resolveMilo = done)));
    window.dispatchEvent(new Event("focus"));
    await flush();

    mocks.getWeeklyRecap.mockResolvedValueOnce(recap({ petId: "oyen", petName: "Oyen" }));
    const chooser = screen.getByRole("group", { name: "Show the week for" });
    await act(async () => fireEvent.click(within(chooser).getByRole("button", { name: "Oyen" })));
    await flush();
    await act(async () => resolveMilo(recap({ petName: "Milo" }, ["Late Milo answer"])));
    await flush();

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Oyen's week");
    expect(screen.queryByText("Late Milo answer")).toBeNull();
  });

  it("stops listening and cancels its read once it is gone", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    const view = await open("/recap?pet=milo");
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);

    let signal: AbortSignal | undefined;
    mocks.getWeeklyRecap.mockImplementationOnce((_pet: string, _week: string, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => {});
    });
    window.dispatchEvent(new Event("focus"));
    await flush();
    view.unmount();

    expect(signal?.aborted).toBe(true);
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS * 2);
    returnToTab();
    await flush();
    expect(readCount()).toBe(2);
  });
});

describe("Weekly Recap across Malaysia's midnight", () => {
  // Sunday 25 Oct 2026, showing this week so far; Monday begins at 16:00Z.
  const sunday = () =>
    recap({ weekStart: "2026-10-19", weekEnd: "2026-10-25", asOfDate: "2026-10-25", isCurrentWeek: true });
  const monday = () =>
    recap({
      weekStart: "2026-10-19",
      weekEnd: "2026-10-25",
      asOfDate: "2026-10-26",
      isCurrentWeek: false,
      earliestWeekStart: "2026-08-03",
      latestWeekStart: "2026-10-26",
    });

  async function openOnSundayNight() {
    vi.setSystemTime(new Date("2026-10-25T15:59:45Z"));
    mocks.getWeeklyRecap.mockResolvedValueOnce(sunday());
    await open("/recap?pet=milo&week=2026-10-19");
    expect(screen.getByText("This week so far")).toBeTruthy();
    await advance(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);
  }

  function pendingRead() {
    let resolve: (value: WeeklyRecap) => void = () => {};
    let reject: (error: unknown) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(
      () => new Promise<WeeklyRecap>((done, fail) => ((resolve = done), (reject = fail)))
    );
    return { resolve: (value: WeeklyRecap) => resolve(value), reject: (error: unknown) => reject(error) };
  }

  it("reads Monday once a Sunday answer that was pending across midnight arrives", async () => {
    await openOnSundayNight();
    const pending = pendingRead();
    window.dispatchEvent(new Event("focus"));
    await flush();
    expect(readCount()).toBe(2);

    // Midnight and its timer pass while that read is still out.
    mocks.getWeeklyRecap.mockResolvedValueOnce(monday());
    await advance(20_000);
    await act(async () => pending.resolve(sunday()));
    await flush();

    expect(readCount()).toBe(3);
    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", "2026-10-19", expect.anything());
    expect(screen.queryByText("This week so far")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Next week, 26 October to 1 November" }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it("does not read again when the pending answer is already Monday's", async () => {
    await openOnSundayNight();
    const pending = pendingRead();
    window.dispatchEvent(new Event("focus"));
    await flush();

    await advance(20_000);
    await act(async () => pending.resolve(monday()));
    await flush();
    await advance(60_000);

    expect(readCount()).toBe(2);
    expect(screen.queryByText("This week so far")).toBeNull();
  });

  it("reads Monday after a refresh that failed across midnight", async () => {
    await openOnSundayNight();
    const pending = pendingRead();
    window.dispatchEvent(new Event("focus"));
    await flush();

    mocks.getWeeklyRecap.mockResolvedValueOnce(monday());
    await advance(20_000);
    await act(async () => pending.reject(new ApiClientError(503, "database_waking_up", "Busy")));
    await flush();

    expect(readCount()).toBe(3);
    expect(screen.queryByText("This week so far")).toBeNull();
  });

  it("reads Monday once when the tab was hidden at midnight and comes back", async () => {
    await openOnSundayNight();
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await advance(20_000);
    expect(readCount()).toBe(1);

    mocks.getWeeklyRecap.mockResolvedValueOnce(monday());
    visibility = "visible";
    returnToTab();
    await flush();

    expect(readCount()).toBe(2);
    expect(screen.queryByText("This week so far")).toBeNull();
  });

  it("reads Monday once when focus, visibility and the timer all arrive together", async () => {
    await openOnSundayNight();
    mocks.getWeeklyRecap.mockResolvedValueOnce(monday());

    await act(async () => {
      vi.setSystemTime(new Date("2026-10-25T16:00:01Z"));
      returnToTab();
      await vi.advanceTimersByTimeAsync(20_000);
    });
    await flush();

    expect(readCount()).toBe(2);
  });

  it("stops after a bounded retry when the server still says Sunday", async () => {
    await openOnSundayNight();
    // The browser's clock runs ahead of the server's.
    mocks.getWeeklyRecap.mockResolvedValue(sunday());
    await advance(60 * 60_000);

    expect(readCount()).toBeLessThanOrEqual(3);
    expect(readCount()).toBeGreaterThanOrEqual(2);
  });

  it("reads nothing more after unmounting while a read is pending across midnight", async () => {
    await openOnSundayNight();
    const pending = pendingRead();
    window.dispatchEvent(new Event("focus"));
    await flush();

    cleanup();
    await advance(20_000);
    await act(async () => pending.resolve(sunday()));
    await flush();

    expect(readCount()).toBe(2);
  });
});
