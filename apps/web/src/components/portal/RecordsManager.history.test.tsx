// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import type { CareRecord } from "@/types";

const mocks = vi.hoisted(() => ({
  getPetRecords: vi.fn(),
  getPetRecordsPage: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => true, isApiConfigured: () => true }));
vi.mock("@/services/recordService", () => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  getCareCompletionStatus: vi.fn(),
  getFriendlyRecordErrorMessage: () => "Please try again.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  getPetRecordsPage: (...args: unknown[]) => mocks.getPetRecordsPage(...args),
  updateRecord: vi.fn(),
}));

const { RecordsManager } = await import("./RecordsManager");

function record(index: number): CareRecord {
  return {
    ...mockRecords[0],
    id: `history-${index}`,
    petId: mockPets[0].id,
    type: "Grooming",
    title: `Grooming visit ${index}`,
    dueDate: undefined,
    status: "complete",
    fulfillsCareRecordId: undefined,
  };
}

/** A pet's history, newest first, that can change between page reads. */
function server(initial: CareRecord[]) {
  const state = {
    records: [...initial],
    totalOverride: null as null | ((page: number) => number),
    /** Runs just before a page is answered: history changing between page reads. */
    beforePage: null as null | ((page: number) => void),
  };
  mocks.getPetRecords.mockImplementation(async () => ({
    data: state.records.slice(0, 100),
    meta: { page: 1, pageSize: 100, total: state.records.length },
  }));
  mocks.getPetRecordsPage.mockImplementation(async (_petId: string, page: number, pageSize = 100) => {
    state.beforePage?.(page);
    return {
      records: state.records.slice((page - 1) * pageSize, page * pageSize),
      total: state.totalOverride?.(page) ?? state.records.length,
    };
  });
  return state;
}

const shown = () => screen.queryAllByText(/^Grooming visit \d+$/).map((node) => node.textContent);

beforeEach(() => {
  mocks.getPetRecords.mockReset();
  mocks.getPetRecordsPage.mockReset();
  window.history.replaceState({}, "", `/pets/${mockPets[0].id}/records`);
});

afterEach(() => cleanup());

describe("Care history beyond its first page", () => {
  it("offers the older records the total says exist, and shows every one once", async () => {
    server(Array.from({ length: 130 }, (_, index) => record(index)));
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);

    await screen.findByText("Grooming visit 0");
    expect(screen.queryByText("Grooming visit 100")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show older records (30 more)" }));

    await screen.findByText("Grooming visit 129");
    expect(shown()).toHaveLength(130);
    expect(new Set(shown()).size).toBe(130);
    expect(screen.queryByRole("button", { name: /Show older records/ })).toBeNull();
  }, 30_000);

  it("doesn't skip records when newer ones were deleted between pages", async () => {
    const state = server(Array.from({ length: 130 }, (_, index) => record(index)));
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);
    await screen.findByText("Grooming visit 0");

    // Three records on page one are deleted elsewhere.
    state.records.splice(0, 3);
    fireEvent.click(screen.getByRole("button", { name: /Show older records/ }));

    await screen.findByText("Grooming visit 129");
    expect(shown()).toHaveLength(127);
    // Offset paging alone would have skipped these three.
    for (const kept of ["Grooming visit 103", "Grooming visit 102", "Grooming visit 101"]) {
      expect(screen.getByText(kept)).toBeTruthy();
    }
    expect(screen.queryByText("Grooming visit 0")).toBeNull();
  }, 30_000);

  it("includes a record added before the loaded page, without repeats", async () => {
    const state = server(Array.from({ length: 130 }, (_, index) => record(index)));
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);
    await screen.findByText("Grooming visit 0");

    state.records.unshift(record(999));
    fireEvent.click(screen.getByRole("button", { name: /Show older records/ }));

    await screen.findByText("Grooming visit 129");
    expect(shown()).toHaveLength(131);
    expect(new Set(shown()).size).toBe(131);
  }, 30_000);

  it("says the history changed while loading and offers to reload it", async () => {
    const state = server(Array.from({ length: 150 }, (_, index) => record(index)));
    state.totalOverride = (page) => (page > 1 ? 149 : 150);
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);
    await screen.findByText("Grooming visit 0");

    fireEvent.click(screen.getByRole("button", { name: /Show older records/ }));

    expect(await screen.findByText(/records changed while they were loading/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload records" })).toBeTruthy();
  }, 30_000);

  it("keeps Reload records and a freshness note after equal-total churn between pages", async () => {
    // Five records are archived and five new ones added, newest first, while
    // the two-page history is read: the total stays 150.
    const state = server(Array.from({ length: 150 }, (_, index) => record(index)));
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);
    await screen.findByText("Grooming visit 0");

    let churned = false;
    state.beforePage = (page) => {
      if (page === 2 && !churned) {
        churned = true;
        state.records.splice(0, 5);
        state.records.unshift(...Array.from({ length: 5 }, (_, index) => record(500 + index)));
      }
    };
    fireEvent.click(screen.getByRole("button", { name: /Show older records/ }));
    await screen.findByText("Grooming visit 149");

    expect(screen.queryByRole("button", { name: /Show older records/ })).toBeNull();
    expect(screen.getByText("Records may change while you browse. Reload to check again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload records" })).toBeTruthy();

    // A reload once changes stop shows the current records, and keeps the
    // longer window rather than dropping back to the first page.
    state.beforePage = null;
    fireEvent.click(screen.getByRole("button", { name: "Reload records" }));
    await screen.findByText("Grooming visit 504");
    await waitFor(() => expect(shown()).toHaveLength(150));
    expect(screen.queryByText("Grooming visit 0")).toBeNull();
    expect(screen.getByText("Grooming visit 100")).toBeTruthy();
  }, 30_000);

  it("shows no freshness note or reload for a single-page history", async () => {
    server(Array.from({ length: 3 }, (_, index) => record(index)));
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);

    await screen.findByText("Grooming visit 2");
    expect(screen.queryByText(/Records may change/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Reload records" })).toBeNull();
  });

  it("shows no button when everything fits on the first page", async () => {
    server([record(1)]);
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);

    await screen.findByText("Grooming visit 1");
    expect(screen.queryByRole("button", { name: /Show older records/ })).toBeNull();
  });

  it("says when older records couldn't be loaded", async () => {
    server(Array.from({ length: 150 }, (_, index) => record(index)));
    mocks.getPetRecordsPage.mockRejectedValue(new Error("down"));
    render(<RecordsManager initialRecords={[]} petId={mockPets[0].id} />);

    fireEvent.click(await screen.findByRole("button", { name: "Show older records (50 more)" }));

    await waitFor(() => expect(screen.getByText(/couldn't load more records/)).toBeTruthy());
  });
});
