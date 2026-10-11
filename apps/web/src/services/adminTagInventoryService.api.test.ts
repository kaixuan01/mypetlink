import { beforeEach, describe, expect, it, vi } from "vitest";
import { bulkUpdateTagInventory } from "./adminTagInventoryService";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/services/adminService", () => ({ canUseAdminApi: () => true }));
vi.mock("@/services/apiClient", () => ({ apiRequest: mocks.request }));

beforeEach(() => {
  mocks.request.mockReset().mockResolvedValue({ data: {
    requestedCount: 300, updatedCount: 300, skippedCount: 0, failures: [],
  } });
});

describe("bulk Tag Inventory request", () => {
  it("sends the same normalized filters as the listing without page or sort", async () => {
    await bulkUpdateTagInventory("mark-printed", {
      mode: "matching", expectedCount: 300,
      filters: {
        page: 3, pageSize: 20, sortBy: "tagCode", sortDir: "asc",
        batch: "BATCH-300", variant: "Lightweight", status: "Unclaimed",
        fulfilment: "Generated", stockPurpose: "Sale", claimed: "false",
        generatedFrom: "2026-10-01", generatedTo: "2026-10-11",
        updatedFrom: "2026-10-01", updatedTo: "2026-10-11",
      },
    });

    expect(mocks.request).toHaveBeenCalledWith("/api/v1/admin/tag-inventory/bulk-status", {
      method: "POST",
      body: {
        action: "mark-printed", selectionMode: "matching", expectedCount: 300,
        filters: {
          batch: "BATCH-300", variant: "Lightweight", status: "Unclaimed",
          fulfilment: "Generated", stockPurpose: "Sale", claimed: false,
          generatedFrom: "2026-10-01T00:00:00Z", generatedTo: "2026-10-11T23:59:59Z",
          updatedFrom: "2026-10-01T00:00:00Z", updatedTo: "2026-10-11T23:59:59Z",
        },
      },
    });
  });

  it("keeps explicit IDs distinct from a matching-filter selection", async () => {
    await bulkUpdateTagInventory("mark-received", ["tag-1", "tag-2", "tag-1"]);
    expect(mocks.request).toHaveBeenCalledWith("/api/v1/admin/tag-inventory/bulk-status", {
      method: "POST",
      body: { action: "mark-received", selectionMode: "ids", tagIds: ["tag-1", "tag-2"] },
    });
  });
});
