// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { ApiClientError } from "@/services/apiClient";
import { getMalaysiaTodayIsoDate } from "@/lib/careRecordStatus";
import type { CareCompletionInput, PetListItem, UpcomingCareItem } from "@/types";

/**
 * F2: one completion attempt — its frozen details and its key — belongs to
 * the page, not to the dialog. Closing the dialog after an unknown outcome
 * keeps it to review and retry; nothing lets the owner leave a request that
 * is still on its way; and an unsent draft is never dropped silently.
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
const oyen = { ...mockPets[0], id: "pet-oyen", name: "Oyen", lifecycleStatus: "Active" } as PetListItem;
const target: UpcomingCareItem = {
  id: "item-1",
  petId: oyen.id,
  petName: "Oyen",
  type: "Vaccine",
  title: "Rabies booster",
  dueDate: "12 Oct 2026",
  dueDateIso: "2026-10-12",
  status: "overdue",
};

const dropped = () => new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now.");
const sent = () => mocks.completeCareItem.mock.calls.map((call) => call[1] as CareCompletionInput);

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getPets.mockResolvedValue({ data: [oyen] });
  mocks.getUpcomingCareSummary.mockResolvedValue({
    asOfDate: today,
    horizonDate: "2026-11-19",
    complete: true,
    scopes: [
      { petId: null, hasCareRecords: true, pendingCount: 1, dueWithinHorizonCount: 1, overdueCount: 1, items: [] },
      { petId: oyen.id, hasCareRecords: true, pendingCount: 1, dueWithinHorizonCount: 1, overdueCount: 1, items: [] },
    ],
  });
  mocks.getUpcomingCarePage.mockResolvedValue({
    data: { asOfDate: today, petIdsWithCareRecords: [oyen.id], items: [target] },
    meta: { page: 1, pageSize: 100, total: 1 },
  });
  window.history.replaceState({}, "", "/records");
});

afterEach(() => cleanup());

async function openDone() {
  render(<CarePlanner />);
  fireEvent.click(await screen.findByRole("button", { name: "Mark Rabies booster for Oyen as done" }));
  await screen.findByRole("dialog", { name: "Mark as done" });
}

function fill() {
  fireEvent.change(screen.getByLabelText("Next due date (optional)"), { target: { value: "2027-10-12" } });
  fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Booster went well" } });
}

async function failUnknown() {
  mocks.completeCareItem.mockRejectedValueOnce(dropped());
  fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
  await screen.findByText(/We couldn't confirm this yet/);
}

describe("A completion attempt outlives its dialog", () => {
  it("can't switch to the full form while the request is on its way", async () => {
    await openDone();
    fill();
    let finish: ((value: unknown) => void) | undefined;
    mocks.completeCareItem.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
    await screen.findByRole("button", { name: "Saving..." });

    expect(screen.queryByRole("link", { name: "Add documents or a clinic" })).toBeNull();
    expect(screen.getByText("Add documents or a clinic").getAttribute("aria-disabled")).toBe("true");
    await act(async () => finish?.({ outcome: "created", completion: { id: "done", fulfillsCareRecordId: target.id } }));
  });

  it("keeps an unknown attempt after Close, and Review brings back the same details and key", async () => {
    await openDone();
    fill();
    await failUnknown();
    expect(screen.queryByRole("link", { name: "Add documents or a clinic" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByText(/isn't confirmed yet\. Your details are kept on this page until you leave or reload it/)
    ).toBeTruthy();
    expect(screen.getByText(/Leaving doesn't cancel a save that was already sent/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByRole("dialog", { name: "Mark as done" });
    expect((screen.getByLabelText("Note (optional)") as HTMLTextAreaElement).value).toBe("Booster went well");
    expect((screen.getByLabelText("Next due date (optional)") as HTMLInputElement).value).toBe("2027-10-12");

    mocks.completeCareItem.mockResolvedValueOnce({ outcome: "replayed", completion: { id: "done", dueDate: "12 Oct 2027", fulfillsCareRecordId: target.id } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/Rabies booster is logged as done for Oyen/)).toBeTruthy();
    const [first, retry] = sent();
    expect(retry).toEqual(first);
    expect(first).toMatchObject({ completedOn: today, nextDueDate: "2027-10-12", notes: "Booster went well" });
    expect(screen.queryByText(/isn't confirmed yet/)).toBeNull();
  });

  it("opening Done again for the same item reopens the held attempt, not a new one", async () => {
    await openDone();
    fill();
    await failUnknown();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText(/isn't confirmed yet/);

    fireEvent.click(screen.getByRole("button", { name: "Mark Rabies booster for Oyen as done" }));
    await screen.findByRole("dialog", { name: "Mark as done" });
    mocks.completeCareItem.mockRejectedValueOnce(dropped());
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText(/We couldn't confirm this yet/);

    // The network is still down: still unknown, still the same request.
    const [first, second] = sent();
    expect(second).toEqual(first);
  });

  it("explains when another tab logged it, without a second save", async () => {
    await openDone();
    await failUnknown();
    mocks.completeCareItem.mockRejectedValueOnce(new ApiClientError(409, "care_item_completed", "Already"));

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("This care item was already logged as done.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save as done|Try again/ })).toBeNull();
    expect(new Set(sent().map((input) => input.idempotencyKey)).size).toBe(1);
  });

  it("forgets a held attempt only when the owner discards it, and says that doesn't cancel it", async () => {
    await openDone();
    await failUnknown();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText(/isn't confirmed yet/);

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(screen.queryByText(/isn't confirmed yet/)).toBeNull());
    // A new Done for the item is a new request with a new key.
    fireEvent.click(screen.getByRole("button", { name: "Mark Rabies booster for Oyen as done" }));
    await screen.findByRole("dialog", { name: "Mark as done" });
    mocks.completeCareItem.mockResolvedValueOnce({ outcome: "created", completion: { id: "done", fulfillsCareRecordId: target.id } });
    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
    await screen.findByText(/is logged as done/);
    const [first, second] = sent();
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("does nothing when a request settles after the page is gone", async () => {
    await openDone();
    let finish: ((value: unknown) => void) | undefined;
    mocks.completeCareItem.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Save as done" }));
    await screen.findByRole("button", { name: "Saving..." });
    cleanup();

    await act(async () => finish?.({ outcome: "created", completion: { id: "done", fulfillsCareRecordId: target.id } }));

    expect(document.body.textContent).toBe("");
  });

  it("asks before leaving entered details for the full form", async () => {
    await openDone();
    fill();

    fireEvent.click(screen.getByRole("link", { name: "Add documents or a clinic" }));

    expect(await screen.findByText(/Your note and dates here won't carry over to the full form/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect((screen.getByLabelText("Note (optional)") as HTMLTextAreaElement).value).toBe("Booster went well");
    expect(screen.getByRole("link", { name: "Add documents or a clinic" })).toBeTruthy();
  });

  it("acknowledges a replay whose record was edited since, without calling it unknown", async () => {
    await openDone();
    await failUnknown();
    // The original request had succeeded; that record's link was edited later.
    mocks.completeCareItem.mockResolvedValueOnce({ outcome: "replayed", completion: { id: "done", fulfillsCareRecordId: undefined } });

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/Rabies booster was logged as done earlier; that record has since been changed/)).toBeTruthy();
    expect(screen.queryByText(/We couldn't confirm/)).toBeNull();
  });
});
