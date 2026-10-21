// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { ApiClientError } from "@/services/apiClient";
import { getMalaysiaTodayIsoDate } from "@/lib/careRecordStatus";
import type { CareCompletionInput, PetListItem, UpcomingCareItem, UpcomingCareSummary } from "@/types";

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

const { CarePlanner, PLANNER_PAGE_SIZE } = await import("./CarePlanner");

const today = getMalaysiaTodayIsoDate();
const oyen = { ...mockPets[0], id: "pet-oyen", name: "Oyen", lifecycleStatus: "Active" } as PetListItem;
const mochi = { ...mockPets[1], id: "pet-mochi", name: "Mochi", lifecycleStatus: "Active" } as PetListItem;

function item(index: number, overrides: Partial<UpcomingCareItem> = {}): UpcomingCareItem {
  return {
    id: `item-${index}`,
    petId: oyen.id,
    petName: "Oyen",
    type: "Vaccine",
    title: `Booster ${index}`,
    dueDate: "02 Nov 2026",
    dueDateIso: "2026-11-02",
    status: "due-soon",
    ...overrides,
  };
}

function summary(scopes: Partial<Record<"all" | string, { pending: number; within: number; overdue: number; records?: boolean }>>): UpcomingCareSummary {
  return {
    asOfDate: today,
    horizonDate: "2026-11-19",
    complete: true,
    scopes: Object.entries(scopes).map(([petId, counts]) => ({
      petId: petId === "all" ? null : petId,
      hasCareRecords: counts!.records ?? true,
      pendingCount: counts!.pending,
      dueWithinHorizonCount: counts!.within,
      overdueCount: counts!.overdue,
      items: [],
    })),
  };
}

/** A server holding `all` pending items, paged like the real endpoint. */
function serve(all: UpcomingCareItem[]) {
  mocks.getUpcomingCarePage.mockImplementation(async ({ page = 1, pageSize = 100, petId }: { page?: number; pageSize?: number; petId?: string }) => {
    const scoped = petId ? all.filter((entry) => entry.petId === petId) : all;
    return {
      data: { asOfDate: today, petIdsWithCareRecords: [oyen.id, mochi.id], items: scoped.slice((page - 1) * pageSize, page * pageSize) },
      meta: { page, pageSize, total: scoped.length },
    };
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getPets.mockResolvedValue({ data: [oyen, mochi] });
  window.history.replaceState({}, "", "/records");
});

afterEach(() => cleanup());

describe("The care planner", () => {
  it("groups pending care into overdue, due soon and later, with exact counts", async () => {
    serve([
      item(1, { status: "overdue", dueDate: "12 Oct 2026" }),
      item(2, { petId: mochi.id, petName: "Mochi" }),
      item(3, { status: "upcoming", dueDate: "14 Jan 2027" }),
    ]);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 3, within: 2, overdue: 1 } }));

    render(<CarePlanner />);

    const overdue = await screen.findByRole("region", { name: /Overdue/ });
    expect(within(overdue).getByText("Booster 1")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /Due soon/ })).getByText("Booster 2")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: /Later/ })).getByText("Booster 3")).toBeTruthy();
    expect(within(overdue).getByText("1", { selector: "[data-care-group-count]" })).toBeTruthy();
    // All pets: each row names its pet.
    expect(screen.getByText("Mochi", { selector: "span[title]" })).toBeTruthy();
  });

  it("reads every pending item page by page, beyond the first hundred and the first five hundred", async () => {
    const all = Array.from({ length: 520 }, (_, index) => item(index, { title: `Care ${index}` }));
    serve(all);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 520, within: 520, overdue: 0 } }));
    render(<CarePlanner />);

    await screen.findByText("Care 0");
    expect(screen.queryByText(`Care ${PLANNER_PAGE_SIZE}`)).toBeNull();
    for (let loaded = PLANNER_PAGE_SIZE; loaded < 520; loaded += PLANNER_PAGE_SIZE) {
      fireEvent.click(await screen.findByRole("button", { name: `Show more care dates (${520 - loaded} more)` }));
      await screen.findByText(`Care ${Math.min(loaded + PLANNER_PAGE_SIZE, 520) - 1}`);
    }

    expect(screen.getByText("Care 519")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show more care dates/ })).toBeNull();
    expect(document.querySelectorAll("[data-care-planner-item]")).toHaveLength(520);
  }, 60_000);

  it("narrows to one pet, keeps the choice in the address, and asks the server for that pet only", async () => {
    serve([item(1), item(2, { petId: mochi.id, petName: "Mochi" })]);
    mocks.getUpcomingCareSummary.mockResolvedValue(
      summary({ all: { pending: 2, within: 2, overdue: 0 }, [oyen.id]: { pending: 1, within: 1, overdue: 0 }, [mochi.id]: { pending: 1, within: 1, overdue: 0 } })
    );
    render(<CarePlanner />);
    await screen.findByText("Booster 2");

    fireEvent.click(screen.getByRole("button", { name: "Mochi" }));

    await waitFor(() => expect(screen.queryByText("Booster 1")).toBeNull());
    expect(screen.getByText("Booster 2")).toBeTruthy();
    expect(mocks.getUpcomingCarePage).toHaveBeenLastCalledWith(expect.objectContaining({ petId: mochi.id }));
    expect(window.location.search).toBe(`?pet=${mochi.id}`);
  });

  it.each([
    ["no care records", { all: { pending: 0, within: 0, overdue: 0, records: false } }, "No care records yet."],
    ["nothing pending", { all: { pending: 0, within: 0, overdue: 0 } }, "No pending care dates."],
  ])("says so when there are %s", async (_label, scopes, text) => {
    serve([]);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary(scopes));
    // Which pets have any care records comes with the list read.
    const records = (scopes.all as { records?: boolean } | undefined)?.records !== false;
    mocks.getUpcomingCarePage.mockResolvedValue({
      data: { asOfDate: today, petIdsWithCareRecords: records ? [oyen.id] : [], items: [] },
      meta: { page: 1, pageSize: 100, total: 0 },
    });
    render(<CarePlanner />);

    expect(await screen.findByText(text)).toBeTruthy();
  });

  it("never shows a failed read as nothing due, and can try again", async () => {
    serve([item(1)]);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 1, within: 1, overdue: 0 } }));
    const page = mocks.getUpcomingCarePage.getMockImplementation()!;
    mocks.getUpcomingCarePage.mockImplementationOnce(() => Promise.reject(new Error("down"))).mockImplementation(page);
    render(<CarePlanner />);

    expect(await screen.findByText("We couldn't load care dates right now.")).toBeTruthy();
    expect(screen.queryByText(/No pending care/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Booster 1")).toBeTruthy();
  });

  it("reads again when the window comes back, so other tabs and a new day show up", async () => {
    const all = [item(1)];
    serve(all);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 1, within: 1, overdue: 0 } }));
    render(<CarePlanner />);
    await screen.findByText("Booster 1");

    all.splice(0, 1);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 0, within: 0, overdue: 0 } }));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(await screen.findByText("No pending care dates.")).toBeTruthy();
  });
});

describe("Mark as done from the planner", () => {
  async function openDone() {
    const all = [item(1, { status: "overdue", dueDate: "12 Oct 2026" })];
    serve(all);
    mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 1, within: 1, overdue: 1 } }));
    render(<CarePlanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark Booster 1 for Oyen as done" }));
    await screen.findByRole("dialog", { name: "Mark as done" });
    return all;
  }

  const sentInputs = () => mocks.completeCareItem.mock.calls.map((call) => call[1] as CareCompletionInput);

  it("logs it once with Malaysia's today, shows the result and refreshes the counts", async () => {
    const all = await openDone();
    expect((screen.getByLabelText("Done on") as HTMLInputElement).value).toBe(today);
    mocks.completeCareItem.mockImplementation(async () => {
      all.splice(0, 1);
      mocks.getUpcomingCareSummary.mockResolvedValue(summary({ all: { pending: 0, within: 0, overdue: 0 } }));
      return { outcome: "created", completion: { id: "done", dueDate: undefined } };
    });

    const save = screen.getByRole("button", { name: "Save as done" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(await screen.findByText("Booster 1 is logged as done for Oyen.")).toBeTruthy();
    expect(mocks.completeCareItem).toHaveBeenCalledOnce();
    expect(mocks.completeCareItem).toHaveBeenCalledWith("item-1", expect.objectContaining({ completedOn: today }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("No pending care dates.")).toBeTruthy();
  });

  it("after an unknown outcome, keeps the details and retries the very same request", async () => {
    await openDone();
    fireEvent.change(screen.getByLabelText("Next due date (optional)"), { target: { value: "2027-10-12" } });
    mocks.completeCareItem
      .mockRejectedValueOnce(new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now."))
      .mockResolvedValueOnce({ outcome: "replayed", completion: { id: "done", dueDate: "12 Oct 2027", fulfillsCareRecordId: "item-1" } });

    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
    expect(await screen.findByText(/We couldn't confirm this yet/)).toBeTruthy();
    expect((screen.getByLabelText("Next due date (optional)") as HTMLInputElement).matches(":disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Booster 1 is logged as done for Oyen. Next due 12 Oct 2027.")).toBeTruthy();
    const [first, retry] = sentInputs();
    expect(retry).toEqual(first);
    expect(first.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ["care_item_completed", "This care item was already logged as done."],
    ["care_item_archived", "This care item was deleted, so it can't be logged as done."],
    ["care_item_no_due_date", "This care item no longer has a due date, so there's nothing to log as done."],
  ])("explains a %s refusal and offers no second save", async (code, text) => {
    await openDone();
    mocks.completeCareItem.mockRejectedValue(new ApiClientError(409, code, "Refused"));

    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));

    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save as done|Try again/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("shows field problems and sends a corrected request under a new key", async () => {
    await openDone();
    mocks.completeCareItem
      .mockRejectedValueOnce(new ApiClientError(400, "validation_failed", "Check", { completedOn: ["The day this care was done can't be in the future."] }))
      .mockResolvedValueOnce({ outcome: "created", completion: { id: "done" } });

    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
    expect(await screen.findByText("The day this care was done can't be in the future.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));

    await screen.findByText("Booster 1 is logged as done for Oyen.");
    const [first, second] = sentInputs();
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("checks the dates before sending anything", async () => {
    await openDone();
    fireEvent.change(screen.getByLabelText("Next due date (optional)"), { target: { value: "2000-01-01" } });

    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));

    expect(await screen.findByText("The next due date can't be before the day it was done.")).toBeTruthy();
    expect(mocks.completeCareItem).not.toHaveBeenCalled();
  });

  it("can't be dismissed while the request is on its way", async () => {
    await openDone();
    let finish: ((value: unknown) => void) | undefined;
    mocks.completeCareItem.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
    await screen.findByRole("button", { name: "Saving..." });
    fireEvent.keyDown(document, { key: "Escape" });

    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("dialog", { name: "Mark as done" })).toBeTruthy();
    await act(async () => finish?.({ outcome: "created", completion: { id: "done" } }));
  });
});
