// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import { CareDataContractError } from "@/lib/careContracts";
import { getMalaysiaTodayIsoDate } from "@/lib/careRecordStatus";
import type { CareRecord, PetListItem } from "@/types";

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  canUseApi: vi.fn(),
  getPets: vi.fn(),
}));

vi.mock("@/services/apiConfig", () => ({
  canUseApi: () => mocks.canUseApi(),
  isApiConfigured: () => mocks.canUseApi(),
}));
vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return { ...actual, apiRequest: (...args: unknown[]) => mocks.apiRequest(...args) };
});
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/mockApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/mockApi")>();
  return { ...actual, mockDelay: async () => {} };
});

const { completeCareItem, getPetRecordsPage } = await import("./recordService");
const { ApiClientError } = await import("@/services/apiClient");

const today = getMalaysiaTodayIsoDate();
const KEY = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";

function backendRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "done",
    petId: "pet-a",
    type: "Vaccine",
    title: "Rabies booster",
    careName: null,
    date: today,
    dueDate: null,
    fulfillsCareRecordId: "target",
    provider: null,
    notes: null,
    publicVisibility: "Private",
    derivedStatus: "complete",
    createdAt: "2026-10-20T01:00:00Z",
    updatedAt: "2026-10-20T01:00:00Z",
    archivedAt: null,
    documents: [],
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  window.localStorage.clear();
});

afterEach(() => window.localStorage.clear());

describe("completeCareItem through the API", () => {
  beforeEach(() => mocks.canUseApi.mockReturnValue(true));

  it("sends the key and the chosen details, and maps the record it gets back", async () => {
    mocks.apiRequest.mockResolvedValue({ data: { outcome: "created", completion: backendRecord({ notes: "Went well" }) }, meta: {} });

    const result = await completeCareItem("target", {
      idempotencyKey: KEY,
      completedOn: today,
      nextDueDate: "",
      notes: "  Went well  ",
    });

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/care-records/target/complete", {
      method: "POST",
      body: { idempotencyKey: KEY, completedOn: today, nextDueDate: null, notes: "Went well" },
    });
    expect(result.outcome).toBe("created");
    expect(result.completion).toMatchObject({ id: "done", fulfillsCareRecordId: "target", notes: "Went well" });
  });

  it("accepts a replayed answer as the same completion", async () => {
    mocks.apiRequest.mockResolvedValue({ data: { outcome: "replayed", completion: backendRecord() }, meta: {} });

    expect((await completeCareItem("target", { idempotencyKey: KEY, completedOn: today })).outcome).toBe("replayed");
  });

  it.each([
    ["moved to another item", { fulfillsCareRecordId: "other" }],
    ["unlinked", { fulfillsCareRecordId: null }],
  ])("accepts a replay whose record was since %s: it acknowledges the original request", async (_label, overrides) => {
    mocks.apiRequest.mockResolvedValue({ data: { outcome: "replayed", completion: backendRecord(overrides) }, meta: {} });

    const result = await completeCareItem("target", { idempotencyKey: KEY, completedOn: today });

    expect(result.outcome).toBe("replayed");
    expect(result.completion.id).toBe("done");
  });

  it.each([
    ["an unknown outcome", { outcome: "maybe", completion: backendRecord() }],
    ["a record for another item", { outcome: "created", completion: backendRecord({ fulfillsCareRecordId: "other" }) }],
    ["an archived record", { outcome: "created", completion: backendRecord({ archivedAt: "2026-10-20T02:00:00Z" }) }],
    ["a record without its documents", { outcome: "created", completion: backendRecord({ documents: undefined }) }],
    ["the item itself", { outcome: "created", completion: backendRecord({ id: "target" }) }],
  ])("refuses %s", async (_label, data) => {
    mocks.apiRequest.mockResolvedValue({ data, meta: {} });

    await expect(completeCareItem("target", { idempotencyKey: KEY, completedOn: today })).rejects.toBeInstanceOf(
      CareDataContractError
    );
  });
});

describe("completeCareItem on local data follows the same rules", () => {
  const pet = { ...mockPets[0], id: "local-pet", name: "Oyen", lifecycleStatus: "Active" } as PetListItem;

  function record(id: string, extra: Partial<CareRecord> = {}): CareRecord {
    return {
      id,
      petId: pet.id,
      type: "Vaccine",
      title: "Rabies booster",
      date: "01 Jan 2026",
      dueDate: "12 Oct 2026",
      provider: "",
      notes: "",
      publicVisibility: "Public badge only",
      status: "overdue",
      createdAt: "2026-01-01T00:00:00Z",
      ...extra,
    };
  }

  beforeEach(() => {
    mocks.canUseApi.mockReturnValue(false);
    mocks.getPets.mockResolvedValue({ data: [pet] });
    window.localStorage.setItem("mypetlink_records", JSON.stringify([record("target")]));
  });

  it("writes one private completion, and a retry with the same key returns it", async () => {
    const first = await completeCareItem("target", { idempotencyKey: KEY, completedOn: today, notes: "Clinic" });
    const second = await completeCareItem("target", { idempotencyKey: KEY, completedOn: today, notes: "Clinic" });

    expect(first.outcome).toBe("created");
    expect(first.completion).toMatchObject({ fulfillsCareRecordId: "target", publicVisibility: "Private", notes: "Clinic" });
    expect(second).toMatchObject({ outcome: "replayed", completion: { id: first.completion.id } });
    const stored = JSON.parse(window.localStorage.getItem("mypetlink_records")!) as CareRecord[];
    expect(stored.filter((item) => item.fulfillsCareRecordId === "target")).toHaveLength(1);
  });

  it.each([
    ["the same key for a different request", async () => {
      await completeCareItem("target", { idempotencyKey: KEY, completedOn: today });
      return completeCareItem("target", { idempotencyKey: KEY, completedOn: today, notes: "Different" });
    }, "idempotency_key_conflict"],
    ["an item already logged", async () => {
      await completeCareItem("target", { idempotencyKey: KEY, completedOn: today });
      return completeCareItem("target", { idempotencyKey: "another-key", completedOn: today });
    }, "care_item_completed"],
  ])("refuses %s", async (_label, run, code) => {
    await expect(run()).rejects.toMatchObject({ status: 409, code });
  });

  it.each([
    ["deleted", { archivedAt: "2026-10-19T00:00:00Z" }, "care_item_archived"],
    ["undated", { dueDate: undefined }, "care_item_no_due_date"],
  ])("refuses an item that was %s", async (_label, extra, code) => {
    window.localStorage.setItem("mypetlink_records", JSON.stringify([record("target", extra)]));

    await expect(completeCareItem("target", { idempotencyKey: KEY, completedOn: today })).rejects.toMatchObject({ code });
  });

  it("refuses a day in the future and a next date before the done day", async () => {
    await expect(
      completeCareItem("target", { idempotencyKey: KEY, completedOn: "2999-01-01" })
    ).rejects.toBeInstanceOf(ApiClientError);
    await expect(
      completeCareItem("target", { idempotencyKey: KEY, completedOn: today, nextDueDate: "2000-01-01" })
    ).rejects.toMatchObject({ status: 400, details: { nextDueDate: expect.any(Array) } });
  });
});

describe("getPetRecordsPage", () => {
  it("asks for the page and returns the exact total", async () => {
    mocks.canUseApi.mockReturnValue(true);
    mocks.apiRequest.mockResolvedValue({ data: [backendRecord()], meta: { total: 140, page: 2, pageSize: 100 } });

    const page = await getPetRecordsPage("pet-a", 2);

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/pets/pet-a/care-records?page=2&pageSize=100");
    expect(page.total).toBe(140);
    expect(page.records).toHaveLength(1);
  });

  it("refuses a page without a total", async () => {
    mocks.canUseApi.mockReturnValue(true);
    mocks.apiRequest.mockResolvedValue({ data: [], meta: {} });

    await expect(getPetRecordsPage("pet-a", 2)).rejects.toThrow();
  });
});
