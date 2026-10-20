import { describe, expect, it } from "vitest";
import {
  assessCompletionRecovery,
  sameMediaSet,
  type CareSaveAttempt,
} from "@/lib/careSaveRecovery";
import type { CareCompletionStatus, CareRecord, RecordPayload } from "@/types";

const payload: RecordPayload = {
  type: "Vaccine",
  title: "Rabies booster",
  careName: "Nobivac Rabies",
  date: "20 Oct 2026",
  provider: "",
  notes: "Booster went well",
  publicVisibility: "Private",
  fulfillsCareRecordId: "target",
};

function attempt(overrides: Partial<CareSaveAttempt> = {}): CareSaveAttempt {
  return {
    id: 1,
    targetId: "target",
    payload,
    editorGeneration: 1,
    phase: "unknown",
    mediaFileIds: [],
    uploadedFiles: false,
    ...overrides,
  };
}

function record(overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id: "done",
    petId: "pet-a",
    type: "Vaccine",
    title: "Rabies booster",
    careName: "Nobivac Rabies",
    date: "20 Oct 2026",
    provider: "",
    notes: "Booster went well",
    publicVisibility: "Private",
    status: "complete",
    fulfillsCareRecordId: "target",
    documents: [],
    createdAt: "2026-10-20T01:00:00Z",
    ...overrides,
  };
}

const doc = (id: string) => ({
  id,
  fileName: "certificate.pdf",
  contentType: "application/pdf",
  fileSizeBytes: 10,
  category: "VaccinationDocument" as const,
  sortOrder: 0,
});

function status(
  state: CareCompletionStatus["state"],
  completion: CareRecord | null,
  targetId = "target"
): CareCompletionStatus {
  return {
    state,
    asOfDate: "2026-10-20",
    petName: "Oyen",
    target: record({ id: targetId, fulfillsCareRecordId: undefined, dueDate: "12 Oct 2026" }),
    completion,
  };
}

describe("assessCompletionRecovery", () => {
  it("confirms by details only when the save carried no new files", () => {
    expect(assessCompletionRecovery(attempt(), status("completed", record()))).toMatchObject({
      kind: "confirmed",
      proof: "details",
    });
  });

  it("confirms by attachments when the record carries this save's uploads", () => {
    const result = assessCompletionRecovery(
      attempt({ mediaFileIds: ["m1"], uploadedFiles: true }),
      status("completed", record({ documents: [doc("m1")] }))
    );
    expect(result).toMatchObject({ kind: "confirmed", proof: "attachments" });
  });

  it.each([
    ["missing", []],
    ["different", [doc("m2")]],
    ["extra", [doc("m1"), doc("m2")]],
  ])("refuses to confirm %s attachments under the same text", (_label, documents) => {
    const result = assessCompletionRecovery(
      attempt({ mediaFileIds: ["m1"], uploadedFiles: true }),
      status("completed", record({ documents }))
    );
    expect(result.kind).toBe("different-attachments");
  });

  it("reports other details as a conflict", () => {
    expect(
      assessCompletionRecovery(attempt(), status("completed", record({ notes: "Partner logged it" }))).kind
    ).toBe("conflict");
  });

  it.each(["archived", "pet-archived", "no-due-date"] as const)(
    "never confirms on a %s target, even with a matching record",
    (state) => {
      const result = assessCompletionRecovery(attempt(), status(state, record()));
      expect(result).toMatchObject({ kind: "target-changed", state });
    }
  );

  it("never settles an attempt from another item's status", () => {
    expect(assessCompletionRecovery(attempt(), status("completed", record(), "other")).kind).toBe("not-found");
  });

  it("treats pending as not found", () => {
    expect(assessCompletionRecovery(attempt(), status("pending", null)).kind).toBe("not-found");
  });
});

describe("sameMediaSet", () => {
  it("ignores order", () => {
    expect(sameMediaSet([doc("b"), doc("a")], ["a", "b"])).toBe(true);
  });

  it("rejects repeats that would hide a missing file", () => {
    expect(sameMediaSet([doc("a"), doc("a")], ["a", "b"])).toBe(false);
    expect(sameMediaSet([doc("a")], ["a", "a"])).toBe(false);
  });
});
