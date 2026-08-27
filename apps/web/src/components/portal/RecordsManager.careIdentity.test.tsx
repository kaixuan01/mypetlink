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
  getFriendlyRecordErrorMessage: () =>
    "That previous due item cannot be selected. Choose another item or None.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  updateRecord: (...args: unknown[]) => mocks.updateRecord(...args),
}));

const { RecordsManager } = await import("./RecordsManager");

describe("RecordsManager care identity and fulfilment", () => {
  beforeEach(() => {
    mocks.createRecord.mockReset();
    mocks.deleteRecord.mockReset();
    mocks.getPetRecords.mockReset();
    mocks.updateRecord.mockReset();
    window.history.replaceState({}, "", "/pets/pet-1/records");
  });

  afterEach(() => cleanup());

  it("shows CareName only for identity-bearing types and clears it on type change", async () => {
    renderRecords([]);
    fireEvent.click(
      await screen.findByRole("button", { name: "Add first care record" })
    );

    chooseType("Vaccine");
    const vaccineName = screen.getByLabelText(
      "Vaccine name (Optional)"
    ) as HTMLInputElement;
    expect(vaccineName.placeholder).toContain("DHPP");
    fireEvent.change(vaccineName, { target: { value: "DHPP" } });

    chooseType("Medication");
    expect(
      (screen.getByLabelText("Medication name (Optional)") as HTMLInputElement)
        .value
    ).toBe("");

    chooseType("Lab Test");
    expect(screen.getByLabelText("Test name (Optional)")).toBeTruthy();

    chooseType("Grooming");
    expect(screen.queryByLabelText(/name \(Optional\)/)).toBeNull();
  });

  it("offers only eligible same-type due items and sends the explicit choice", async () => {
    const target = careRecord("vaccine-target", {
      careName: "DHPP",
      dueDate: "15 Oct 2026",
    });
    const fallbackTitle = careRecord("title-target", {
      title: "Annual vaccination",
      dueDate: "20 Nov 2026",
    });
    const wrongType = careRecord("medication-target", {
      type: "Medication",
      careName: "Apoquel",
      dueDate: "18 Oct 2026",
    });
    const noDueDate = careRecord("no-due");
    const claimedTarget = careRecord("claimed-target", {
      careName: "Rabies",
      dueDate: "22 Oct 2026",
    });
    const claimant = careRecord("claimant", {
      fulfillsCareRecordId: claimedTarget.id,
      createdAt: "2026-08-02T00:00:00Z",
    });
    const records = [
      target,
      fallbackTitle,
      wrongType,
      noDueDate,
      claimedTarget,
      claimant,
    ];
    const saved = careRecord("saved", {
      careName: "Leptospirosis",
      fulfillsCareRecordId: target.id,
    });
    mocks.createRecord.mockResolvedValue({ data: saved });
    openCreateOnMount(records);
    await screen.findByRole("dialog", { name: "Save a care record" });

    chooseType("Vaccine");
    expect(
      (screen.getByRole("radio", { name: /^None$/ }) as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByRole("radio", { name: /DHPP/ })).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: /Annual vaccination/ })
    ).toBeTruthy();
    expect(screen.queryByRole("radio", { name: /Apoquel/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /Rabies/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /no-due/ })).toBeNull();

    fireEvent.change(screen.getByLabelText("Vaccine name (Optional)"), {
      target: { value: "Leptospirosis" },
    });
    completeRequiredFields("Booster visit");
    fireEvent.click(screen.getByRole("radio", { name: /DHPP/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Record" }));

    await waitFor(() => expect(mocks.createRecord).toHaveBeenCalledOnce());
    expect(mocks.createRecord).toHaveBeenCalledWith(
      "pet-1",
      expect.objectContaining({
        careName: "Leptospirosis",
        fulfillsCareRecordId: target.id,
        title: "Booster visit",
      })
    );
  });

  it("omits the fulfilment section when no eligible due items exist", async () => {
    openCreateOnMount([careRecord("no-due")]);
    await screen.findByRole("dialog", { name: "Save a care record" });

    chooseType("Vaccine");

    expect(
      screen.queryByRole("group", {
        name: /Completes a previous due item/i,
      })
    ).toBeNull();
  });

  it("loads, changes, and explicitly clears identity and fulfilment on Edit", async () => {
    const targetA = careRecord("target-a", {
      careName: "DHPP",
      dueDate: "15 Oct 2026",
    });
    const targetB = careRecord("target-b", {
      title: "Annual vaccination",
      dueDate: "20 Nov 2026",
    });
    const current = careRecord("current", {
      careName: "DHPP booster",
      date: "20 Aug 2026",
      fulfillsCareRecordId: targetA.id,
      createdAt: "2026-08-20T00:00:00Z",
    });
    mocks.updateRecord.mockResolvedValue({
      data: { ...current, careName: undefined, fulfillsCareRecordId: undefined },
    });
    renderRecords([targetA, targetB, current]);

    const currentCard = (await screen.findByText("DHPP booster")).closest(
      "article"
    )!;
    fireEvent.click(within(currentCard).getByRole("button", { name: "Edit" }));

    expect(
      (screen.getByLabelText("Vaccine name (Optional)") as HTMLInputElement)
        .value
    ).toBe("DHPP booster");
    expect(
      (screen.getByRole("radio", { name: /DHPP.*Due 15 Oct 2026/ }) as HTMLInputElement)
        .checked
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /Annual vaccination/ }));
    expect(
      (screen.getByRole("radio", { name: /Annual vaccination/ }) as HTMLInputElement)
        .checked
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Vaccine name (Optional)"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^None$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updateRecord).toHaveBeenCalledOnce());
    expect(mocks.updateRecord).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        careName: undefined,
        fulfillsCareRecordId: undefined,
      }),
      "pet-1"
    );
  });

  it("keeps an invalidated edit selection visible until the owner changes it", async () => {
    const target = careRecord("target", {
      careName: "DHPP",
      dueDate: "15 Oct 2026",
      createdAt: undefined,
    });
    const current = careRecord("current", {
      date: "20 Aug 2026",
      fulfillsCareRecordId: target.id,
      createdAt: undefined,
    });
    renderRecords([target, current]);

    const currentCard = (await screen.findByText(current.title)).closest(
      "article"
    )!;
    fireEvent.click(within(currentCard).getByRole("button", { name: "Edit" }));
    const selected = screen.getByRole("radio", { name: /DHPP/ }) as HTMLInputElement;
    expect(selected.checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Vaccination Date"), {
      target: { value: "2026-07-20" },
    });

    expect(selected.checked).toBe(true);
    expect(
      screen.getByText(
        "This due item is no longer eligible. Choose another item or None."
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(mocks.updateRecord).not.toHaveBeenCalled();
  });

  it("clears both identity and fulfilment when the record type changes", async () => {
    const target = careRecord("target", {
      careName: "DHPP",
      dueDate: "15 Oct 2026",
    });
    const current = careRecord("current", {
      careName: "DHPP booster",
      fulfillsCareRecordId: target.id,
      createdAt: "2026-08-20T00:00:00Z",
    });
    mocks.updateRecord.mockResolvedValue({
      data: {
        ...current,
        type: "Medication",
        careName: undefined,
        fulfillsCareRecordId: undefined,
      },
    });
    renderRecords([target, current]);

    const currentCard = (await screen.findByText("DHPP booster")).closest(
      "article"
    )!;
    fireEvent.click(within(currentCard).getByRole("button", { name: "Edit" }));
    chooseType("Medication");

    expect(
      (screen.getByLabelText("Medication name (Optional)") as HTMLInputElement)
        .value
    ).toBe("");
    expect(
      screen.queryByRole("group", { name: /Completes a previous due item/i })
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updateRecord).toHaveBeenCalledOnce());
    expect(mocks.updateRecord).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        type: "Medication",
        careName: undefined,
        fulfillsCareRecordId: undefined,
      }),
      "pet-1"
    );
  });

  it("keeps owner input and selection when the API rejects the relationship", async () => {
    const target = careRecord("target", {
      careName: "DHPP",
      dueDate: "15 Oct 2026",
    });
    mocks.createRecord.mockRejectedValue(new Error("Rejected"));
    openCreateOnMount([target]);
    await screen.findByRole("dialog", { name: "Save a care record" });
    chooseType("Vaccine");
    fireEvent.change(screen.getByLabelText("Vaccine name (Optional)"), {
      target: { value: "Rabies" },
    });
    const certificate = new File(["certificate"], "rabies-certificate.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText("+ Add document"), {
      target: { files: [certificate] },
    });
    completeRequiredFields("Owner-entered title");
    fireEvent.click(screen.getByRole("radio", { name: /DHPP/ }));

    fireEvent.click(screen.getByRole("button", { name: "Save Record" }));

    expect(
      await screen.findByText(
        "That previous due item cannot be selected. Choose another item or None."
      )
    ).toBeTruthy();
    expect(
      (screen.getByLabelText("Vaccine name (Optional)") as HTMLInputElement)
        .value
    ).toBe("Rabies");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe(
      "Owner-entered title"
    );
    expect(
      (screen.getByRole("radio", { name: /DHPP/ }) as HTMLInputElement).checked
    ).toBe(true);
    expect(screen.getByText("rabies-certificate.pdf")).toBeTruthy();
  });

  it("replaces selected documents on Edit while preserving E2B identity", async () => {
    const current = careRecord("current-documents", {
      careName: "DHPP",
      documents: [
        careDocument("document-a", "a.pdf", 0),
        careDocument("document-b", "b.png", 1),
      ],
    });
    mocks.updateRecord.mockResolvedValue({ data: current });
    renderRecords([current]);

    const card = (await screen.findByText(current.title)).closest("article")!;
    expect(within(card).getByText("Documents · 2")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog", { name: "Update care record" });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove b.png" })
    );
    const added = new File(["new"], "c.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText("+ Add document"), {
      target: { files: [added] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.updateRecord).toHaveBeenCalledOnce());
    expect(mocks.updateRecord).toHaveBeenCalledWith(
      current.id,
      expect.objectContaining({
        careName: "DHPP",
        documents: [
          expect.objectContaining({ id: "document-a", sortOrder: 0 }),
          expect.objectContaining({
            fileName: "c.pdf",
            sourceFile: added,
            sortOrder: 1,
          }),
        ],
      }),
      "pet-1"
    );
  });

  it("shows Completed only while the explicit fulfiller remains active", async () => {
    const target = careRecord("target", {
      title: "Old DHPP schedule",
      dueDate: "15 Oct 2022",
      status: "overdue",
    });
    const fulfiller = careRecord("fulfiller", {
      title: "DHPP completed",
      fulfillsCareRecordId: target.id,
      createdAt: "2022-10-16T00:00:00Z",
    });
    mocks.deleteRecord.mockResolvedValue({ data: { deleted: true } });
    renderRecords([target, fulfiller]);

    const targetCard = (await screen.findByText(target.title)).closest(
      "article"
    )!;
    expect(within(targetCard).getByText("Completed")).toBeTruthy();
    expect(within(targetCard).queryByText("Overdue")).toBeNull();

    const fulfillerCard = screen.getByText(fulfiller.title).closest("article")!;
    fireEvent.click(
      within(fulfillerCard).getByRole("button", { name: "Delete" })
    );
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Delete care record?" })).getByRole(
        "button",
        { name: "Delete record" }
      )
    );

    await waitFor(() => expect(within(targetCard).getByText("Overdue")).toBeTruthy());
    expect(within(targetCard).queryByText("Completed")).toBeNull();
  });
});

function renderRecords(records: CareRecord[]) {
  mocks.getPetRecords.mockResolvedValue({ data: records });
  return render(<RecordsManager initialRecords={records} petId="pet-1" />);
}

function openCreateOnMount(records: CareRecord[]) {
  window.history.replaceState({}, "", "/pets/pet-1/records?create=1");
  return renderRecords(records);
}

function chooseType(type: CareRecord["type"]) {
  fireEvent.change(screen.getByLabelText("Record Type"), {
    target: { value: type },
  });
}

function completeRequiredFields(title: string) {
  fireEvent.change(screen.getByLabelText("Title"), {
    target: { value: title },
  });
  fireEvent.change(screen.getByLabelText("Vaccination Date"), {
    target: { value: "2026-08-20" },
  });
}

function careRecord(id: string, overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id,
    petId: "pet-1",
    type: "Vaccine",
    title: id,
    date: "01 Aug 2026",
    provider: "Owner recorded",
    notes: "Care notes",
    publicVisibility: "Private",
    status: "complete",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function careDocument(id: string, fileName: string, sortOrder: number) {
  return {
    id,
    fileName,
    contentType: fileName.endsWith(".pdf") ? "application/pdf" : "image/png",
    fileSizeBytes: 2048,
    category: "VaccinationDocument" as const,
    sortOrder,
  };
}
