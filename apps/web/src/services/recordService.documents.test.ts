// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendCareRecord } from "./apiDtos";
import type { CareDocument } from "@/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  deleteMedia: vi.fn(),
  uploadMediaFile: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({ canUseApi: () => true }));
vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
  };
});
vi.mock("@/services/mediaService", () => ({
  deleteMedia: (...args: unknown[]) => mocks.deleteMedia(...args),
  uploadMediaFile: (...args: unknown[]) => mocks.uploadMediaFile(...args),
}));

const { createRecord, updateRecord } = await import("./recordService");
const { ApiClientError } = await import("@/services/apiClient");

describe("recordService care documents", () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.deleteMedia.mockReset().mockResolvedValue(undefined);
    mocks.uploadMediaFile.mockReset();
  });

  it("stages multiple files for the pet and saves their ordered media IDs", async () => {
    const certificate = file("certificate.pdf", "application/pdf");
    const card = file("card.png", "image/png");
    mocks.uploadMediaFile
      .mockResolvedValueOnce(uploaded("media-a", certificate))
      .mockResolvedValueOnce(uploaded("media-b", card));
    mocks.apiRequest.mockResolvedValue({
      data: backendRecord([
        backendDocument("media-a", certificate, 0),
        backendDocument("media-b", card, 1),
      ]),
    });

    const response = await createRecord("pet-1", {
      type: "Vaccine",
      title: "Annual vaccination",
      date: "2026-08-20",
      documents: [draft("draft-a", certificate, 0), draft("draft-b", card, 1)],
    });

    expect(mocks.uploadMediaFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        file: certificate,
        category: "VaccinationDocument",
        petId: "pet-1",
        cleanupOnFailure: true,
      })
    );
    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/v1/pets/pet-1/care-records",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ mediaFileIds: ["media-a", "media-b"] }),
      })
    );
    expect(response.data.documents?.map((document) => document.fileName)).toEqual([
      "certificate.pdf",
      "card.png",
    ]);
  });

  it("preserves care identity while replacing A/B with A/C", async () => {
    const addedFile = file("c.png", "image/png");
    mocks.uploadMediaFile.mockResolvedValue(uploaded("media-c", addedFile));
    mocks.apiRequest.mockResolvedValue({
      data: backendRecord([
        backendDocument("media-a", file("a.pdf", "application/pdf"), 0),
        backendDocument("media-c", addedFile, 1),
      ]),
    });

    await updateRecord(
      "record-1",
      {
        type: "Vaccine",
        title: "Annual booster",
        careName: "DHPP",
        fulfillsCareRecordId: "older-record",
        documents: [saved("media-a", "a.pdf", 0), draft("draft-c", addedFile, 1)],
      },
      "pet-1"
    );

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/v1/care-records/record-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({
          careName: "DHPP",
          fulfillsCareRecordId: "older-record",
          mediaFileIds: ["media-a", "media-c"],
        }),
      })
    );
  });

  it("cleans newly staged files when a later upload or care save fails", async () => {
    const first = file("first.pdf", "application/pdf");
    const second = file("second.pdf", "application/pdf");
    mocks.uploadMediaFile
      .mockResolvedValueOnce(uploaded("media-first", first))
      .mockRejectedValueOnce(new Error("Upload failed."));

    await expect(
      createRecord("pet-1", {
        type: "Vaccine",
        documents: [draft("draft-first", first, 0), draft("draft-second", second, 1)],
      })
    ).rejects.toThrow("second.pdf");
    expect(mocks.deleteMedia).toHaveBeenCalledWith("media-first");

    // A refused save wrote nothing, so its staged files are cleaned up.
    mocks.deleteMedia.mockClear();
    mocks.uploadMediaFile.mockReset().mockResolvedValue(uploaded("media-save", first));
    mocks.apiRequest.mockRejectedValue(
      new ApiClientError(400, "validation_failed", "Save failed.")
    );
    await expect(
      createRecord("pet-1", {
        type: "Vet Visit",
        documents: [draft("draft-save", first, 0)],
      })
    ).rejects.toThrow("Save failed");
    expect(mocks.deleteMedia).toHaveBeenCalledWith("media-save");
  });

  it.each([
    ["a dropped connection", () => new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now.")],
    ["a server failure", () => new ApiClientError(503, "http_503", "Unavailable")],
    ["a raw network failure", () => new TypeError("Failed to fetch")],
  ])("keeps staged files when %s leaves the save's outcome unknown", async (_label, error) => {
    // The record may have been saved with these files attached; deleting
    // them could strip a saved record.
    const certificate = file("certificate.pdf", "application/pdf");
    mocks.uploadMediaFile.mockResolvedValue(uploaded("media-kept", certificate));
    mocks.apiRequest.mockRejectedValue(error());

    await expect(
      createRecord("pet-1", {
        type: "Vaccine",
        documents: [draft("draft-kept", certificate, 0)],
      })
    ).rejects.toBeTruthy();
    expect(mocks.deleteMedia).not.toHaveBeenCalled();
  });

  it("tells the caller exactly which stored files a request carries, just before sending it", async () => {
    const kept = saved("media-kept", "old.pdf", 0);
    const certificate = file("certificate.pdf", "application/pdf");
    mocks.uploadMediaFile.mockResolvedValue(uploaded("media-new", certificate));
    const onSending = vi.fn(() => {
      expect(mocks.apiRequest).not.toHaveBeenCalled();
    });
    mocks.apiRequest.mockRejectedValue(new ApiClientError(0, "service_unavailable", "Unreachable"));

    await expect(
      createRecord(
        "pet-1",
        { type: "Vaccine", documents: [kept, draft("draft-new", certificate, 1)] },
        { onSending }
      )
    ).rejects.toBeTruthy();

    expect(onSending).toHaveBeenCalledExactlyOnceWith({
      mediaFileIds: ["media-kept", "media-new"],
      uploadedMediaFileIds: ["media-new"],
    });
    expect(mocks.apiRequest.mock.calls[0]![1]).toMatchObject({
      body: { mediaFileIds: ["media-kept", "media-new"] },
    });
  });

  it("never reports a request as sent when an upload failed first", async () => {
    const certificate = file("certificate.pdf", "application/pdf");
    mocks.uploadMediaFile.mockRejectedValue(new Error("Upload failed."));
    const onSending = vi.fn();

    await expect(
      createRecord("pet-1", { type: "Vaccine", documents: [draft("draft", certificate, 0)] }, { onSending })
    ).rejects.toThrow("certificate.pdf");

    expect(onSending).not.toHaveBeenCalled();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});

function file(name: string, type: string) {
  return new File([name], name, { type });
}

function draft(id: string, sourceFile: File, sortOrder: number): CareDocument {
  return {
    id,
    fileName: sourceFile.name,
    contentType: sourceFile.type,
    fileSizeBytes: sourceFile.size,
    category: "VaccinationDocument",
    sortOrder,
    sourceFile,
  };
}

function saved(id: string, fileName: string, sortOrder: number): CareDocument {
  return {
    id,
    fileName,
    contentType: "application/pdf",
    fileSizeBytes: 1024,
    category: "VaccinationDocument",
    sortOrder,
  };
}

function uploaded(id: string, sourceFile: File) {
  return {
    mediaId: id,
    status: "Ready" as const,
    originalFileName: sourceFile.name,
    contentType: sourceFile.type,
    fileSizeBytes: sourceFile.size,
  };
}

function backendDocument(id: string, sourceFile: File, sortOrder: number) {
  return {
    id,
    originalFileName: sourceFile.name,
    contentType: sourceFile.type,
    fileSizeBytes: sourceFile.size,
    category: "VaccinationDocument" as const,
    sortOrder,
  };
}

function backendRecord(
  documents: ReturnType<typeof backendDocument>[]
): BackendCareRecord {
  return {
    id: "record-1",
    petId: "pet-1",
    type: "Vaccine",
    title: "Annual vaccination",
    careName: "DHPP",
    date: "2026-08-20",
    dueDate: "2027-08-20",
    fulfillsCareRecordId: "older-record",
    provider: "Happy Paws Vet",
    notes: "Owner notes",
    publicVisibility: "Private",
    derivedStatus: "upcoming",
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
    archivedAt: null,
    documents,
  };
}
