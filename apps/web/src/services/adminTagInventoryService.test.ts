// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  bulkUpdateTagInventory,
  canApplyBulkAction,
  getSupportedExportFormats,
  lifecycleLabel,
  listTagInventory,
  type AdminInventoryTag,
} from "@/services/adminTagInventoryService";
import { writeAdminTagCollection } from "@/services/tagService";
import type { PetTag } from "@/types";

// These tests exercise the local-data path (no MyPetLink service configured):
// the same filters, sorting, pagination, and bulk guardrails as the server,
// applied to the stored collection.

const baseParams = { page: 1, pageSize: 100 };

function seedTags(): PetTag[] {
  const tags: PetTag[] = [
    {
      id: "inv_a",
      tagCode: "MPL-TEST-AAAA",
      hasNfc: false,
      variant: "Standard",
      status: "Unassigned",
      fulfilmentStatus: "Generated",
      batchNo: "BATCH-TEST-1",
      orderedDate: "01 Jul 2026",
    },
    {
      id: "inv_b",
      tagCode: "MPL-TEST-BBBB",
      hasNfc: true,
      variant: "Lightweight",
      status: "Unassigned",
      fulfilmentStatus: "Printed",
      batchNo: "BATCH-TEST-1",
      orderedDate: "02 Jul 2026",
    },
    {
      id: "inv_c",
      tagCode: "MPL-TEST-CCCC",
      hasNfc: false,
      variant: "Standard",
      status: "Unassigned",
      fulfilmentStatus: "Generated",
      batchNo: "BATCH-TEST-2",
      orderedDate: "03 Jul 2026",
      isArchived: true,
    },
    {
      id: "inv_d",
      tagCode: "MPL-TEST-DDDD",
      hasNfc: false,
      variant: "Standard",
      status: "Active",
      fulfilmentStatus: "Received",
      batchNo: "BATCH-TEST-2",
      orderedDate: "04 Jul 2026",
      petId: "pet_milo",
    },
  ];

  writeAdminTagCollection(tags);
  return tags;
}

// The stored collection merges with the built-in sample data, so assertions
// filter down to the seeded batch numbers.
async function listSeeded(params: Record<string, string> = {}) {
  const result = await listTagInventory({ ...baseParams, ...params });
  return result.items.filter((item) => item.batchNo?.startsWith("BATCH-TEST"));
}

beforeEach(() => {
  window.localStorage.clear();
  seedTags();
});

describe("listTagInventory (local data)", () => {
  it("filters by batch and fulfilment", async () => {
    const batch1 = await listSeeded({ batch: "BATCH-TEST-1" });
    expect(batch1.map((item) => item.id).sort()).toEqual(["inv_a", "inv_b"]);

    const printed = await listSeeded({ fulfilment: "Printed" });
    expect(printed.map((item) => item.id)).toEqual(["inv_b"]);
  });

  it("filters lifecycle status excluding archived, and archived explicitly", async () => {
    const unclaimed = await listSeeded({ status: "Unclaimed" });
    expect(unclaimed.map((item) => item.id).sort()).toEqual(["inv_a", "inv_b"]);

    const archived = await listSeeded({ status: "archived" });
    expect(archived.map((item) => item.id)).toEqual(["inv_c"]);
  });

  it("keyword search matches tag codes and batches", async () => {
    const byCode = await listSeeded({ search: "mpl-test-bbbb" });
    expect(byCode.map((item) => item.id)).toEqual(["inv_b"]);

    const byBatch = await listSeeded({ search: "BATCH-TEST-2" });
    expect(byBatch.map((item) => item.id).sort()).toEqual(["inv_c", "inv_d"]);
  });

  it("splits claimed and unclaimed stock", async () => {
    const claimed = await listSeeded({ claimed: "true" });
    expect(claimed.map((item) => item.id)).toEqual(["inv_d"]);
  });

  it("sorts by generated date descending by default", async () => {
    const items = await listSeeded();
    const dates = items.map((item) => Date.parse(item.generatedAt ?? ""));

    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });

  it("paginates deterministically", async () => {
    const page1 = await listTagInventory({
      page: 1,
      pageSize: 2,
      batch: "BATCH-TEST-1",
      sortBy: "tagCode",
      sortDir: "asc",
    });
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(2);

    const page2 = await listTagInventory({
      page: 2,
      pageSize: 1,
      batch: "BATCH-TEST-1",
      sortBy: "tagCode",
      sortDir: "asc",
    });
    expect(page2.items.map((item) => item.id)).toEqual(["inv_b"]);
  });
});

describe("bulkUpdateTagInventory (local data)", () => {
  it("moves Generated unclaimed stock to Printed and reports failures for the rest", async () => {
    const result = await bulkUpdateTagInventory("mark-printed", [
      "inv_a", // Generated + Unclaimed: updates
      "inv_b", // already Printed: fails
      "inv_c", // archived: fails
      "inv_d", // Active lifecycle: fails
      "missing",
    ]);

    expect(result.requestedCount).toBe(5);
    expect(result.updatedCount).toBe(1);
    expect(result.failures).toHaveLength(4);

    const items = await listSeeded({ fulfilment: "Printed" });
    expect(items.map((item) => item.id).sort()).toEqual(["inv_a", "inv_b"]);
  });

  it("never changes lifecycle state through fulfilment actions", async () => {
    await bulkUpdateTagInventory("mark-printed", ["inv_a"]);

    const [tag] = await listSeeded({ tagCode: "MPL-TEST-AAAA" });
    expect(tag.status).toBe("Unassigned");
    expect(tag.isArchived).toBe(false);
  });
});

describe("bulk action guardrails", () => {
  const template: AdminInventoryTag = {
    id: "x",
    tagCode: "MPL-XXXX-XXXX",
    hasNfc: false,
    variant: "Standard",
    status: "Unassigned",
    isArchived: false,
    fulfilment: "Generated",
  };

  it("only allows each action from its starting fulfilment step", () => {
    expect(canApplyBulkAction(template, "mark-printed")).toBe(true);
    expect(canApplyBulkAction(template, "send-to-reseller")).toBe(false);
    expect(
      canApplyBulkAction({ ...template, fulfilment: "Printed" }, "send-to-reseller")
    ).toBe(true);
    expect(
      canApplyBulkAction({ ...template, fulfilment: "Printed" }, "send-to-owner")
    ).toBe(true);
    expect(
      canApplyBulkAction({ ...template, fulfilment: "SentToReseller" }, "mark-received")
    ).toBe(true);
  });

  it("blocks archived and non-unclaimed tags", () => {
    expect(canApplyBulkAction({ ...template, isArchived: true }, "mark-printed")).toBe(
      false
    );
    expect(
      canApplyBulkAction({ ...template, status: "Active" }, "mark-printed")
    ).toBe(false);
  });
});

describe("display helpers", () => {
  it("shows Unclaimed for unassigned stock and Archived for archived tags", () => {
    expect(lifecycleLabel("Unassigned", false)).toBe("Unclaimed");
    expect(lifecycleLabel("Active", false)).toBe("Active");
    expect(lifecycleLabel("Active", true)).toBe("Archived");
  });

  it("offers CSV locally (Excel needs the connected service)", () => {
    expect(getSupportedExportFormats()).toEqual(["csv"]);
  });
});
