// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendUpcomingCareRecord } from "@/services/apiDtos";
import type { CareRecord, PetListItem } from "@/types";
import { mockPets } from "@/data/mockPets";
import { CareDataContractError } from "@/lib/careContracts";

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
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => mocks.apiRequest(...args),
  };
});
vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));
vi.mock("@/services/mockApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/mockApi")>();
  return { ...actual, mockDelay: async () => {} };
});

const {
  getCareCompletionStatus,
  getUpcomingCarePage,
  getUpcomingCareSummary,
} = await import("./recordService");

function backendItem(index: number, overrides: Partial<BackendUpcomingCareRecord> = {}) {
  return {
    id: `item-${index}`,
    petId: "pet-a",
    petName: "Oyen",
    type: "VetVisit",
    title: `Item ${index}`,
    careName: null,
    dueDate: "2026-11-02",
    derivedStatus: "due-soon",
    ...overrides,
  } satisfies BackendUpcomingCareRecord;
}

function backendPage(
  items: BackendUpcomingCareRecord[],
  meta: Record<string, unknown> = { page: 1, pageSize: 100, total: items.length },
  data: Record<string, unknown> = {}
) {
  return {
    data: { asOfDate: "2026-10-20", petIdsWithCareRecords: ["pet-a"], items, ...data },
    meta: { requestId: "r", ...meta },
  };
}

function scope(petId: string | null, items: BackendUpcomingCareRecord[], counts: Partial<Record<string, unknown>> = {}) {
  return {
    petId,
    hasCareRecords: true,
    pendingCount: items.length,
    dueWithinHorizonCount: items.length,
    overdueCount: 0,
    items,
    ...counts,
  };
}

/** Rows for one pet: `upcoming` (after the horizon) unless overdue. */
function petRow(petId: string, key: string, dueDate: string, derivedStatus = "upcoming") {
  return backendItem(0, { id: `${petId}-${key}`, petId, title: key, dueDate, derivedStatus });
}

function crossScopeContradiction() {
  const aOverdue = petRow("pet-a", "overdue", "2026-10-12", "overdue");
  const a = ["2026-12-01", "2026-12-02", "2026-12-03"].map((due, index) => petRow("pet-a", `future-${index + 1}`, due));
  const b = ["2026-12-01", "2026-12-02", "2026-12-03"].map((due, index) => petRow("pet-b", `future-${index + 1}`, due));
  return [
    scope(null, [aOverdue, a[0], b[0]], { pendingCount: 8, dueWithinHorizonCount: 1, overdueCount: 1 }),
    scope("pet-a", a, { pendingCount: 4, dueWithinHorizonCount: 0, overdueCount: 0 }),
    scope("pet-b", b, { pendingCount: 4, dueWithinHorizonCount: 1, overdueCount: 1 }),
  ];
}

/** One overdue row counted as pending only. */
function overdueUncounted(petId: string | null = null) {
  return scope(petId, [backendItem(1, { dueDate: "2026-10-12", derivedStatus: "overdue" })], {
    pendingCount: 1,
    dueWithinHorizonCount: 0,
    overdueCount: 0,
  });
}

function backendSummary(overrides: Record<string, unknown> = {}) {
  const a = backendItem(1);
  return {
    data: {
      asOfDate: "2026-10-20",
      horizonDate: "2026-11-19",
      complete: true,
      scopes: [scope(null, [a]), scope("pet-a", [a]), scope("pet-b", [], { hasCareRecords: false })],
      ...overrides,
    },
    meta: { requestId: "r" },
  };
}

beforeEach(() => {
  mocks.apiRequest.mockReset();
  mocks.canUseApi.mockReset();
  mocks.getPets.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("the paged pending-care read", () => {
  beforeEach(() => mocks.canUseApi.mockReturnValue(true));

  it("requests the owner-wide page and maps it for display", async () => {
    mocks.apiRequest.mockResolvedValue(backendPage([backendItem(1, { careName: "  Annual check  " })]));

    const page = await getUpcomingCarePage({ petId: "pet-a" });

    expect(mocks.apiRequest).toHaveBeenCalledWith(
      "/api/v1/care-records/upcoming?page=1&pageSize=100&petId=pet-a"
    );
    expect(page.meta.total).toBe(1);
    expect(page.data.items[0]).toEqual({
      id: "item-1",
      petId: "pet-a",
      petName: "Oyen",
      type: "Vet Visit",
      title: "Item 1",
      careName: "Annual check",
      dueDate: "02 Nov 2026",
      dueDateIso: "2026-11-02",
      status: "due-soon",
    });
  });

  it.each([
    ["a different page", { page: 9, pageSize: 100, total: 1 }, {}],
    ["no page size", { page: 1, total: 1 }, {}],
    ["a zero page size", { page: 1, pageSize: 0, total: 1 }, {}],
    ["no total", { page: 1, pageSize: 100 }, {}],
    ["a negative total", { page: 1, pageSize: 100, total: -1 }, {}],
    ["a fractional total", { page: 1, pageSize: 100, total: 1.5 }, {}],
    ["more rows than the total allows", { page: 1, pageSize: 100, total: 0 }, {}],
    ["no reference day", { page: 1, pageSize: 100, total: 1 }, { asOfDate: undefined }],
    ["an impossible reference day", { page: 1, pageSize: 100, total: 1 }, { asOfDate: "2026-02-31" }],
    ["no pet coverage", { page: 1, pageSize: 100, total: 1 }, { petIdsWithCareRecords: undefined }],
  ])("refuses a page with %s", async (_label, meta, data) => {
    mocks.apiRequest.mockResolvedValue(backendPage([backendItem(1)], meta, data));

    await expect(getUpcomingCarePage()).rejects.toBeInstanceOf(CareDataContractError);
  });

  it.each([
    ["no due date", { dueDate: undefined }],
    ["an unknown status", { derivedStatus: "complete" }],
    ["no title", { title: "" }],
    ["no id", { id: "" }],
  ])("refuses an item with %s", async (_label, overrides) => {
    mocks.apiRequest.mockResolvedValue(
      backendPage([backendItem(1, overrides as Partial<BackendUpcomingCareRecord>)])
    );

    await expect(getUpcomingCarePage()).rejects.toBeInstanceOf(CareDataContractError);
  });
});

describe("the Dashboard care summary", () => {
  beforeEach(() => mocks.canUseApi.mockReturnValue(true));

  it("is one read of one consistent summary", async () => {
    mocks.apiRequest.mockResolvedValue(backendSummary());

    const summary = await getUpcomingCareSummary();

    expect(mocks.apiRequest).toHaveBeenCalledOnce();
    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/care-records/upcoming/summary");
    expect(summary.complete).toBe(true);
    expect(summary.horizonDate).toBe("2026-11-19");
    expect(summary.scopes.map((item) => item.petId)).toEqual([null, "pet-a", "pet-b"]);
    expect(summary.scopes[1].items[0]).toMatchObject({ type: "Vet Visit", dueDate: "02 Nov 2026" });
  });

  it.each([
    ["no horizon", { horizonDate: undefined }],
    ["a horizon before its reference day", { horizonDate: "2026-10-01" }],
    ["no completeness", { complete: undefined }],
    ["no all-pets scope", { scopes: [scope("pet-a", [backendItem(1)])] }],
    ["two all-pets scopes", { scopes: [scope(null, []), scope(null, [])] }],
    ["a repeated pet", { scopes: [scope(null, [backendItem(1), backendItem(2)]), scope("pet-a", [backendItem(1)]), scope("pet-a", [backendItem(2)])] }],
    ["pet counts that do not add up", { scopes: [scope(null, [backendItem(1)], { pendingCount: 2, dueWithinHorizonCount: 2 }), scope("pet-a", [backendItem(1)])] }],
    ["counts that disagree", { scopes: [scope(null, [], { pendingCount: 0, dueWithinHorizonCount: 1 }), scope("pet-a", [], { pendingCount: 0, dueWithinHorizonCount: 1 })] }],
    ["pending care without records", { scopes: [scope(null, [backendItem(1)], { hasCareRecords: false }), scope("pet-a", [backendItem(1)], { hasCareRecords: false })] }],
    ["another pet's item in a pet scope", { scopes: [scope(null, [backendItem(1)]), scope("pet-b", [backendItem(1)])] }],
    ["fewer items than a complete summary counts", { scopes: [scope(null, [], { pendingCount: 1, dueWithinHorizonCount: 1 }), scope("pet-a", [], { pendingCount: 1, dueWithinHorizonCount: 1 })] }],
    ["a malformed item", { scopes: [scope(null, [backendItem(1, { dueDate: "soon" })]), scope("pet-a", [backendItem(1, { dueDate: "soon" })])] }],
    // The review's reproducer: an overdue row counted as neither overdue nor
    // due, which would otherwise read as "Nothing due".
    ["an overdue row that is not counted as overdue", { scopes: [overdueUncounted(), overdueUncounted("pet-a")] }],
    // G3: the review's cross-scope contradiction. Pet A's overdue row is
    // visible only in the all-pets scope; pet A's own scope counts none, and
    // pet B carries the overdue count so every total still adds up.
    ["an all-pets row its own pet's counts contradict", { scopes: crossScopeContradiction() }],
    ["a status that disagrees with its due date", { scopes: [scope(null, [backendItem(1, { derivedStatus: "upcoming" })]), scope("pet-a", [backendItem(1, { derivedStatus: "upcoming" })])] }],
    ["an item past the horizon marked due soon", { scopes: [scope(null, [backendItem(1, { dueDate: "2026-11-20" })]), scope("pet-a", [backendItem(1, { dueDate: "2026-11-20" })])] }],
    ["an all-pets item from no listed pet", { scopes: [scope(null, [backendItem(1, { petId: "pet-z" })]), scope("pet-a", [], { pendingCount: 1, dueWithinHorizonCount: 1 })] }],
    ["a repeated item in one scope", { scopes: [scope(null, [backendItem(1), backendItem(1)]), scope("pet-a", [backendItem(1), backendItem(1)])] }],
    ["an item that differs between scopes", { scopes: [scope(null, [backendItem(1)]), scope("pet-a", [backendItem(1, { title: "Changed" })])] }],
    ["a complete scope whose counts miss its rows", { scopes: [scope(null, [backendItem(1)], { dueWithinHorizonCount: 0 }), scope("pet-a", [backendItem(1)], { dueWithinHorizonCount: 0 })] }],
    ["more coverage than its pets have", { scopes: [scope(null, [], { pendingCount: 0, dueWithinHorizonCount: 0 }), scope("pet-a", [], { pendingCount: 0, dueWithinHorizonCount: 0, hasCareRecords: false })] }],
  ])("refuses a summary with %s", async (_label, overrides) => {
    mocks.apiRequest.mockResolvedValue(backendSummary(overrides));

    await expect(getUpcomingCareSummary()).rejects.toBeInstanceOf(CareDataContractError);
  });

  it("accepts an incomplete summary that shows fewer items than it counts", async () => {
    mocks.apiRequest.mockResolvedValue(
      backendSummary({
        complete: false,
        scopes: [scope(null, [backendItem(1)], { pendingCount: 1200, dueWithinHorizonCount: 1200 }), scope("pet-a", [backendItem(1)], { pendingCount: 1200, dueWithinHorizonCount: 1200 })],
      })
    );

    const summary = await getUpcomingCareSummary();

    expect(summary.complete).toBe(false);
    expect(summary.scopes[0].pendingCount).toBe(1200);
  });

  it("accepts the same rows when each pet's counts carry its own overdue item", async () => {
    // The control for the cross-scope case: pet A counts its overdue row.
    const scopes = crossScopeContradiction();
    scopes[1] = { ...scopes[1], dueWithinHorizonCount: 1, overdueCount: 1 };
    scopes[2] = { ...scopes[2], dueWithinHorizonCount: 0, overdueCount: 0 };
    mocks.apiRequest.mockResolvedValue(backendSummary({ scopes }));

    const summary = await getUpcomingCareSummary();

    expect(summary.scopes[1].overdueCount).toBe(1);
  });

  it("refuses the cross-scope contradiction in a truncated summary too", async () => {
    mocks.apiRequest.mockResolvedValue(backendSummary({ complete: false, scopes: crossScopeContradiction() }));

    await expect(getUpcomingCareSummary()).rejects.toBeInstanceOf(CareDataContractError);
  });

  it("still refuses an incomplete summary whose visible rows break its counts", async () => {
    const overdueRow = backendItem(1, { dueDate: "2026-10-12", derivedStatus: "overdue" });
    const counts = { pendingCount: 1200, dueWithinHorizonCount: 1200, overdueCount: 0 };
    mocks.apiRequest.mockResolvedValue(
      backendSummary({
        complete: false,
        scopes: [scope(null, [overdueRow], counts), scope("pet-a", [overdueRow], counts)],
      })
    );

    await expect(getUpcomingCareSummary()).rejects.toBeInstanceOf(CareDataContractError);
  });

  it("accepts a complete summary with overdue, due-soon and later rows counted exactly", async () => {
    const rows = [
      backendItem(1, { dueDate: "2026-10-12", derivedStatus: "overdue" }),
      backendItem(2, { dueDate: "2026-10-20", derivedStatus: "due-soon" }),
      backendItem(3, { dueDate: "2026-11-20", derivedStatus: "upcoming" }),
    ];
    const counts = { pendingCount: 3, dueWithinHorizonCount: 2, overdueCount: 1 };
    mocks.apiRequest.mockResolvedValue(
      backendSummary({ scopes: [scope(null, rows, counts), scope("pet-a", rows, counts)] })
    );

    const summary = await getUpcomingCareSummary();

    expect(summary.scopes[0].items.map((item) => item.status)).toEqual(["overdue", "due-soon", "upcoming"]);
  });
});

describe("the completion status", () => {
  beforeEach(() => mocks.canUseApi.mockReturnValue(true));

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: "target",
    petId: "pet-a",
    type: "Vaccine",
    title: "Rabies booster",
    date: "2026-01-01",
    dueDate: "2026-10-12",
    publicVisibility: "Private",
    derivedStatus: "overdue",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    documents: [],
    ...overrides,
  });

  it("maps the completing record when there is one", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        state: "completed",
        asOfDate: "2026-10-20",
        petName: "Oyen",
        target: record(),
        completion: record({ id: "done", date: "2026-10-19", dueDate: null, fulfillsCareRecordId: "target" }),
      },
      meta: { requestId: "r" },
    });

    const status = await getCareCompletionStatus("target");

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/care-records/target/completion");
    expect(status.state).toBe("completed");
    expect(status.completion).toMatchObject({ id: "done", date: "19 Oct 2026", fulfillsCareRecordId: "target" });
  });

  it.each([
    ["completed without a completing record", { state: "completed", completion: null }],
    ["pending with a completing record", { state: "pending", completion: record({ id: "done", fulfillsCareRecordId: "target" }) }],
    ["a completing record for another item", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "other" }) }],
    ["an unknown state", { state: "done", completion: null }],
    ["no pet name", { state: "pending", completion: null, petName: undefined }],
    ["for a different item than was asked", { state: "pending", completion: null, target: record({ id: "someone-else" }) }],
    ["completed by an archived record", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "target", archivedAt: "2026-10-19T00:00:00Z" }) }],
    ["completed by a record with an impossible date", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "target", date: "2026-02-31" }) }],
    ["completed by another pet's record", { state: "completed", completion: record({ id: "done", petId: "pet-b", fulfillsCareRecordId: "target" }) }],
    ["completed by the item itself", { state: "completed", completion: record({ fulfillsCareRecordId: "target" }) }],
    ["completed while its target is archived", { state: "completed", target: record({ archivedAt: "2026-10-19T00:00:00Z" }), completion: record({ id: "done", fulfillsCareRecordId: "target" }) }],
    ["archived without an archived target", { state: "archived", completion: null }],
    ["pending without a due date", { state: "pending", completion: null, target: record({ dueDate: null }) }],
    ["undated while it has a due date", { state: "no-due-date", completion: null }],
    ["completed by a record with a repeated document", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "target", documents: [{ id: "m1" }, { id: "m1" }] }) }],
    ["completed by a record with an unidentified document", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "target", documents: [{ fileName: "cert.pdf" }] }) }],
    ["a target without a creation time", { state: "pending", completion: null, target: record({ createdAt: "yesterday" }) }],
    // G3: an omitted collection is not proof the record has no attachments.
    ["completed by a record whose documents are missing", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "target", documents: undefined }) }],
    ["completed by a record whose documents are null", { state: "completed", completion: record({ id: "done", fulfillsCareRecordId: "target", documents: null }) }],
    ["a target whose documents are missing", { state: "pending", completion: null, target: record({ documents: undefined }) }],
    // G4: an undated target is reported as undated, never as completed.
    ["completed while its target has no due date", { state: "completed", target: record({ dueDate: null }), completion: record({ id: "done", fulfillsCareRecordId: "target" }) }],
  ])("refuses a status that is %s", async (_label, overrides) => {
    mocks.apiRequest.mockResolvedValue({
      data: { ...{ state: "pending", completion: null }, asOfDate: "2026-10-20", petName: "Oyen", target: record(), ...overrides },
      meta: { requestId: "r" },
    });

    await expect(getCareCompletionStatus("target")).rejects.toBeInstanceOf(CareDataContractError);
  });
});

describe("a changed target is reported before its completion", () => {
  beforeEach(() => mocks.canUseApi.mockReturnValue(true));

  const record = (overrides: Record<string, unknown> = {}) => ({
    id: "target",
    petId: "pet-a",
    type: "Vaccine",
    title: "Rabies booster",
    date: "2026-01-01",
    dueDate: "2026-10-12",
    publicVisibility: "Private",
    createdAt: "2026-01-01T00:00:00Z",
    documents: [],
    ...overrides,
  });

  it.each([
    ["archived", { target: record({ archivedAt: "2026-10-19T00:00:00Z" }) }],
    ["pet-archived", {}],
    ["no-due-date", { target: record({ dueDate: null }) }],
  ])("accepts %s with a completing record that landed late", async (state, overrides) => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        state,
        asOfDate: "2026-10-20",
        petName: "Oyen",
        target: record(),
        completion: record({ id: "done", dueDate: null, fulfillsCareRecordId: "target" }),
        ...overrides,
      },
      meta: { requestId: "r" },
    });

    const status = await getCareCompletionStatus("target");

    expect(status.state).toBe(state);
    expect(status.completion?.id).toBe("done");
  });
});

describe("local data follows the same rules", () => {
  const active = { ...mockPets[0], id: "local-active", name: "Oyen", lifecycleStatus: "Active" } as PetListItem;
  const other = { ...mockPets[1], id: "local-other", name: "Mochi", lifecycleStatus: "Active" } as PetListItem;
  const memorial = { ...mockPets[1], id: "local-memorial", name: "Bobo", lifecycleStatus: "Memorial" } as PetListItem;
  const archivedPet = { ...mockPets[1], id: "local-archived", name: "Kopi", lifecycleStatus: "Archived" } as PetListItem;

  function record(id: string, petId: string, dueDate: string | undefined, extra: Partial<CareRecord> = {}): CareRecord {
    return {
      id,
      petId,
      type: "Vaccine",
      title: id,
      date: "01 Jan 2026",
      dueDate,
      provider: "",
      notes: "",
      publicVisibility: "Private",
      status: "complete",
      createdAt: `2026-01-01T00:00:${String(id.length).padStart(2, "0")}Z`,
      ...extra,
    };
  }

  beforeEach(() => {
    mocks.canUseApi.mockReturnValue(false);
    mocks.getPets.mockResolvedValue({ data: [active, other, memorial, archivedPet] });
    window.localStorage.setItem(
      "mypetlink_records",
      JSON.stringify([
        record("later", active.id, "14 Jan 2099"),
        record("sooner", active.id, "21 Oct 2098"),
        record("history-only", active.id, undefined),
        record("done-target", active.id, "01 Oct 2026"),
        record("done-fulfiller", active.id, undefined, { fulfillsCareRecordId: "done-target" }),
        record("revived-target", other.id, "02 Nov 2098"),
        record("revived-fulfiller", other.id, undefined, {
          fulfillsCareRecordId: "revived-target",
          archivedAt: "2026-10-01T00:00:00Z",
        }),
        record("archived-due", active.id, "05 Nov 2098", { archivedAt: "2026-10-01T00:00:00Z" }),
        record("memorial-due", memorial.id, "03 Nov 2098"),
        record("archived-pet-due", archivedPet.id, "03 Nov 2098"),
      ])
    );
  });

  it("summarises pending care per scope with exact counts", async () => {
    const summary = await getUpcomingCareSummary();

    expect(summary.complete).toBe(true);
    expect(summary.scopes.map((item) => item.petId)).toEqual([null, active.id, other.id]);
    const all = summary.scopes[0];
    expect(all.pendingCount).toBe(3);
    expect(all.items.map((item) => item.id)).toEqual(["sooner", "revived-target", "later"]);
    expect(summary.scopes[1]).toMatchObject({ pendingCount: 2, hasCareRecords: true });
    expect(summary.scopes[2]).toMatchObject({ pendingCount: 1, hasCareRecords: true });
    expect(summary.horizonDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pages after filtering and narrows to one owned pet", async () => {
    const page = await getUpcomingCarePage({ page: 2, pageSize: 2 });
    expect(page.meta.total).toBe(3);
    expect(page.data.items.map((item) => item.id)).toEqual(["later"]);

    const onePet = await getUpcomingCarePage({ petId: other.id });
    expect(onePet.data.items.map((item) => item.id)).toEqual(["revived-target"]);

    await expect(getUpcomingCarePage({ petId: "not-mine" })).rejects.toThrow();
  });

  it("reads completion from the records themselves", async () => {
    expect((await getCareCompletionStatus("done-target")).state).toBe("completed");
    expect((await getCareCompletionStatus("done-target")).completion?.id).toBe("done-fulfiller");
    expect((await getCareCompletionStatus("revived-target")).state).toBe("pending");
    expect((await getCareCompletionStatus("archived-due")).state).toBe("archived");
    expect((await getCareCompletionStatus("history-only")).state).toBe("no-due-date");
    expect((await getCareCompletionStatus("archived-pet-due")).state).toBe("pet-archived");
    expect((await getCareCompletionStatus("later")).petName).toBe("Oyen");
  });

  it("reports an archived item as archived even when it was completed", async () => {
    const records = JSON.parse(window.localStorage.getItem("mypetlink_records") ?? "[]") as CareRecord[];
    window.localStorage.setItem(
      "mypetlink_records",
      JSON.stringify(
        records.map((item) =>
          item.id === "done-target" ? { ...item, archivedAt: "2026-10-19T00:00:00Z" } : item
        )
      )
    );

    const status = await getCareCompletionStatus("done-target");

    expect(status.state).toBe("archived");
    expect(status.completion?.id).toBe("done-fulfiller");
  });

  it("never counts another pet's record as the completion", async () => {
    window.localStorage.setItem(
      "mypetlink_records",
      JSON.stringify([
        record("target", active.id, "01 Nov 2098"),
        record("cross-pet", other.id, undefined, { fulfillsCareRecordId: "target" }),
      ])
    );

    const status = await getCareCompletionStatus("target");

    expect(status.state).toBe("pending");
    expect(status.completion).toBeNull();
  });
});
