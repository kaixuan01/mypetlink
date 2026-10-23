// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetListItem, WeeklyRecap } from "@/types";

const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getWeeklyRecap: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/weeklyRecapService", () => ({
  getWeeklyRecap: (...args: unknown[]) => mocks.getWeeklyRecap(...args),
}));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: (...args: unknown[]) => mocks.trackEvent(...args) };
});

const { WeeklyRecapClient } = await import("./WeeklyRecapClient");
const { ApiClientError } = await import("@/services/apiClient");

function pet(id: string, name: string, overrides: Partial<PetListItem> = {}) {
  return {
    id,
    name,
    species: "Cat",
    photoTone: "apricot",
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  } as PetListItem;
}

function recap(overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
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
      total: 2,
      sharedPubliclyCount: 1,
      onlyMeCount: 1,
      items: [
        {
          id: "m1",
          primaryPetId: "milo",
          primaryPetName: "Milo",
          isPrimary: true,
          title: "Sunny nap",
          date: "2026-10-14",
          type: "Funny Moment",
          visibility: "Public",
          hiddenByMyPetLink: false,
          preview: { id: "media1", type: "image", url: "https://media.example.test/a_thumb.jpg" },
          mediaCount: 3,
        },
        {
          id: "m2",
          primaryPetId: "oyen",
          primaryPetName: "Oyen",
          isPrimary: false,
          title: "Box fort",
          date: "2026-10-13",
          type: "Other",
          visibility: "Private",
          hiddenByMyPetLink: false,
          mediaCount: 0,
        },
      ],
    },
    care: {
      hasCareRecords: true,
      logged: {
        total: 1,
        items: [
          { id: "c1", type: "Vaccine", title: "Rabies booster", recordDate: "2026-10-15", loggedAsDone: true },
        ],
      },
      stillDue: {
        total: 1,
        items: [{ id: "c2", type: "Deworming", title: "Deworm", dueDate: "2026-10-16", status: "overdue" }],
      },
      overdueTotal: 3,
      comingUp: {
        total: 5,
        items: [
          { id: "c3", type: "Medication", title: "Pill", dueDate: "2026-10-22", status: "due-today" },
          { id: "c4", type: "Grooming", title: "Bath", dueDate: "2026-10-30", status: "due-soon" },
          { id: "c5", type: "Vet Visit", title: "Checkup", dueDate: "2027-01-10", status: "upcoming" },
        ],
      },
    },
    ...overrides,
  };
}

const quiet = (overrides: Partial<WeeklyRecap> = {}) =>
  recap({
    moments: { total: 0, sharedPubliclyCount: 0, onlyMeCount: 0, items: [] },
    care: {
      hasCareRecords: false,
      logged: { total: 0, items: [] },
      stillDue: { total: 0, items: [] },
      overdueTotal: 0,
      comingUp: { total: 0, items: [] },
    },
    ...overrides,
  });

// The fixtures answer "as of 22 October 2026" (Malaysia). The page compares
// that with its own clock and reads again when the day has moved on, so the
// clock is held at the same day: 10:00 in Malaysia. Only Date is faked;
// timers stay real, and real time comes back after every test.
const FIXTURE_NOW = new Date("2026-10-22T02:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ now: FIXTURE_NOW, toFake: ["Date"] });
  mocks.getPets.mockReset();
  mocks.getWeeklyRecap.mockReset();
  mocks.trackEvent.mockReset();
  mocks.getPets.mockResolvedValue({ data: [pet("milo", "Milo"), pet("oyen", "Oyen")] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function momentCounts() {
  return document.querySelector("[data-recap-moment-counts]")?.textContent;
}

async function open(url: string) {
  window.history.replaceState({}, "", url);
  render(<WeeklyRecapClient />);
  await act(async () => {});
}

describe("Weekly Recap page", () => {
  it("shows the week's Moments with their audience, care and coming-up dates", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo&from=dashboard");

    expect(await screen.findByRole("heading", { level: 1, name: "Milo's week" })).toBeTruthy();
    expect(mocks.getWeeklyRecap).toHaveBeenCalledWith("milo", undefined, expect.anything());
    expect(screen.getByText("12–18 Oct 2026")).toBeTruthy();
    expect(screen.getByText("2 Moments and 1 care record logged this week.")).toBeTruthy();
    expect(momentCounts()).toBe("2 Moments · 1 Shared publicly, 1 Only me");

    const tiles = screen.getAllByRole("link", { name: /Sunny nap|Box fort/ });
    expect(tiles[0].getAttribute("aria-label")).toBe("Sunny nap, Wed 14 Oct, Shared publicly");
    expect(tiles[1].getAttribute("aria-label")).toBe("Box fort, Tue 13 Oct, Only me, With Oyen");
    expect(tiles[1].getAttribute("href")).toBe("/pets/oyen/moments");

    const care = screen.getByRole("region", { name: "Care this week" });
    expect(within(care).getByText("Logged as done")).toBeTruthy();
    expect(within(care).getByText("Still to do from this week")).toBeTruthy();
    expect(within(care).getByText("Was due 16 Oct")).toBeTruthy();
    expect(within(care).getByText(/2 other overdue care dates/)).toBeTruthy();

    const coming = screen.getByRole("region", { name: "Coming up" });
    expect(within(coming).getByText("Due today")).toBeTruthy();
    expect(within(coming).getByText("Due soon")).toBeTruthy();
    expect(within(coming).getByText("Upcoming")).toBeTruthy();
    expect(within(coming).getByText("Due 10 Jan 2027")).toBeTruthy();
    expect(within(coming).getByText("2 more care dates")).toBeTruthy();
    // Only today's item is offered as done; later dates are not nagged.
    expect(within(coming).getAllByRole("link", { name: /as done/ })).toHaveLength(1);

    expect(mocks.trackEvent).toHaveBeenCalledWith("weekly_recap_opened", {
      source: "dashboard",
      recap_state: "has_activity",
    });
  });

  it("never shows a due status twice or on a logged record", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo");
    await screen.findByRole("heading", { level: 1, name: "Milo's week" });

    const logged = document.querySelector("[data-recap-care-logged]")!;
    expect(logged.textContent).not.toMatch(/Overdue|Due today|Due soon|Upcoming/);
    expect(screen.getAllByText("Overdue")).toHaveLength(1);
    expect(screen.getAllByText("Due today")).toHaveLength(1);
  });

  it("moves between weeks within the bounds, keeping the address in step", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    mocks.getWeeklyRecap.mockResolvedValueOnce(
      recap({ weekStart: "2026-10-19", weekEnd: "2026-10-25", isCurrentWeek: true })
    );
    await open("/recap?pet=milo");
    await screen.findByText("12–18 Oct 2026");

    const next = screen.getByRole("button", { name: "Next week, 19 October to 25 October" });
    await act(async () => fireEvent.click(next));

    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", "2026-10-19", expect.anything());
    expect(window.location.search).toBe("?pet=milo&week=2026-10-19");
    expect(await screen.findByText("This week so far")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "This is the latest week" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
    expect(screen.getByRole("status").textContent).toBe("Showing Milo's week, 19 October to 25 October.");
    expect(mocks.trackEvent).toHaveBeenCalledWith("weekly_recap_week_changed", { direction: "next" });
  });

  it("stops at the oldest week a recap can show", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap({ weekStart: "2026-07-27", weekEnd: "2026-08-02" }));
    await open("/recap?pet=milo&week=2026-07-27");
    await screen.findByText("27 Jul – 2 Aug 2026");

    expect(
      (screen.getByRole("button", { name: "No earlier weeks to show" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("switches pets with the chooser and opens that pet's default week", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap({ petId: "oyen", petName: "Oyen" }));
    await open("/recap?pet=milo&week=2026-10-12");
    await screen.findByRole("heading", { level: 1, name: "Milo's week" });

    const chooser = screen.getByRole("group", { name: "Show the week for" });
    expect(within(chooser).getByRole("button", { name: "Milo" }).getAttribute("aria-pressed")).toBe("true");
    await act(async () => fireEvent.click(within(chooser).getByRole("button", { name: "Oyen" })));

    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("oyen", undefined, expect.anything());
    expect(window.location.search).toBe("?pet=oyen");
    expect(await screen.findByRole("heading", { level: 1, name: "Oyen's week" })).toBeTruthy();
  });

  it("offers this week from a quiet last week, with no empty panels", async () => {
    mocks.getWeeklyRecap.mockResolvedValueOnce(quiet());
    mocks.getWeeklyRecap.mockResolvedValueOnce(
      quiet({ weekStart: "2026-10-19", weekEnd: "2026-10-25", isCurrentWeek: true })
    );
    await open("/recap?pet=milo");

    expect(await screen.findByRole("heading", { name: "A quiet week for Milo." })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Moments" })).toBeNull();
    expect(screen.getByText("Log a vet visit, grooming or medicine, and add a next date to see it here.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Add Moment/ }).getAttribute("href")).toBe("/pets/milo/moments?edit=new");
    expect(mocks.trackEvent).toHaveBeenCalledWith("weekly_recap_opened", { source: "direct", recap_state: "quiet" });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "See this week so far" })));
    expect(mocks.getWeeklyRecap).toHaveBeenLastCalledWith("milo", "2026-10-19", expect.anything());
    expect(await screen.findByRole("heading", { name: "Milo's week is just getting started." })).toBeTruthy();
  });

  it("shows a failed read as an error with a retry, never as a quiet week", async () => {
    mocks.getWeeklyRecap.mockRejectedValueOnce(new ApiClientError(503, "database_waking_up", "Busy"));
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap());
    await open("/recap?pet=milo");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn't load Milo's week right now.");
    expect(screen.queryByText(/quiet week/i)).toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledWith("weekly_recap_opened", { source: "direct", recap_state: "error" });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    await screen.findByRole("region", { name: "Moments" });
    expect(momentCounts()).toBe("2 Moments · 1 Shared publicly, 1 Only me");
  });

  it("drops a slow answer for a pet that is no longer shown", async () => {
    let resolveSlow: (value: WeeklyRecap) => void = () => {};
    mocks.getWeeklyRecap.mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)));
    mocks.getWeeklyRecap.mockResolvedValueOnce(recap({ petId: "oyen", petName: "Oyen" }));
    await open("/recap?pet=milo");

    const chooser = await screen.findByRole("group", { name: "Show the week for" });
    await act(async () => fireEvent.click(within(chooser).getByRole("button", { name: "Oyen" })));
    await screen.findByRole("heading", { level: 1, name: "Oyen's week" });
    await act(async () => resolveSlow(recap({ petName: "Milo" })));

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Oyen's week");
  });

  it("puts Lost Mode first", async () => {
    mocks.getPets.mockResolvedValue({ data: [pet("milo", "Milo", { lostModeEnabled: true })] });
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo");
    await screen.findByRole("heading", { level: 1, name: "Milo's week" });

    const root = document.querySelector("[data-recap-root]")!;
    expect(root.querySelector("[data-recap-lost-mode]")).toBe(root.querySelector("a,section,header"));
    expect(screen.getByText("Milo is in Lost Mode")).toBeTruthy();
  });

  it.each([
    ["a memorial pet", [pet("milo", "Milo"), pet("bobo", "Bobo", { lifecycleStatus: "Memorial" })], "bobo", "Weekly recaps are not available for this pet."],
    ["a pet that is not yours", [pet("milo", "Milo")], "stranger", "We couldn't find that pet."],
  ])("explains %s and offers the owner's pets", async (_label, pets, petId, title) => {
    mocks.getPets.mockResolvedValue({ data: pets });
    await open(`/recap?pet=${petId}`);

    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    expect(mocks.getWeeklyRecap).not.toHaveBeenCalled();
    expect(mocks.trackEvent).toHaveBeenCalledWith("weekly_recap_opened", { source: "direct", recap_state: "unavailable" });
    expect(within(screen.getByRole("group", { name: "Show the week for" })).getByRole("button", { name: "Milo" })).toBeTruthy();
  });

  it("explains a recap the server refuses", async () => {
    mocks.getWeeklyRecap.mockRejectedValue(new ApiClientError(422, "weekly_recap_unavailable", "No"));
    await open("/recap?pet=milo");

    expect(await screen.findByRole("heading", { level: 1, name: "Weekly recaps are not available for this pet." })).toBeTruthy();
    expect(mocks.trackEvent).toHaveBeenCalledWith("weekly_recap_opened", { source: "direct", recap_state: "unavailable" });
  });

  it("guides an owner with no active pets", async () => {
    mocks.getPets.mockResolvedValue({ data: [] });
    await open("/recap");

    expect(await screen.findByRole("heading", { level: 1, name: "Add a pet to see its week." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add your first pet" }).getAttribute("href")).toBe("/pets/new");
  });

  it("ignores a week in the address that is not a Monday in range", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo&week=2026-10-14");

    await screen.findByRole("heading", { level: 1, name: "Milo's week" });
    expect(mocks.getWeeklyRecap).toHaveBeenCalledWith("milo", undefined, expect.anything());
  });

  it("states exact totals when the item list is shorter", async () => {
    const base = recap();
    mocks.getWeeklyRecap.mockResolvedValue(
      recap({ moments: { ...base.moments, total: 63, sharedPubliclyCount: 20, onlyMeCount: 43 } })
    );
    await open("/recap?pet=milo");

    expect(await screen.findByText(/Showing the newest 2 of 63 Moments/)).toBeTruthy();
    expect(momentCounts()).toBe("63 Moments · 20 Shared publicly, 43 Only me");
  });

  it("carries no internal wording", async () => {
    mocks.getWeeklyRecap.mockResolvedValue(recap());
    await open("/recap?pet=milo");
    await screen.findByRole("heading", { level: 1, name: "Milo's week" });

    expect(document.body.textContent).not.toMatch(/\b(mock|demo|backend|API|payload|service|frontend)\b/i);
  });
});
