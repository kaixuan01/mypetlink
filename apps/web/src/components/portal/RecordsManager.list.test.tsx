// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { mockRecords } from "@/data/mockRecords";
import type { CareRecord } from "@/types";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  getPetRecords: vi.fn(),
  updateRecord: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/recordService", () => ({
  createRecord: (...args: unknown[]) => mocks.createRecord(...args),
  deleteRecord: (...args: unknown[]) => mocks.deleteRecord(...args),
  getFriendlyRecordErrorMessage: () => "Please try again.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  updateRecord: (...args: unknown[]) => mocks.updateRecord(...args),
}));

const { RecordsManager } = await import("./RecordsManager");

function makeRecord(
  overrides: Partial<CareRecord> & Pick<CareRecord, "id" | "type" | "title">
): CareRecord {
  return {
    ...mockRecords[0],
    ...overrides,
    petId: mockPets[0].id,
  };
}

function renderRecords(records: CareRecord[]) {
  mocks.getPetRecords.mockResolvedValue({ data: records });
  return render(
    <RecordsManager petId={mockPets[0].id} initialRecords={records} />
  );
}

function completeCreateForm(type: CareRecord["type"], title: string) {
  fireEvent.change(screen.getByLabelText("Record Type"), {
    target: { value: type },
  });
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: title },
  });
  fireEvent.change(screen.getByLabelText(/Date$/), {
    target: { value: "2020-06-15" },
  });
}

describe("RecordsManager list hierarchy", () => {
  beforeEach(() => {
    mocks.createRecord.mockReset();
    mocks.deleteRecord.mockReset();
    mocks.getPetRecords.mockReset();
    mocks.updateRecord.mockReset();
    window.history.replaceState({}, "", `/pets/${mockPets[0].id}/records`);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders one page-level empty state and no category empty panels", async () => {
    renderRecords([]);

    expect(await screen.findByText("No care records yet")).toBeTruthy();
    expect(screen.getAllByText("No care records yet")).toHaveLength(1);
    expect(screen.queryByText("No records in this category yet.")).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "Add first care record" })
    ).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Vaccine" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Other" })).toBeNull();
  });

  it("updates title and notes examples when the selected Care Type changes", async () => {
    renderRecords([]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add first care record" })
    );

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const notes = screen.getByLabelText("Notes") as HTMLTextAreaElement;
    expect(title.placeholder).toBe("e.g. Care record");
    expect(notes.placeholder).toBe("e.g. Add any useful care details");

    fireEvent.change(screen.getByLabelText("Record Type"), {
      target: { value: "Vaccine" },
    });
    expect(title.placeholder).toBe("e.g. Rabies, DHPP booster");
    expect(notes.placeholder).toBe(
      "e.g. Booster completed; certificate saved"
    );

    fireEvent.change(screen.getByLabelText("Record Type"), {
      target: { value: "Medication" },
    });
    expect(title.placeholder).toBe("e.g. Apoquel");
    expect(notes.placeholder).toBe("e.g. Once daily with food");
  });

  it("shows only a populated category with its concise count", async () => {
    const vaccine = makeRecord({
      id: "vaccine-only",
      type: "Vaccine",
      title: "Annual vaccine",
    });
    renderRecords([vaccine]);

    expect(await screen.findByText(vaccine.title)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Vaccine" })).toBeTruthy();
    expect(screen.getByLabelText("1 record")).toBeTruthy();
    for (const type of [
      "Deworming",
      "Grooming",
      "Vet Visit",
      "Medication",
      "Allergy",
      "Surgery",
      "Lab Test",
      "Other",
    ]) {
      expect(screen.queryByRole("heading", { name: type })).toBeNull();
    }
  });

  it("preserves category order and source order within populated groups", async () => {
    const records = [
      makeRecord({ id: "other", type: "Other", title: "Other note" }),
      makeRecord({ id: "vaccine-b", type: "Vaccine", title: "Second vaccine" }),
      makeRecord({ id: "medication", type: "Medication", title: "Medication note" }),
      makeRecord({ id: "vaccine-a", type: "Vaccine", title: "First vaccine" }),
    ];
    renderRecords(records);

    await screen.findByText("Other note");
    const categoryHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(categoryHeadings).toEqual([
      "Care records",
      "Vaccine",
      "Medication",
      "Other",
    ]);
    expect(screen.getByLabelText("2 records")).toBeTruthy();
    expect(
      screen.getAllByRole("article").map((article) => article.textContent)
    ).toEqual([
      expect.stringContaining("Second vaccine"),
      expect.stringContaining("First vaccine"),
      expect.stringContaining("Medication note"),
      expect.stringContaining("Other note"),
    ]);
  });

  it("keeps legacy Allergy visible and editable without offering it for Create", async () => {
    const allergy = makeRecord({
      id: "legacy-allergy",
      type: "Allergy",
      title: "Legacy allergy note",
    });
    renderRecords([allergy]);

    expect(await screen.findByText(allergy.title)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Allergy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(
      Array.from(
        (screen.getByLabelText("Record Type") as HTMLSelectElement).options
      ).map((option) => option.value)
    ).toContain("Allergy");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    window.history.replaceState(
      {},
      "",
      `/pets/${mockPets[0].id}/records?create=1`
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
    // The existing create deep-link contract is mount-driven, so remount it.
    cleanup();
    renderRecords([allergy]);
    await screen.findByRole("dialog", { name: "Save a care record" });
    expect(
      Array.from(
        (screen.getByLabelText("Record Type") as HTMLSelectElement).options
      ).map((option) => option.value)
    ).not.toContain("Allergy");
  });

  it("refreshes grouping after Create and a legitimate type-changing Edit", async () => {
    const vaccine = makeRecord({
      id: "vaccine-edit",
      type: "Vaccine",
      title: "Vaccine to edit",
    });
    const medication = {
      ...vaccine,
      type: "Medication" as const,
      title: "Updated medication",
    };
    mocks.updateRecord.mockResolvedValue({ data: medication });
    renderRecords([vaccine]);

    await screen.findByText(vaccine.title);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Record Type"), {
      target: { value: "Medication" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: medication.title },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByText(medication.title)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Medication" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Vaccine" })).toBeNull();

    const created = makeRecord({
      id: "created-other",
      type: "Other",
      title: "New care note",
    });
    mocks.createRecord.mockResolvedValue({ data: created });
    window.history.replaceState(
      {},
      "",
      `/pets/${mockPets[0].id}/records?create=1`
    );
    cleanup();
    renderRecords([medication]);
    await screen.findByRole("dialog", { name: "Save a care record" });
    completeCreateForm("Other", created.title);
    fireEvent.click(screen.getByRole("button", { name: "Save Record" }));

    expect(await screen.findByText(created.title)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Other" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Medication" })).toBeTruthy();
  });

  it("removes empty groups after Delete and shows the page empty state after the last record", async () => {
    const vaccine = makeRecord({
      id: "delete-vaccine",
      type: "Vaccine",
      title: "Delete vaccine",
    });
    const medication = makeRecord({
      id: "delete-medication",
      type: "Medication",
      title: "Delete medication",
    });
    mocks.deleteRecord.mockResolvedValue({ data: { deleted: true } });
    renderRecords([vaccine, medication]);

    const vaccineCard = (await screen.findByText(vaccine.title)).closest(
      "article"
    )!;
    fireEvent.click(within(vaccineCard).getByRole("button", { name: "Delete" }));
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Delete care record?" })
      ).getByRole("button", { name: "Delete record" })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Delete care record?" })
      ).toBeNull()
    );
    expect(screen.queryByRole("heading", { name: "Vaccine" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Medication" })).toBeTruthy();

    const medicationCard = screen.getByText(medication.title).closest("article")!;
    fireEvent.click(
      within(medicationCard).getByRole("button", { name: "Delete" })
    );
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Delete care record?" })
      ).getByRole("button", { name: "Delete record" })
    );

    expect(await screen.findByText("No care records yet")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Medication" })).toBeNull();
    expect(screen.queryByText("No records in this category yet.")).toBeNull();
  });
});
