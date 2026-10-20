// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { BackendCareRecord } from "@/services/apiDtos";

/**
 * Log as done recovery through the real care service: the files are staged,
 * their stored media ids are what the request carries, and reconciliation
 * compares those ids with the completing record the service reports. Only
 * the transport and the file store are stand-ins.
 */
const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  deleteMedia: vi.fn(),
  uploadMediaFile: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => true, isApiConfigured: () => true }));
vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return { ...actual, apiRequest: (...args: unknown[]) => mocks.apiRequest(...args) };
});
vi.mock("@/services/mediaService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/mediaService")>();
  return {
    ...actual,
    deleteMedia: (...args: unknown[]) => mocks.deleteMedia(...args),
    uploadMediaFile: (...args: unknown[]) => mocks.uploadMediaFile(...args),
    openPrivateMediaFile: vi.fn(),
  };
});
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return { ...actual, trackEvent: (...args: unknown[]) => mocks.trackEvent(...args) };
});

const { RecordsManager } = await import("./RecordsManager");
const { ApiClientError } = await import("@/services/apiClient");

const milo = mockPets[0];
const TARGET_ID = "5b7c0d2e-0000-4000-8000-000000000001";

const today = (() => {
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

type BackendDocument = NonNullable<BackendCareRecord["documents"]>[number];

function backendDocument(id: string, name: string, sortOrder = 0): BackendDocument {
  return {
    id,
    originalFileName: name,
    contentType: "application/pdf",
    fileSizeBytes: name.length,
    category: "VaccinationDocument",
    sortOrder,
  };
}

function target(): BackendCareRecord {
  return {
    id: TARGET_ID,
    petId: milo.id,
    type: "Vaccine",
    title: "Rabies booster",
    careName: "Nobivac Rabies",
    date: "2025-10-12",
    dueDate: "2026-10-12",
    fulfillsCareRecordId: null,
    provider: "Klinik Haiwan Damansara",
    notes: "Mild swelling last time",
    publicVisibility: "PublicBadgeOnly",
    derivedStatus: "overdue",
    createdAt: "2025-10-12T02:00:00Z",
    updatedAt: "2025-10-12T02:00:00Z",
    archivedAt: null,
    documents: [],
  };
}

/** A completing record with exactly what this test's draft sends. */
function completing(documents: BackendDocument[], overrides: Partial<BackendCareRecord> = {}): BackendCareRecord {
  return {
    ...target(),
    id: "completing-record",
    date: today,
    dueDate: null,
    fulfillsCareRecordId: TARGET_ID,
    provider: "",
    notes: "Booster went well",
    publicVisibility: "Private",
    derivedStatus: "complete",
    createdAt: new Date().toISOString(),
    documents,
    ...overrides,
  };
}

let completion: BackendCareRecord | null;
let createOutcome: () => Promise<unknown>;

function route(path: string, init?: { method?: string }) {
  if (init?.method === "POST") return createOutcome();
  if (path.endsWith("/completion")) {
    return Promise.resolve({
      data: {
        state: completion ? "completed" : "pending",
        asOfDate: today,
        petName: milo.name,
        target: target(),
        completion,
      },
      meta: { requestId: "r" },
    });
  }
  if (path.includes("/care-records?")) {
    return Promise.resolve({ data: [], meta: { requestId: "r", page: 1, pageSize: 100, total: 0 } });
  }
  return Promise.reject(new Error(`Unexpected request ${path}`));
}

const dropped = () =>
  Promise.reject(
    new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now. Please try again.")
  );
const alreadyFulfilled = () =>
  Promise.reject(
    new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
      fulfillsCareRecordId: ["This care record has already been fulfilled by another record."],
    })
  );

function pdf(name: string) {
  return new File([name], name, { type: "application/pdf" });
}

function stage(...uploads: Array<[mediaId: string, file: File]>) {
  for (const [mediaId, file] of uploads) {
    mocks.uploadMediaFile.mockResolvedValueOnce({
      mediaId,
      status: "Ready",
      originalFileName: file.name,
      contentType: file.type,
      fileSizeBytes: file.size,
    });
  }
}

async function openAndFill(...files: File[]) {
  window.history.replaceState({}, "", `/pets/${milo.id}/records?complete=${TARGET_ID}`);
  render(<RecordsManager initialRecords={[]} petId={milo.id} />);
  const dialog = await screen.findByRole("dialog", { name: "Log completed care" });
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Booster went well" } });
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  if (files.length) fireEvent.change(input, { target: { files } });
  for (const file of files) expect(await screen.findByText(file.name)).toBeTruthy();
}

async function save() {
  fireEvent.click(screen.getByRole("button", { name: "Save care record" }));
  await waitFor(() =>
    expect(mocks.apiRequest.mock.calls.some(([, init]) => (init as { method?: string })?.method === "POST")).toBe(true)
  );
}

function sentMediaIds() {
  const post = mocks.apiRequest.mock.calls.find(([, init]) => (init as { method?: string })?.method === "POST");
  return ((post![1] as { body: { mediaFileIds?: string[] } }).body.mediaFileIds) ?? [];
}

function saveButton() {
  return screen.getByRole("button", { name: "Save care record" }) as HTMLButtonElement;
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.apiRequest.mockImplementation(route);
  mocks.deleteMedia.mockResolvedValue(undefined);
  completion = null;
  createOutcome = dropped;
});

afterEach(() => cleanup());

describe("Reconciling a Log as done save with attachments", () => {
  it("keeps the draft when the record with these details has no certificate", async () => {
    stage(["media-new", pdf("certificate.pdf")]);
    await openAndFill(pdf("certificate.pdf"));
    // Another tab's identical text won, without the certificate; this
    // response was lost.
    createOutcome = () => {
      completion = completing([]);
      return dropped();
    };
    await save();

    expect(sentMediaIds()).toEqual(["media-new"]);
    expect(
      await screen.findByText(/is logged as done on .* with the same details but different attachments. We can't tell yet whether your save went through/)
    ).toBeTruthy();
    expect(screen.queryByText(/Care is already logged|with your details and attachments/)).toBeNull();
    expect(screen.getByRole("dialog", { name: "Log completed care" })).toBeTruthy();
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Booster went well");
    expect(saveButton().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
    // The staged file may belong to a saved record: never deleted while unknown.
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });

  it("keeps the draft when the record carries a different certificate", async () => {
    stage(["media-new", pdf("certificate.pdf")]);
    await openAndFill(pdf("certificate.pdf"));
    createOutcome = () => {
      // Same name, different stored file: names prove nothing.
      completion = completing([backendDocument("media-other", "certificate.pdf")]);
      return dropped();
    };
    await save();

    expect(await screen.findByText(/with the same details but different attachments/)).toBeTruthy();
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });

  it("confirms a dropped response only when the record carries exactly the files this save uploaded", async () => {
    stage(["media-new", pdf("certificate.pdf")]);
    await openAndFill(pdf("certificate.pdf"));
    createOutcome = () => {
      completion = completing([backendDocument("media-new", "certificate.pdf")]);
      return dropped();
    };
    await save();

    expect(
      await screen.findByText("Nobivac Rabies for Milo is logged as done with your details and attachments.")
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });

  it("compares attachments as a set, so their order does not matter", async () => {
    stage(["media-a", pdf("certificate.pdf")], ["media-b", pdf("card.pdf")]);
    await openAndFill(pdf("certificate.pdf"), pdf("card.pdf"));
    createOutcome = () => {
      completion = completing([
        backendDocument("media-b", "card.pdf", 0),
        backendDocument("media-a", "certificate.pdf", 1),
      ]);
      return dropped();
    };
    await save();

    expect(sentMediaIds()).toEqual(["media-a", "media-b"]);
    expect(await screen.findByText(/is logged as done with your details and attachments/)).toBeTruthy();
  });

  it("does not confirm when one of several files is missing", async () => {
    stage(["media-a", pdf("certificate.pdf")], ["media-b", pdf("card.pdf")]);
    await openAndFill(pdf("certificate.pdf"), pdf("card.pdf"));
    createOutcome = () => {
      completion = completing([backendDocument("media-a", "certificate.pdf")]);
      return dropped();
    };
    await save();

    expect(await screen.findByText(/with the same details but different attachments/)).toBeTruthy();
    expect(screen.getByText("card.pdf")).toBeTruthy();
  });

  it("keeps the draft and the staged files when the check itself fails", async () => {
    stage(["media-new", pdf("certificate.pdf")]);
    await openAndFill(pdf("certificate.pdf"));
    createOutcome = () => {
      mocks.apiRequest.mockImplementation((path: string, init?: { method?: string }) =>
        path.endsWith("/completion") ? dropped() : route(path, init)
      );
      return dropped();
    };
    await save();

    expect(await screen.findByText(/We couldn't check whether this was saved/)).toBeTruthy();
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });

  it("resets the form only after confirmation, never while the save is unknown", async () => {
    stage(["media-new", pdf("certificate.pdf")]);
    await openAndFill(pdf("certificate.pdf"));
    await save();

    // Nothing completes the item yet.
    expect(await screen.findByText(/We can't confirm this save yet/)).toBeTruthy();
    expect(screen.getByText("certificate.pdf")).toBeTruthy();

    // The original request lands later.
    completion = completing([backendDocument("media-new", "certificate.pdf")]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });

    expect(await screen.findByText(/is logged as done with your details and attachments/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.uploadMediaFile).toHaveBeenCalledTimes(1);
    expect(mocks.apiRequest.mock.calls.filter(([, init]) => (init as { method?: string })?.method === "POST")).toHaveLength(1);
  });

  it("after a refusal because another tab won without attachments, keeps the draft and offers no unlinked save", async () => {
    stage(["media-new", pdf("certificate.pdf")]);
    await openAndFill(pdf("certificate.pdf"));
    completion = completing([]);
    createOutcome = alreadyFulfilled;
    await save();

    expect(
      await screen.findByText(/was already logged as done on .* with the same details but different attachments, so this save wasn't recorded/)
    ).toBeTruthy();
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save as a separate record" })).toBeNull();
    // A definite refusal wrote nothing, so the staged copy is released; the
    // draft still holds the file itself.
    expect(mocks.deleteMedia).toHaveBeenCalledWith("media-new");
  });
});
