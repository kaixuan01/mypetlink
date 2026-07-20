// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  bulkUpdateAdminSmartTags,
  canRunSmartTagAction,
  countAdminSmartTags,
  getSmartTagAssignmentActions,
  listAdminSmartTags,
  runAdminSmartTagAction,
  smartTagLifecycleLabel,
  type AdminSmartTag,
} from "@/services/adminSmartTagService";
import { writeAdminTagCollection } from "@/services/tagService";
import type { PetTag } from "@/types";

const base = { page: 1, pageSize: 100 };

function seed(): PetTag[] {
  const rows: PetTag[] = [
    { id: "smart_active", tagCode: "MPL-SMART-ACTIVE", hasNfc: true, variant: "Lightweight", status: "Active", petId: "pet_a", ownerUserId: "owner_a", activatedAt: "2026-07-01T00:00:00Z", lastScannedAt: "2026-07-10T00:00:00Z" },
    { id: "smart_pending", tagCode: "MPL-SMART-PENDING", hasNfc: false, variant: undefined as unknown as "Standard", status: "Pending" },
    { id: "smart_preparing", tagCode: "MPL-SMART-PREPARING", hasNfc: false, variant: "Standard", status: "Preparing" },
    { id: "smart_disabled", tagCode: "MPL-SMART-DISABLED", hasNfc: false, variant: "Standard", status: "Disabled", petId: "pet_b", ownerUserId: "owner_b" },
    { id: "smart_archived", tagCode: "MPL-SMART-ARCHIVED", hasNfc: true, variant: "Standard", status: "Archived", isArchived: true },
    { id: "smart_unclaimed", tagCode: "MPL-SMART-UNCLAIMED", hasNfc: false, variant: "Standard", status: "Unassigned" },
  ];
  writeAdminTagCollection(rows);
  return rows;
}

async function seeded(params: Record<string, string> = {}) {
  const result = await listAdminSmartTags({ ...base, ...params });
  return result.items.filter((row) => row.tagCode.startsWith("MPL-SMART-"));
}

beforeEach(() => { window.localStorage.clear(); seed(); });

describe("Smart Tags local query parity", () => {
  it("filters search, type, lifecycle, claimed, scans, and date ranges before paging", async () => {
    expect((await seeded({ search: "smart-active" })).map((row) => row.id)).toEqual(["smart_active"]);
    expect((await seeded({ tagType: "QR_NFC" })).map((row) => row.id).sort()).toEqual(["smart_active", "smart_archived"]);
    expect((await seeded({ status: "awaiting-activation" })).map((row) => row.id).sort()).toEqual(["smart_pending", "smart_preparing"]);
    expect((await seeded({ status: "Unclaimed" })).map((row) => row.id)).toEqual(["smart_unclaimed"]);
    expect((await seeded()).find((row) => row.id === "smart_pending")?.variant).toBe("Standard");
    expect((await seeded({ claimed: "true" })).map((row) => row.id).sort()).toEqual(["smart_active", "smart_disabled"]);
    expect((await seeded({ hasScans: "true" })).map((row) => row.id)).toEqual(["smart_active"]);
    expect((await seeded({ activatedFrom: "2026-07-01", activatedTo: "2026-07-01" })).map((row) => row.id)).toEqual(["smart_active"]);
  });

  it("keeps Lost and Disabled separate and computes non-status-filtered counts", async () => {
    const counts = await countAdminSmartTags({ ...base, tagType: "QR", search: "MPL-SMART" });
    expect(counts.disabled).toBe(1);
    expect(counts.active).toBe(0);
  });
});

describe("Smart Tags lifecycle actions", () => {
  const active: AdminSmartTag = {
    id: "x", tagCode: "MPL-X", hasNfc: false, variant: "Standard", status: "Active",
    isArchived: false, qrSafetyEnabled: false, scanCount: 0, createdAt: "2026-07-01", updatedAt: "2026-07-01",
  };

  it("uses exact lifecycle labels and state guards", () => {
    expect(smartTagLifecycleLabel({ ...active, status: "Pending" })).toBe("Pending activation");
    expect(smartTagLifecycleLabel({ ...active, status: "Preparing" })).toBe("Preparing for owner");
    expect(canRunSmartTagAction(active, "disable")).toBe(true);
    expect(canRunSmartTagAction({ ...active, status: "Replaced" }, "archive")).toBe(false);
    expect(canRunSmartTagAction({ ...active, status: "Lost", ownerId: "owner", petId: "pet" }, "reactivate")).toBe(true);
  });

  it("offers assignment commands only for eligible lifecycle and binding states", () => {
    expect(getSmartTagAssignmentActions({ ...active, status: "Unassigned" })).toEqual(["claim"]);
    expect(getSmartTagAssignmentActions({ ...active, ownerId: "owner-1" })).toEqual(["assign-pet", "transfer"]);
    expect(getSmartTagAssignmentActions({ ...active, ownerId: "owner-1", petId: "pet-1" })).toEqual(["change-pet", "unassign-pet", "transfer"]);
    expect(getSmartTagAssignmentActions({ ...active, status: "Lost", ownerId: "owner-1", petId: "pet-1" })).toEqual([]);
    expect(getSmartTagAssignmentActions({ ...active, status: "Replaced", ownerId: "owner-1", petId: "pet-1" })).toEqual([]);
  });

  it("updates a valid action and rejects a duplicate invalid transition", async () => {
    const updated = await runAdminSmartTagAction("smart_active", "disable");
    expect(updated.status).toBe("Disabled");
    await expect(runAdminSmartTagAction("smart_active", "disable")).rejects.toThrow();
  });

  it("bulk updates valid rows and reports invalid rows", async () => {
    const result = await bulkUpdateAdminSmartTags("archive", ["smart_active", "smart_archived"]);
    expect(result.updatedCount).toBe(1);
    expect(result.failures).toHaveLength(1);
  });
});
