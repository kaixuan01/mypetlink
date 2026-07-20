// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSmartTag } from "./adminSmartTagService";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/services/adminService", () => ({ canUseAdminApi: () => true }));
vi.mock("@/services/apiClient", () => ({
  apiRequest: mocks.apiRequest,
  apiRequestBlob: vi.fn(),
}));

import { updateAdminSmartTagAssignment } from "./adminSmartTagService";

const tag: AdminSmartTag = {
  id: "tag-1", tagCode: "MPL-TEST-0001", hasNfc: false, variant: "Standard", status: "Active",
  isArchived: false, ownerId: "owner-1", ownerName: "Aina", petId: "pet-1", petName: "Topu",
  qrSafetyEnabled: true, scanCount: 0, activatedAt: "2026-07-01T00:00:00Z",
  createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-07-18T02:03:04Z",
};

const backend = {
  id: tag.id, tagCode: tag.tagCode, hasNfc: false, variant: "Standard", status: "Active", isArchived: false,
  ownerUserId: "owner-1", ownerName: "Aina", petId: "pet-2", petName: "Luna", qrSafetyEnabled: true,
  scanCount: 0, createdAt: tag.createdAt, updatedAt: "2026-07-19T00:00:00Z",
};

beforeEach(() => { mocks.apiRequest.mockReset(); mocks.apiRequest.mockResolvedValue({ data: backend }); });

describe("Smart Tag assignment API mapping", () => {
  it("sends same-owner pet changes through the explicit pet command with a version guard", async () => {
    const updated = await updateAdminSmartTagAssignment(tag, "change-pet", { petId: "pet-2", reason: "Correction" });

    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/admin/tags/tag-1/assignment/pet", {
      method: "POST",
      body: { petId: "pet-2", expectedUpdatedAt: tag.updatedAt, reason: "Correction" },
    });
    expect(updated.petId).toBe("pet-2");
  });

  it("uses a separate transfer command and preserves a server conflict", async () => {
    await updateAdminSmartTagAssignment(tag, "transfer", { ownerId: "owner-2", petId: "pet-3", reason: "Verified" });
    expect(mocks.apiRequest).toHaveBeenCalledWith("/api/v1/admin/tags/tag-1/assignment/transfer", {
      method: "POST",
      body: { newOwnerUserId: "owner-2", newPetId: "pet-3", expectedUpdatedAt: tag.updatedAt, reason: "Verified" },
    });

    mocks.apiRequest.mockRejectedValueOnce(new Error("This tag changed after the details were opened."));
    await expect(updateAdminSmartTagAssignment(tag, "unassign-pet", { reason: "Support request" }))
      .rejects.toThrow("This tag changed");
  });
});
