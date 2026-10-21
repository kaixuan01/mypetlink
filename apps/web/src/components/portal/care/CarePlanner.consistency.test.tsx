// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { getMalaysiaTodayIsoDate } from "@/lib/careRecordStatus";
import type { PetListItem, UpcomingCareItem, UpcomingCareSummary } from "@/types";

/**
 * The planner's reads under change: responses that settle late or out of
 * order, a list that changes between page reads, and a summary and list read
 * at different moments. What it shows must belong to the selected pets, must
 * not hide pending care, and must never claim "all clear" against rows it has.
 */
const mocks = vi.hoisted(() => ({
  getPets: vi.fn(),
  getUpcomingCarePage: vi.fn(),
  getUpcomingCareSummary: vi.fn(),
  completeCareItem: vi.fn(),
}));

vi.mock("@/services/petService", () => ({ getPets: (...args: unknown[]) => mocks.getPets(...args) }));
vi.mock("@/services/recordService", () => ({
  getUpcomingCarePage: (...args: unknown[]) => mocks.getUpcomingCarePage(...args),
  getUpcomingCareSummary: (...args: unknown[]) => mocks.getUpcomingCareSummary(...args),
  completeCareItem: (...args: unknown[]) => mocks.completeCareItem(...args),
}));

const { CarePlanner } = await import("./CarePlanner");

const today = getMalaysiaTodayIsoDate();
const milo = { ...mockPets[0], id: "pet-milo", name: "Milo", lifecycleStatus: "Active" } as PetListItem;
const oyen = { ...mockPets[1], id: "pet-oyen", name: "Oyen", lifecycleStatus: "Active" } as PetListItem;

function item(id: string, pet: PetListItem, overrides: Partial<UpcomingCareItem> = {}): UpcomingCareItem {
  return {
    id,
    petId: pet.id,
    petName: pet.name,
    type: "Vaccine",
    title: `Care ${id}`,
    dueDate: "02 Nov 2026",
    dueDateIso: "2026-11-02",
    status: "due-soon",
    ...overrides,
  };
}

type Query = { page?: number; pageSize?: number; petId?: string };

/**
 * A server whose pending list can change between requests. `hold` makes
 * matching page requests wait until released, to settle them late.
 */
function server(initial: UpcomingCareItem[]) {
  const state = {
    items: [...initial],
    asOfDate: today,
    summaryAsOf: today,
    summaryOverride: null as null | (() => UpcomingCareSummary),
    totalOverride: null as null | ((query: Query) => number | undefined),
    hold: null as null | ((query: Query) => boolean),
    held: [] as Array<() => void>,
    failNext: null as null | ((query: Query) => boolean),
    /** Runs just before a page is answered: data changing between page reads. */
    beforePage: null as null | ((query: Query) => void),
  };

  function respond(query: Query) {
    const page = query.page ?? 1;
    const size = query.pageSize ?? 100;
    const scoped = query.petId ? state.items.filter((entry) => entry.petId === query.petId) : state.items;
    return {
      data: {
        asOfDate: state.asOfDate,
        petIdsWithCareRecords: [...new Set(state.items.map((entry) => entry.petId))],
        items: scoped.slice((page - 1) * size, page * size),
      },
      meta: { page, pageSize: size, total: state.totalOverride?.(query) ?? scoped.length },
    };
  }

  mocks.getUpcomingCarePage.mockImplementation((query: Query = {}) => {
    if (state.failNext?.(query)) {
      state.failNext = null;
      return Promise.reject(new Error("down"));
    }
    state.beforePage?.(query);
    const snapshot = respond(query);
    if (state.hold?.(query)) {
      return new Promise((resolve) => state.held.push(() => resolve(snapshot)));
    }
    return Promise.resolve(snapshot);
  });

  mocks.getUpcomingCareSummary.mockImplementation(async () => {
    if (state.summaryOverride) return state.summaryOverride();
    const scope = (petId: string | null) => {
      const scoped = petId ? state.items.filter((entry) => entry.petId === petId) : state.items;
      return {
        petId,
        hasCareRecords: scoped.length > 0 || state.items.length > 0,
        pendingCount: scoped.length,
        dueWithinHorizonCount: scoped.filter((entry) => entry.status !== "upcoming").length,
        overdueCount: scoped.filter((entry) => entry.status === "overdue").length,
        items: [],
      };
    };
    return {
      asOfDate: state.summaryAsOf,
      horizonDate: "2026-11-19",
      complete: true,
      scopes: [scope(null), scope(milo.id), scope(oyen.id)],
    } satisfies UpcomingCareSummary;
  });

  return {
    state,
    releaseHeld: async () => {
      const pending = state.held.splice(0);
      await act(async () => {
        pending.forEach((release) => release());
      });
    },
  };
}

const rows = () => [...document.querySelectorAll("[data-care-planner-item]")].map((node) => node.getAttribute("data-care-planner-item"));
const doneButtons = () => screen.queryAllByRole("button", { name: /^Mark .* as done$/ });

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getPets.mockResolvedValue({ data: [milo, oyen] });
  window.history.replaceState({}, "", "/records");
});

afterEach(() => cleanup());

describe("F1 — a late read never crosses the pet filter", () => {
  it("drops an all-pets Show more that settles after switching to one pet (the review's reproducer)", async () => {
    const all = [
      ...Array.from({ length: 100 }, (_, index) => item(`m-${String(index).padStart(3, "0")}`, milo)),
      item("o-1", oyen),
    ];
    const { state, releaseHeld } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care m-000");

    // Show more for all pets is held; the owner switches to Oyen.
    state.hold = (query) => !query.petId;
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
    await waitFor(() => expect(state.held.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Oyen" }));
    await screen.findByText("Care o-1");

    await releaseHeld();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(rows()).toEqual(["o-1"]);
    expect(doneButtons()).toHaveLength(1);
    expect(doneButtons()[0].getAttribute("aria-label")).toContain("for Oyen");
    expect(screen.queryByText(/Show more care dates/)).toBeNull();
  });

  it("shows the last selection after rapid switching with out-of-order responses", async () => {
    const { state, releaseHeld } = server([item("m-1", milo), item("o-1", oyen)]);
    render(<CarePlanner />);
    await screen.findByText("Care m-1");

    state.hold = (query) => query.petId === milo.id || query.petId === oyen.id;
    fireEvent.click(screen.getByRole("button", { name: "Milo" }));
    fireEvent.click(screen.getByRole("button", { name: "Oyen" }));
    state.hold = null;
    fireEvent.click(screen.getByRole("button", { name: "All pets" }));
    await waitFor(() => expect(rows()).toEqual(["m-1", "o-1"]));

    await releaseHeld();

    expect(rows()).toEqual(["m-1", "o-1"]);
  });

  it("lets a refresh overtake a Show more, and ignores the older one's rows and error", async () => {
    const all = Array.from({ length: 60 }, (_, index) => item(`m-${String(index).padStart(3, "0")}`, milo));
    const { state, releaseHeld } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care m-000");

    state.hold = () => true;
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
    await waitFor(() => expect(state.held.length).toBeGreaterThan(0));

    // Another tab completed most items; the owner refreshes.
    state.items.splice(5);
    state.hold = null;
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(rows()).toHaveLength(5));

    await releaseHeld();

    expect(rows()).toHaveLength(5);
    expect(screen.queryByText(/couldn't load/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Loading..." })).toBeNull();
  });

  it("ignores an older read's failure after a newer read succeeded", async () => {
    const all = Array.from({ length: 60 }, (_, index) => item(`m-${index}`, milo));
    const { state } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care m-0");

    let fail: (() => void) | undefined;
    mocks.getUpcomingCarePage.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { fail = () => reject(new Error("down")); })
    );
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
    // The older read's request is on its way before the refresh starts.
    await waitFor(() => expect(fail).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(rows()).toHaveLength(50));

    await act(async () => fail?.());

    expect(screen.queryByText(/couldn't/)).toBeNull();
    expect(rows()).toHaveLength(50);
    expect(state.items).toHaveLength(60);
  });

  it("does nothing when a read settles after the planner is gone", async () => {
    const { state, releaseHeld } = server([item("m-1", milo)]);
    state.hold = () => true;
    const view = render(<CarePlanner />);
    await waitFor(() => expect(state.held.length).toBeGreaterThan(0));
    view.unmount();

    await expect(releaseHeld()).resolves.toBeUndefined();
  });
});

describe("F4 — paging never silently stops while pending care remains", () => {
  it("shows every remaining item after five earlier ones are completed between pages (the review's reproducer)", async () => {
    const all = Array.from({ length: 105 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    const { state } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");
    expect(rows()).toHaveLength(50);

    // Another device completes the first five.
    state.items.splice(0, 5);
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));

    await waitFor(() => expect(rows()).toHaveLength(100));
    expect(rows()).toContain("a-050");
    expect(rows()).toContain("a-054");
    expect(rows()).not.toContain("a-000");
    expect(rows()).toEqual(state.items.slice(0, 100).map((entry) => entry.id));
  });

  it("includes an item inserted before the loaded window, without repeats", async () => {
    const all = Array.from({ length: 60 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    const { state } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");

    state.items.unshift(item("new-first", milo, { status: "overdue" }));
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));

    await waitFor(() => expect(rows()).toHaveLength(61));
    expect(rows()).toContain("new-first");
    expect(new Set(rows()).size).toBe(61);
  });

  it("follows a due date edit that moves an item, showing it once", async () => {
    const all = Array.from({ length: 60 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    const { state } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");

    const [moved] = state.items.splice(2, 1);
    state.items.push({ ...moved, dueDate: "14 Jan 2027", dueDateIso: "2027-01-14", status: "upcoming" });
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));

    await waitFor(() => expect(rows()).toHaveLength(60));
    expect(rows().filter((id) => id === moved.id)).toHaveLength(1);
    expect(rows().at(-1)).toBe(moved.id);
  });

  it("says the list may be out of date, and offers Refresh, when page reads disagree", async () => {
    const all = Array.from({ length: 150 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    const { state } = server(all);
    // Every read of a later page reports another total: the list keeps changing.
    state.totalOverride = (query) => ((query.page ?? 1) > 1 ? 149 : undefined);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");

    // Reads past the first hundred reach the disagreeing pages.
    for (let click = 0; click < 3 && !screen.queryByText(/changed while loading/); click += 1) {
      const more = screen.queryByRole("button", { name: /Show more care dates/ });
      if (!more) break;
      fireEvent.click(more);
      await waitFor(() => expect(mocks.getUpcomingCarePage.mock.calls.length).toBeGreaterThan(click + 1));
    }

    expect(await screen.findByText(/changed while loading/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.queryByText(/No pending care/)).toBeNull();
  });

  it("still reads past five hundred items", async () => {
    const all = Array.from({ length: 520 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    server(all);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");

    while (screen.queryByRole("button", { name: /Show more care dates/ })) {
      const before = rows().length;
      fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
      await waitFor(() => expect(rows().length).toBeGreaterThan(before));
    }

    expect(rows()).toHaveLength(520);
    expect(new Set(rows()).size).toBe(520);
  }, 120_000);
});

describe("Final F4 — a multi-page list is presented as a best-effort live list", () => {
  it("qualifies an exhausted list after equal-total churn between pages, and Refresh shows the current one", async () => {
    // The review's sequence: 150 due-soon items; while the 150-item window is
    // read, the first five are completed and each creates a later next-due
    // item, between page 1 and page 2. Total, day and categories don't change.
    const all = Array.from({ length: 150 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    const { state } = server(all);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
    await waitFor(() => expect(rows()).toHaveLength(100));

    let churned = false;
    state.beforePage = (query) => {
      if ((query.page ?? 1) === 2 && !churned) {
        churned = true;
        state.items.splice(0, 5);
        state.items.push(...Array.from({ length: 5 }, (_, index) => item(`next-${index}`, milo)));
      }
    };
    fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
    await waitFor(() => expect(rows()).toHaveLength(150));

    // Nothing more to load, but the list is not presented as verified-complete.
    expect(screen.queryByRole("button", { name: /Show more care dates/ })).toBeNull();
    expect(screen.getByText("Care dates may change while you're browsing. Refresh to check the latest list.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh the list" })).toBeTruthy();
    // Counts aren't shown beside rows read across pages.
    expect(document.querySelector("[data-care-group-count]")).toBeNull();
    expect(screen.queryByText(/No pending care|No care records yet/)).toBeNull();

    // Once changes stop, Refresh reads the current list.
    state.beforePage = null;
    fireEvent.click(screen.getByRole("button", { name: "Refresh the list" }));
    await waitFor(() => expect(rows()).toContain("a-100"));
    expect(rows()).toEqual(state.items.map((entry) => entry.id));
    expect(rows()).not.toContain("a-000");
  });

  it("keeps the freshness note distinct from the stronger changed-while-loading warning", async () => {
    const all = Array.from({ length: 150 }, (_, index) => item(`a-${String(index).padStart(3, "0")}`, milo));
    const { state } = server(all);
    state.totalOverride = (query) => ((query.page ?? 1) > 1 ? 149 : undefined);
    render(<CarePlanner />);
    await screen.findByText("Care a-000");
    for (let click = 0; click < 2; click += 1) {
      fireEvent.click(screen.getByRole("button", { name: /Show more care dates/ }));
      await waitFor(() => expect(screen.queryByRole("button", { name: "Loading..." })).toBeNull());
    }

    expect(await screen.findByText("Some care dates changed while loading. Refresh to check again.")).toBeTruthy();
  });

  it("shows exact counts and no freshness note for a list read in one request", async () => {
    server([item("m-1", milo), item("m-2", milo)]);
    render(<CarePlanner />);

    await screen.findByText("Care m-2");
    expect(document.querySelector("[data-care-group-count]")?.textContent).toBe("2");
    expect(screen.queryByText(/may change while you're browsing/)).toBeNull();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
  });
});

describe("F5 — the summary never hides rows the list returned", () => {
  it("shows a pending item returned after an empty summary (the review's reproducer)", async () => {
    const { state } = server([]);
    // The summary was read before the item was created.
    state.summaryOverride = () => ({
      asOfDate: today,
      horizonDate: "2026-11-19",
      complete: true,
      scopes: [{ petId: null, hasCareRecords: false, pendingCount: 0, dueWithinHorizonCount: 0, overdueCount: 0, items: [] }],
    });
    state.items.push(item("new-1", milo));
    render(<CarePlanner />);

    expect(await screen.findByText("Care new-1")).toBeTruthy();
    expect(screen.queryByText("No care records yet.")).toBeNull();
    expect(screen.queryByText("No pending care dates.")).toBeNull();
    // Counts from a summary that disagrees are not shown as if exact.
    expect(document.querySelector("[data-care-group-count]")).toBeNull();
  });

  it("never shows all clear when the summary still counts pending care the list no longer has", async () => {
    const { state } = server([]);
    state.summaryOverride = () => ({
      asOfDate: today,
      horizonDate: "2026-11-19",
      complete: true,
      scopes: [{ petId: null, hasCareRecords: true, pendingCount: 3, dueWithinHorizonCount: 3, overdueCount: 0, items: [] }],
    });
    render(<CarePlanner />);

    expect(await screen.findByText(/changed while loading/)).toBeTruthy();
    expect(screen.queryByText("No pending care dates.")).toBeNull();
    expect(screen.queryByText("No care records yet.")).toBeNull();
  });

  it("reads again when the summary and list straddle Malaysia midnight, and settles", async () => {
    const { state } = server([item("m-1", milo)]);
    let calls = 0;
    mocks.getUpcomingCareSummary.mockImplementation(async () => {
      calls += 1;
      return {
        asOfDate: calls === 1 ? "2026-10-20" : today,
        horizonDate: "2026-11-19",
        complete: true,
        scopes: [{ petId: null, hasCareRecords: true, pendingCount: 1, dueWithinHorizonCount: 1, overdueCount: 0, items: [] }],
      };
    });
    render(<CarePlanner />);

    await screen.findByText("Care m-1");
    await waitFor(() => expect(document.querySelector("[data-care-group-count]")?.textContent).toBe("1"));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/changed while loading/)).toBeNull();
    expect(state.items).toHaveLength(1);
  });

  it("shows the rows when only the summary failed, without counts", async () => {
    server([item("m-1", milo)]);
    mocks.getUpcomingCareSummary.mockRejectedValue(new Error("down"));
    render(<CarePlanner />);

    expect(await screen.findByText("Care m-1")).toBeTruthy();
    expect(screen.getByText(/totals aren't available/i)).toBeTruthy();
    expect(document.querySelector("[data-care-group-count]")).toBeNull();
  });

  it("hides counts that disagree with the rows", async () => {
    const { state } = server([item("m-1", milo), item("m-2", milo)]);
    state.summaryOverride = () => ({
      asOfDate: today,
      horizonDate: "2026-11-19",
      complete: true,
      scopes: [{ petId: null, hasCareRecords: true, pendingCount: 5, dueWithinHorizonCount: 5, overdueCount: 0, items: [] }],
    });
    render(<CarePlanner />);

    await screen.findByText("Care m-2");
    expect(document.querySelector("[data-care-group-count]")).toBeNull();
    expect(screen.getByText(/changed while loading/)).toBeTruthy();
  });

  it("shows a stable empty scope as empty", async () => {
    const { state } = server([]);
    state.summaryOverride = () => ({
      asOfDate: today,
      horizonDate: "2026-11-19",
      complete: true,
      scopes: [{ petId: null, hasCareRecords: true, pendingCount: 0, dueWithinHorizonCount: 0, overdueCount: 0, items: [] }],
    });
    // The list knows the pets have care records.
    mocks.getUpcomingCarePage.mockResolvedValue({
      data: { asOfDate: today, petIdsWithCareRecords: [milo.id], items: [] },
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    render(<CarePlanner />);

    expect(await screen.findByText("No pending care dates.")).toBeTruthy();
  });
});
