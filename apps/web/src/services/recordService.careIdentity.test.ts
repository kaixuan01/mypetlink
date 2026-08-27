// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CareRecord } from "@/types";
import {
  createRecord,
  deleteRecord,
  getPetRecords,
  projectLocalPublicCareRecords,
  updateRecord,
} from "./recordService";

const storageKey = "mypetlink_records";

describe("offline care identity and explicit fulfilment", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("persists trimmed identity, allows early fulfilment, and round-trips it", async () => {
    seed([record("target", { dueDate: "20 Sep 2026" })]);

    const created = await createRecord("pet-1", {
      type: "Vaccine",
      title: "Unrelated title",
      careName: "  Annual booster  ",
      date: "25 Aug 2026",
      fulfillsCareRecordId: "target",
    });
    const saved = (await getPetRecords("pet-1")).data.find(
      (item) => item.id === created.data.id
    );

    expect(created.data.careName).toBe("Annual booster");
    expect(created.data.fulfillsCareRecordId).toBe("target");
    expect(saved).toMatchObject({
      careName: "Annual booster",
      fulfillsCareRecordId: "target",
    });
  });

  it("preserves omitted identity and clears only explicitly supplied fields", async () => {
    seed([
      record("target", { dueDate: "20 Sep 2026" }),
      record("fulfiller", {
        careName: "Annual booster",
        fulfillsCareRecordId: "target",
        createdAt: "2026-08-20T01:00:00Z",
      }),
    ]);

    const preserved = await updateRecord("fulfiller", { title: "Renamed" });
    const cleared = await updateRecord("fulfiller", {
      careName: undefined,
      fulfillsCareRecordId: undefined,
    });

    expect(preserved.data).toMatchObject({
      careName: "Annual booster",
      fulfillsCareRecordId: "target",
    });
    expect(cleared.data?.careName).toBeUndefined();
    expect(cleared.data?.fulfillsCareRecordId).toBeUndefined();
  });

  it("normalizes blank care names and enforces the shared maximum", async () => {
    const blank = await createRecord("pet-1", { careName: "   " });

    expect(blank.data.careName).toBeUndefined();
    await expect(
      createRecord("pet-1", { careName: "x".repeat(121) })
    ).rejects.toThrow("120 characters or fewer");
  });

  it("fails closed for duplicate, cross-pet, type, due-date, self, and cycle cases", async () => {
    seed([
      record("target", { dueDate: "20 Sep 2026" }),
      record("claim", {
        fulfillsCareRecordId: "target",
        dueDate: "20 Oct 2026",
        createdAt: "2026-08-20T01:00:00Z",
      }),
      record("other-pet", { petId: "pet-2", dueDate: "20 Sep 2026" }),
      record("wrong-type", { type: "Grooming", dueDate: "20 Sep 2026" }),
      record("no-due"),
      record("newer", {
        dueDate: "20 Sep 2026",
        createdAt: "2026-08-20T02:00:00Z",
      }),
    ]);

    await expect(
      updateRecord("newer", { fulfillsCareRecordId: "target" })
    ).rejects.toThrow("already been fulfilled");
    await expect(
      createRecord("pet-1", { type: "Vaccine", fulfillsCareRecordId: "other-pet" })
    ).rejects.toThrow("same pet");
    await expect(
      createRecord("pet-1", { type: "Vaccine", fulfillsCareRecordId: "wrong-type" })
    ).rejects.toThrow("same care type");
    await expect(
      createRecord("pet-1", { type: "Vaccine", fulfillsCareRecordId: "no-due" })
    ).rejects.toThrow("next due date");
    await expect(
      updateRecord("target", { fulfillsCareRecordId: "target" })
    ).rejects.toThrow("cannot fulfil itself");
    await expect(
      updateRecord("target", { fulfillsCareRecordId: "claim" })
    ).rejects.toThrow("cycle");
  });

  it("keeps care identity out of the public projection", () => {
    const projected = projectLocalPublicCareRecords(
      [
        record("target", {
          careName: "Private identity",
          fulfillsCareRecordId: "older-record",
          publicVisibility: "Public badge only",
        }),
      ],
      true
    );

    expect(projected).toEqual([{ type: "Vaccine", recordDate: "20 Aug 2026" }]);
    expect(Object.keys(projected[0]).sort()).toEqual(["recordDate", "type"]);
  });

  it("clears incoming local relationships when their target is deleted", async () => {
    seed([
      record("target", { dueDate: "20 Sep 2026" }),
      record("fulfiller", {
        fulfillsCareRecordId: "target",
        createdAt: "2026-08-20T01:00:00Z",
      }),
    ]);

    await deleteRecord("target");
    const records = (await getPetRecords("pet-1")).data;

    expect(records.find((item) => item.id === "target")).toBeUndefined();
    expect(
      records.find((item) => item.id === "fulfiller")?.fulfillsCareRecordId
    ).toBeUndefined();
  });

  it("rejects local edits that would invalidate an active incoming relationship", async () => {
    seed([
      record("target", { dueDate: "20 Sep 2026" }),
      record("fulfiller", {
        fulfillsCareRecordId: "target",
        createdAt: "2026-08-20T01:00:00Z",
      }),
    ]);

    await expect(updateRecord("target", { dueDate: undefined })).rejects.toThrow(
      "before removing this next due date"
    );
    await expect(
      updateRecord("target", { type: "Medication" })
    ).rejects.toThrow("before changing this record type");

    const target = (await getPetRecords("pet-1")).data.find(
      (item) => item.id === "target"
    );
    expect(target).toMatchObject({ type: "Vaccine", dueDate: "20 Sep 2026" });
  });
});

function seed(records: CareRecord[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(records));
}

function record(id: string, overrides: Partial<CareRecord> = {}): CareRecord {
  return {
    id,
    petId: "pet-1",
    type: "Vaccine",
    title: "Care record",
    date: "20 Aug 2026",
    provider: "Owner recorded",
    notes: "No notes yet.",
    publicVisibility: "Private",
    status: "complete",
    createdAt: "2026-08-20T00:00:00Z",
    updatedAt: "2026-08-20T00:00:00Z",
    ...overrides,
  };
}
