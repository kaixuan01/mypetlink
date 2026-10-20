// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { ApiClientError } from "@/services/apiClient";
import type {
  CareCompletionState,
  CareCompletionStatus,
  CareRecord,
  RecordPayload,
} from "@/types";

const mocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  deleteRecord: vi.fn(),
  getPetRecords: vi.fn(),
  getCareCompletionStatus: vi.fn(),
  updateRecord: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/recordService", () => ({
  createRecord: (...args: unknown[]) => mocks.createRecord(...args),
  deleteRecord: (...args: unknown[]) => mocks.deleteRecord(...args),
  getCareCompletionStatus: (...args: unknown[]) => mocks.getCareCompletionStatus(...args),
  getFriendlyRecordErrorMessage: (error: unknown) =>
    error instanceof ApiClientError && error.details
      ? Object.values(error.details)[0]?.[0]
      : error instanceof ApiClientError
        ? error.message
        : "Please try again.",
  getPetRecords: (...args: unknown[]) => mocks.getPetRecords(...args),
  updateRecord: (...args: unknown[]) => mocks.updateRecord(...args),
}));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...actual,
    trackEvent: (...args: unknown[]) => mocks.trackEvent(...args),
  };
});

const { RecordsManager } = await import("./RecordsManager");

const milo = mockPets[0];
const TARGET_ID = "5b7c0d2e-0000-4000-8000-000000000001";

const malaysiaToday = (() => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kuala_Lumpur",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
})();

// The real API client turns a dropped connection into exactly this.
const droppedConnection = () =>
  new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now. Please try again.");

function target(overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id: TARGET_ID,
    petId: milo.id,
    type: "Vaccine",
    title: "Rabies booster",
    careName: "Nobivac Rabies",
    date: "12 Oct 2025",
    dueDate: "12 Oct 2026",
    provider: "Klinik Haiwan Damansara",
    notes: "Mild swelling last time",
    publicVisibility: "Public badge only",
    status: "overdue",
    documents: [
      {
        id: "doc-1",
        fileName: "certificate.pdf",
        contentType: "application/pdf",
        fileSizeBytes: 1000,
        category: "VaccinationDocument",
        sortOrder: 0,
      },
    ],
    createdAt: "2025-10-12T02:00:00Z",
    ...overrides,
  };
}

function status(
  state: CareCompletionState,
  completion: CareRecord | null = null,
  targetOverrides: Partial<CareRecord> = {}
): CareCompletionStatus {
  return {
    state,
    asOfDate: malaysiaToday,
    petName: milo.name,
    target: target(targetOverrides),
    completion,
  };
}

/** The completing record the service would hold for exactly this draft. */
function recordFrom(payload: RecordPayload, overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id: "completing-record",
    petId: milo.id,
    type: payload.type ?? "Other",
    title: payload.title ?? "",
    careName: payload.careName,
    date: payload.date ?? "",
    dueDate: payload.dueDate,
    provider: payload.provider ?? "",
    notes: payload.notes ?? "",
    publicVisibility: payload.publicVisibility ?? "Private",
    status: "complete",
    fulfillsCareRecordId: TARGET_ID,
    documents: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function openWithComplete(recordId = TARGET_ID) {
  window.history.replaceState({}, "", `/pets/${milo.id}/records?complete=${recordId}`);
  return render(<RecordsManager initialRecords={[]} petId={milo.id} />);
}

function dialog() {
  return screen.findByRole("dialog", { name: "Log completed care" });
}

function saveButton() {
  return screen.getByRole("button", { name: "Save care record" }) as HTMLButtonElement;
}

function notes() {
  return screen.getByLabelText("Notes") as HTMLTextAreaElement;
}

function draftLocked() {
  return (document.querySelector("[data-care-draft]") as HTMLFieldSetElement).disabled;
}

/**
 * A create that failed after its request left: the service is told what was
 * sent (here, no attachments) before the failure, exactly as the real
 * service reports it.
 */
function failAfterSending(error: unknown, mediaFileIds: string[] = []) {
  mocks.createRecord.mockImplementation(
    async (
      _petId: string,
      _payload: RecordPayload,
      observer?: { onSending?: (sent: { mediaFileIds: string[]; uploadedMediaFileIds: string[] }) => void }
    ) => {
      observer?.onSending?.({ mediaFileIds, uploadedMediaFileIds: [] });
      throw error;
    }
  );
}

async function submitDraft(note = "Booster went well") {
  await dialog();
  fireEvent.change(notes(), { target: { value: note } });
  fireEvent.click(saveButton());
  await waitFor(() => expect(mocks.createRecord).toHaveBeenCalled());
  return mocks.createRecord.mock.calls.at(-1)![1] as RecordPayload;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  // The loaded history does not contain the target: it sits beyond page one.
  mocks.getPetRecords.mockResolvedValue({ data: [] });
  mocks.getCareCompletionStatus.mockResolvedValue(status("pending"));
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("Opening Log as done", () => {
  it("prefills the ordinary form from the authorized status read and consumes the address", async () => {
    openWithComplete();

    await dialog();
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledWith(TARGET_ID);
    expect(window.location.search).toBe("");
    expect((screen.getByLabelText("Record Type") as HTMLSelectElement).value).toBe("Vaccine");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Rabies booster");
    expect((screen.getByLabelText("Vaccine name (Optional)") as HTMLInputElement).value).toBe("Nobivac Rabies");
    const date = screen.getByLabelText(/Date$/) as HTMLInputElement;
    expect(date.value).toBe(malaysiaToday);
    expect(date.disabled).toBe(false);
    expect((screen.getByLabelText("Provider / Clinic") as HTMLInputElement).value).toBe("");
    expect(notes().value).toBe("");
    expect((screen.getByLabelText(/Next Vaccination Due Date/) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Who can see this record?") as HTMLSelectElement).value).toBe("Private");
    expect(screen.queryByText("certificate.pdf")).toBeNull();
    expect((screen.getByRole("radio", { name: /Nobivac Rabies/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Nobivac Rabies for Milo was due 12 Oct 2026/)).toBeTruthy();
    expect(saveButton().disabled).toBe(false);
  });

  it("says when the item is already completed, from the completing record itself", async () => {
    mocks.getCareCompletionStatus.mockResolvedValue(
      status("completed", { ...target(), id: "done", date: "18 Oct 2026", fulfillsCareRecordId: TARGET_ID })
    );
    openWithComplete();

    expect(await screen.findByText("This care item was already logged as done on 18 Oct 2026.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["archived", "This care item was deleted, so there is nothing to log."],
    ["no-due-date", "This care item no longer has a due date, so there is nothing to log as done."],
    ["pet-archived", "This pet's profile is archived, so care can't be logged for it right now."],
  ] satisfies Array<[CareCompletionState, string]>)(
    "explains a %s item instead of calling it completed",
    async (state, message) => {
      mocks.getCareCompletionStatus.mockResolvedValue(status(state));
      openWithComplete();

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.queryByText(/already been logged|already logged/)).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  );

  it.each([
    ["another pet's record", () => mocks.getCareCompletionStatus.mockResolvedValue(status("pending", null, { petId: "pet_other" }))],
    ["a record the owner cannot read", () => mocks.getCareCompletionStatus.mockRejectedValue(new ApiClientError(404, "not_found", "Care record was not found."))],
  ])("refuses %s without revealing it", async (_label, arrange) => {
    arrange();
    openWithComplete();

    expect(await screen.findByText("This care item isn't available.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Rabies booster")).toBeNull();
  });

  it("offers a retry when the item could not be opened", async () => {
    mocks.getCareCompletionStatus.mockRejectedValueOnce(droppedConnection());
    openWithComplete();

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await dialog()).toBeTruthy();
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledTimes(2);
  });

  it("changes nothing and records nothing when cancelled", async () => {
    openWithComplete();

    await dialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("leaves the plain create link unchanged", async () => {
    window.history.replaceState({}, "", `/pets/${milo.id}/records?create=1`);
    render(<RecordsManager initialRecords={[]} petId={milo.id} />);

    expect(await screen.findByRole("dialog", { name: "Save a care record" })).toBeTruthy();
    expect(mocks.getCareCompletionStatus).not.toHaveBeenCalled();
  });
});

describe("A confirmed save", () => {
  it("reports success only after the server confirms it", async () => {
    let resolveSave: ((value: { data: CareRecord }) => void) | undefined;
    mocks.createRecord.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );
    openWithComplete();

    const payload = await submitDraft();
    expect(payload).toMatchObject({
      type: "Vaccine",
      title: "Rabies booster",
      careName: "Nobivac Rabies",
      fulfillsCareRecordId: TARGET_ID,
      publicVisibility: "Private",
      provider: "",
      dueDate: undefined,
    });
    expect(payload.documents).toBeUndefined();
    expect(screen.queryByText(/is logged as done/)).toBeNull();
    expect(mocks.trackEvent).not.toHaveBeenCalled();

    await act(async () => resolveSave?.({ data: recordFrom(payload) }));

    expect(await screen.findByText("Nobivac Rabies for Milo is logged as done.")).toBeTruthy();
    expect(mocks.trackEvent).toHaveBeenCalledOnce();
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledTimes(1);
  });
});

describe("A save whose outcome is unknown", () => {
  it.each([
    ["a dropped connection (status 0)", droppedConnection],
    ["a timeout (408)", () => new ApiClientError(408, "http_408", "Request timed out.")],
    ["a server failure (503)", () => new ApiClientError(503, "http_503", "Service unavailable.")],
    ["a raw network failure", () => new TypeError("Failed to fetch")],
  ])("after %s, closes only for a completing record with exactly these details", async (_label, error) => {
    failAfterSending(error());
    openWithComplete();

    await dialog();
    mocks.getCareCompletionStatus.mockImplementation(async () =>
      status("completed", recordFrom(mocks.createRecord.mock.calls[0]![1] as RecordPayload))
    );
    await submitDraft();

    // Without attachments, the request that wrote the record can't be shown,
    // so the message says only what is true.
    expect(await screen.findByText("Care is already logged with these details.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByText("Booster went well").length).toBeGreaterThan(0);
  });

  it("does not call it saved when nothing completes the item yet, keeps the draft and locks Save", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    await submitDraft();

    expect(await screen.findByText(/We can't confirm this save yet — it may still be finishing/)).toBeTruthy();
    expect(screen.queryByText(/is logged as done/)).toBeNull();
    expect(notes().value).toBe("Booster went well");
    expect(saveButton().disabled).toBe(true);
    expect(draftLocked()).toBe(true);
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "View care records" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
    expect((screen.getByRole("radio", { name: /Nobivac Rabies/ }) as HTMLInputElement).checked).toBe(true);
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });

  it("never unlocks Save because time has passed", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    failAfterSending(droppedConnection());
    openWithComplete();

    await submitDraft();
    await screen.findByText(/We can't confirm this save yet/);

    for (const elapsed of [6_000, 60_000, 60 * 60_000, 24 * 60 * 60_000]) {
      now.mockReturnValue(1_000_000 + elapsed);
      fireEvent.click(await screen.findByRole("button", { name: "Check again" }));
      await screen.findByText(/We can't confirm this save yet/);
      expect(saveButton().disabled).toBe(true);
      expect(draftLocked()).toBe(true);
    }

    expect(screen.queryByText(/save again/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
    expect(notes().value).toBe("Booster went well");
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledTimes(6);
  });

  it("confirms a save that was still running when first checked", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    const payload = await submitDraft();
    await screen.findByText(/We can't confirm this save yet/);

    // The original request finishes after the first check.
    mocks.getCareCompletionStatus.mockResolvedValue(status("completed", recordFrom(payload)));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("Care is already logged with these details.")).toBeTruthy();
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });

  it("never claims this save when another record completed the item with other details", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    await dialog();
    mocks.getCareCompletionStatus.mockResolvedValue(
      status("completed", recordFrom({ type: "Vaccine", title: "Rabies booster", date: "18 Oct 2026", notes: "Done by my partner", provider: "", publicVisibility: "Private" }, { date: "18 Oct 2026" }))
    );
    await submitDraft();

    expect(
      await screen.findByText(/is logged as done on 18 Oct 2026 with different details. We can't tell yet whether your save went through/)
    ).toBeTruthy();
    expect(screen.queryByText(/Care is already logged/)).toBeNull();
    expect(notes().value).toBe("Booster went well");
    expect(saveButton().disabled).toBe(true);
    // The original may still land: no unlinked save while that is unknown.
    expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
  });

  it.each([
    ["archived", "This care item was deleted while you were saving"],
    ["no-due-date", "This care item's due date was removed while you were saving"],
    ["pet-archived", "This pet's profile was archived while you were saving"],
  ] satisfies Array<[CareCompletionState, string]>)(
    "tells a %s item apart from completion, keeps the link and offers no unlinked save",
    async (state, message) => {
      failAfterSending(new ApiClientError(503, "http_503", "Service unavailable."));
      openWithComplete();

      await dialog();
      // A completing record that landed late is still not a normal completion.
      mocks.getCareCompletionStatus.mockImplementation(async () =>
        status(
          state,
          // Every changed state may carry this save's own late record (G4).
          recordFrom(mocks.createRecord.mock.calls[0]![1] as RecordPayload),
          state === "archived"
            ? { archivedAt: "2026-10-19T00:00:00Z" }
            : state === "no-due-date"
              ? { dueDate: undefined }
              : {}
        )
      );
      await submitDraft();

      expect(await screen.findByText(new RegExp(message))).toBeTruthy();
      expect(screen.getByText(/We can't tell yet whether your details were saved/)).toBeTruthy();
      expect(screen.queryByText(/is logged as done|Care is already logged/)).toBeNull();
      expect(notes().value).toBe("Booster went well");
      expect(saveButton().disabled).toBe(true);
      expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
      expect((screen.getByRole("radio", { name: /Nobivac Rabies/ }) as HTMLInputElement).checked).toBe(true);
    }
  );

  it("says it cannot check when the status read itself fails, and lets the owner check again", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    await dialog();
    mocks.getCareCompletionStatus.mockRejectedValue(droppedConnection());
    await submitDraft();

    expect(await screen.findByText(/We couldn't check whether this was saved/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(notes().value).toBe("Booster went well");
    expect(screen.getByRole("button", { name: "Check again" })).toBeTruthy();
  });

  it("ignores a check that answers after the owner moved on", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    const payload = await submitDraft();
    await screen.findByText(/We can't confirm this save yet/);

    let answerLate: ((value: CareCompletionStatus) => void) | undefined;
    mocks.getCareCompletionStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        answerLate = resolve;
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await act(async () => answerLate?.(status("completed", recordFrom(payload))));

    expect(screen.queryByText("Care is already logged with these details.")).toBeNull();
    expect(screen.getByText(/isn't confirmed yet\. Your details are kept on this page/)).toBeTruthy();
  });
});

describe("A held save", () => {
  it("keeps an unconfirmed save with its draft when the editor closes, and reviews it on request", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    const payload = await submitDraft();
    await screen.findByText(/We can't confirm this save yet/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      await screen.findByText(/Your log for Nobivac Rabies for Milo isn't confirmed yet\. Your details are kept on this page until you leave or reload it/)
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Review my save" }));

    await dialog();
    expect(notes().value).toBe("Booster went well");
    expect(await screen.findByText(/We can't confirm this save yet/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);

    mocks.getCareCompletionStatus.mockResolvedValue(status("completed", recordFrom(payload)));
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(await screen.findByText("Care is already logged with these details.")).toBeTruthy();
    expect(screen.queryByText(/isn't confirmed yet/)).toBeNull();
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });

  it("keeps the save held, draft locked, after the owner goes to their care records", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    await submitDraft("Second try");
    await screen.findByText(/We can't confirm this save yet/);
    mocks.getPetRecords.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "View care records" }));

    await screen.findByText(/isn't confirmed yet/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.getPetRecords).toHaveBeenCalledWith(milo.id);

    fireEvent.click(screen.getByRole("button", { name: "Review my save" }));
    await dialog();
    expect(notes().value).toBe("Second try");
    expect(saveButton().disabled).toBe(true);
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });

  it("forgets the held save only when the owner discards it", async () => {
    failAfterSending(droppedConnection());
    openWithComplete();

    await submitDraft();
    await screen.findByText(/We can't confirm this save yet/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard my details" }));

    await waitFor(() => expect(screen.queryByText(/isn't confirmed yet/)).toBeNull());
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });
});

describe("A refused save", () => {
  it("treats a request that never left as an ordinary failure", async () => {
    mocks.createRecord.mockRejectedValue(
      new ApiClientError(0, "connection_not_configured", "MyPetLink connection is not configured.")
    );
    openWithComplete();

    await submitDraft();

    expect(await screen.findByText("MyPetLink connection is not configured.")).toBeTruthy();
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(false);
  });

  it("treats a failed upload before sending as an ordinary failure", async () => {
    // The upload failed, so the create request was never sent.
    mocks.createRecord.mockRejectedValue(new Error("Could not upload “certificate.pdf”. Please try this file again."));
    openWithComplete();

    await submitDraft();

    expect(await screen.findByText(/Please try again\./)).toBeTruthy();
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps the draft and the link when another tab logged it first, and offers no unlinked save", async () => {
    failAfterSending(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        fulfillsCareRecordId: ["This care record has already been fulfilled by another record."],
      })
    );
    openWithComplete();

    await dialog();
    mocks.getCareCompletionStatus.mockResolvedValue(
      status("completed", recordFrom({ type: "Vaccine", title: "Rabies booster", date: "19 Oct 2026", notes: "Other tab", provider: "", publicVisibility: "Private" }))
    );
    await submitDraft("Second visit");

    expect(await screen.findByText(/with different details, so this save wasn't recorded/)).toBeTruthy();
    expect(notes().value).toBe("Second visit");
    expect((screen.getByRole("radio", { name: /Nobivac Rabies/ }) as HTMLInputElement).checked).toBe(true);
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
    expect(screen.getByRole("button", { name: "View care records" })).toBeTruthy();
    expect(mocks.createRecord).toHaveBeenCalledTimes(1);
  });

  // The review's G2 sequence on a fresh page: an earlier save (lost with the
  // page that sent it) may still be running when this request is refused.
  it.each([
    ["deleted", "archived", { archivedAt: "2026-10-19T00:00:00Z" }, /This care item was deleted, so this save wasn't recorded/],
    ["undated", "no-due-date", { dueDate: undefined }, /This care item's due date was removed, so this save wasn't recorded/],
    ["on an archived pet", "pet-archived", {}, /This pet's profile was archived, so this save wasn't recorded/],
  ] satisfies Array<[string, CareCompletionState, Partial<CareRecord>, RegExp]>)(
    "after a refusal for an item that is now %s, never unlinks or saves again",
    async (_label, state, targetOverrides, message) => {
      failAfterSending(
        new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
          fulfillsCareRecordId: ["The care record to fulfil is not available."],
        })
      );
      openWithComplete();

      await dialog();
      mocks.getCareCompletionStatus.mockResolvedValue(status(state, null, targetOverrides));
      await submitDraft();

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByText(/An earlier save for this item may still appear in your care records/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
      expect(saveButton().disabled).toBe(true);
      expect((screen.getByRole("radio", { name: /Nobivac Rabies/ }) as HTMLInputElement).checked).toBe(true);
      expect(mocks.createRecord).toHaveBeenCalledTimes(1);
    }
  );

  it("confirms a retry refused because the first save had already landed with these details", async () => {
    failAfterSending(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        fulfillsCareRecordId: ["This care record has already been fulfilled by another record."],
      })
    );
    openWithComplete();

    await dialog();
    mocks.getCareCompletionStatus.mockImplementation(async () =>
      status("completed", recordFrom(mocks.createRecord.mock.calls[0]![1] as RecordPayload))
    );
    await submitDraft();

    expect(await screen.findByText("Care is already logged with these details.")).toBeTruthy();
  });

  it("does not call every link error 'already logged'", async () => {
    failAfterSending(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        fulfillsCareRecordId: ["The care record to fulfil must have the same care type."],
      })
    );
    openWithComplete();

    await submitDraft();

    expect(await screen.findByText("The care record to fulfil must have the same care type.")).toBeTruthy();
    expect(screen.queryByText(/already/)).toBeNull();
    expect((screen.getByRole("radio", { name: /Nobivac Rabies/ }) as HTMLInputElement).checked).toBe(true);
    expect(saveButton().disabled).toBe(false);
    expect(notes().value).toBe("Booster went well");
  });

  it("shows ordinary validation errors without a status check", async () => {
    failAfterSending(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        title: ["Title is required."],
      })
    );
    openWithComplete();

    await submitDraft();

    expect(await screen.findByText("Title is required.")).toBeTruthy();
    expect(mocks.getCareCompletionStatus).toHaveBeenCalledTimes(1);
    expect(saveButton().disabled).toBe(false);
  });
});
