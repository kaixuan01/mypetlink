// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetListItem, WeeklyRecap } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getWeeklyRecap: vi.fn(),
}));

vi.mock("@/services/apiConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiConfig")>();
  return { ...actual, canUseApi: () => true, isApiConfigured: () => true };
});
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

const SESSION_KEY = "mypetlink_api_auth_session";

const pets = [
  { id: "milo", name: "Milo", species: "Cat", photoTone: "apricot", photoUrl: "https://media.example.test/milo.jpg", lifecycleStatus: "Active", lostModeEnabled: false, createdAt: "2025-01-01T00:00:00.000Z" },
  { id: "oyen", name: "Oyen", species: "Cat", photoTone: "apricot", lifecycleStatus: "Active", lostModeEnabled: false, createdAt: "2025-01-01T00:00:00.000Z" },
] as PetListItem[];

function recap(loggedTitle = "Private bath note title"): WeeklyRecap {
  return {
    petId: "milo",
    petName: "Milo",
    weekStart: "2026-10-12",
    weekEnd: "2026-10-18",
    asOfDate: "2026-10-22",
    isCurrentWeek: false,
    earliestWeekStart: "2026-07-27",
    latestWeekStart: "2026-10-19",
    moments: {
      total: 1,
      sharedPubliclyCount: 0,
      onlyMeCount: 1,
      items: [
        {
          id: "m1",
          primaryPetId: "milo",
          primaryPetName: "Milo",
          isPrimary: true,
          title: "Secret sunny nap",
          date: "2026-10-14",
          type: "Other",
          visibility: "Private",
          hiddenByMyPetLink: false,
          preview: { id: "media1", type: "image", url: "https://media.example.test/a_thumb.jpg" },
          mediaCount: 1,
        },
      ],
    },
    care: {
      hasCareRecords: true,
      logged: {
        total: 1,
        items: [{ id: "c1", type: "Grooming", title: loggedTitle, recordDate: "2026-10-14", loggedAsDone: false }],
      },
      stillDue: { total: 0, items: [] },
      overdueTotal: 0,
      comingUp: { total: 0, items: [] },
    },
  };
}

function signIn(userId = "owner-1") {
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: `access-${userId}`,
      refreshToken: `refresh-${userId}`,
      expiresAt: Date.now() + 3_600_000,
      user: { id: userId, email: "owner@example.test", displayName: "Owner", roles: ["Owner"], status: "Active" },
    })
  );
}

/** What the API client does when a 401 cannot be refreshed: forget the session, then fail. */
function sessionEndsWith(status: 401 | 403) {
  return () => {
    window.localStorage.removeItem(SESSION_KEY);
    return Promise.reject(new ApiClientError(status, status === 401 ? "unauthorized" : "forbidden", "Sign in again"));
  };
}

function logoutInAnotherTab() {
  // As the browser reports it: the event carries the session that was removed.
  const previous = window.localStorage.getItem(SESSION_KEY);
  window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY, oldValue: previous, newValue: null }));
}

function loginInAnotherTab(userId = "owner-1") {
  signIn(userId);
  window.dispatchEvent(
    new StorageEvent("storage", { key: SESSION_KEY, oldValue: null, newValue: window.localStorage.getItem(SESSION_KEY) })
  );
}

async function flush() {
  for (let index = 0; index < 5; index++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }
}

async function openShowingWeek() {
  window.history.replaceState({}, "", "/recap?pet=milo");
  render(<WeeklyRecapClient />);
  await flush();
  expect(screen.getByText("Private bath note title")).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(RECAP_REVALIDATE_MIN_INTERVAL_MS + 1);
  });
}

function returnToTab() {
  window.dispatchEvent(new Event("focus"));
}

/** Nothing about the owner's pets may remain on the page. */
function expectNoPrivateData() {
  const text = document.body.textContent ?? "";
  for (const secret of ["Private bath note title", "Secret sunny nap", "Milo", "Oyen", "Weekly recap"]) {
    expect(text).not.toContain(secret);
  }
  expect(document.querySelector("img")).toBeNull();
  expect(document.querySelector("[data-recap-pet-chooser]")).toBeNull();
  expect(document.querySelector("[data-recap-refresh-failed]")).toBeNull();
  expect(document.querySelector("[data-recap-header]")).toBeNull();
  expect(document.querySelector("[data-recap-state=signed-out]")).not.toBeNull();
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-22T02:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  window.localStorage.clear();
  signIn();
  mocks.getPets.mockReset();
  mocks.getWeeklyRecap.mockReset();
  mocks.getPets.mockResolvedValue({ data: pets });
  mocks.getWeeklyRecap.mockResolvedValue(recap());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("Weekly Recap when the session ends", () => {
  it("clears everything when the pets refresh ends the session and the recap refresh fails with 503", async () => {
    await openShowingWeek();
    mocks.getPets.mockImplementationOnce(sessionEndsWith(401));
    mocks.getWeeklyRecap.mockRejectedValueOnce(new ApiClientError(503, "database_waking_up", "Busy"));

    returnToTab();
    await flush();

    expectNoPrivateData();
  });

  it("clears everything when the pets refresh is refused (403) while the recap succeeds afterwards", async () => {
    await openShowingWeek();
    let resolveRecap: (value: WeeklyRecap) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((done) => (resolveRecap = done)));
    mocks.getPets.mockImplementationOnce(sessionEndsWith(403));

    returnToTab();
    await flush();
    await act(async () => resolveRecap(recap("Late private title")));
    await flush();

    expectNoPrivateData();
    expect(document.body.textContent).not.toContain("Late private title");
  });

  it("clears the pet chooser, names and photos too when only the recap is refused", async () => {
    await openShowingWeek();
    mocks.getWeeklyRecap.mockImplementationOnce(sessionEndsWith(401));

    returnToTab();
    await flush();

    expectNoPrivateData();
  });

  it("clears everything when both reads are refused", async () => {
    await openShowingWeek();
    mocks.getPets.mockImplementationOnce(sessionEndsWith(401));
    mocks.getWeeklyRecap.mockImplementationOnce(sessionEndsWith(401));

    returnToTab();
    await flush();

    expectNoPrivateData();
  });

  it("clears everything at once when the owner signs out in another tab, without reading", async () => {
    await openShowingWeek();
    const reads = mocks.getWeeklyRecap.mock.calls.length + mocks.getPets.mock.calls.length;

    await act(async () => logoutInAnotherTab());
    await flush();

    expectNoPrivateData();
    returnToTab();
    await flush();
    expect(mocks.getWeeklyRecap.mock.calls.length + mocks.getPets.mock.calls.length).toBe(reads);
  });

  it("never lets an answer that was on its way restore the week after sign-out", async () => {
    await openShowingWeek();
    let resolveRecap: (value: WeeklyRecap) => void = () => {};
    let resolvePets: (value: { data: PetListItem[] }) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((done) => (resolveRecap = done)));
    mocks.getPets.mockImplementationOnce(() => new Promise((done) => (resolvePets = done)));
    returnToTab();
    await flush();

    await act(async () => logoutInAnotherTab());
    await act(async () => {
      resolvePets({ data: pets });
      resolveRecap(recap("Late private title"));
    });
    await flush();

    expectNoPrivateData();
  });

  it("keeps the week with a refresh note on an ordinary 503, while still signed in", async () => {
    await openShowingWeek();
    mocks.getWeeklyRecap.mockRejectedValueOnce(new ApiClientError(503, "database_waking_up", "Busy"));

    returnToTab();
    await flush();

    expect(screen.getByText("Private bath note title")).toBeTruthy();
    expect(document.querySelector("[data-recap-refresh-failed]")).not.toBeNull();
    expect(document.querySelector("[data-recap-state=signed-out]")).toBeNull();
  });

  it("recovers normally when the owner signs back in", async () => {
    await openShowingWeek();
    await act(async () => logoutInAnotherTab());
    await flush();
    expectNoPrivateData();

    mocks.getWeeklyRecap.mockResolvedValue(recap("Fresh title after sign-in"));
    await act(async () => loginInAnotherTab());
    await flush();

    expect(screen.getByText("Fresh title after sign-in")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Milo's week");
    expect(document.querySelector("[data-recap-state=signed-out]")).toBeNull();
  });

  it("starts over for a different account signing in, never showing the previous one's week", async () => {
    await openShowingWeek();
    let resolvePets: (value: { data: PetListItem[] }) => void = () => {};
    mocks.getPets.mockImplementationOnce(() => new Promise((done) => (resolvePets = done)));

    await act(async () => loginInAnotherTab("owner-2"));
    await flush();

    expect(document.body.textContent).not.toContain("Private bath note title");
    expect(document.body.textContent).not.toContain("Milo");
    await act(async () => resolvePets({ data: [] }));
    await flush();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Add a pet to see its week.");
  });
  it("treats a queued sign-out then sign-in of the same user as a new session (A2)", async () => {
    await openShowingWeek();
    let resolveRecap: (value: WeeklyRecap) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((done) => (resolveRecap = done)));
    returnToTab();
    await flush();
    const readsBefore = mocks.getWeeklyRecap.mock.calls.length;

    // Another tab signs out and the same owner signs straight back in; both
    // storage events are still queued when this tab looks at storage.
    const retired = window.localStorage.getItem(SESSION_KEY);
    signIn("owner-1");
    const fresh = window.localStorage.getItem(SESSION_KEY);
    mocks.getWeeklyRecap.mockResolvedValue(recap("Fresh session title"));
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY, oldValue: retired, newValue: null }));
      window.dispatchEvent(new StorageEvent("storage", { key: SESSION_KEY, oldValue: null, newValue: fresh }));
      resolveRecap(recap("Retired session response"));
    });
    await flush();

    expect(document.body.textContent).not.toContain("Retired session response");
    expect(mocks.getWeeklyRecap.mock.calls.length).toBeGreaterThan(readsBefore);
    expect(screen.getByText("Fresh session title")).toBeTruthy();
  });

  it("drops a retired session's answer that lands before its sign-out event is processed (A2)", async () => {
    await openShowingWeek();
    let resolveRecap: (value: WeeklyRecap) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((done) => (resolveRecap = done)));
    returnToTab();
    await flush();

    // A new session for the same owner is already stored; its events have not run yet.
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ ...JSON.parse(window.localStorage.getItem(SESSION_KEY)!), sessionId: "new-login", accessToken: "x" })
    );
    await act(async () => resolveRecap(recap("Retired session response")));
    await flush();

    expect(document.body.textContent).not.toContain("Retired session response");
  });
});
