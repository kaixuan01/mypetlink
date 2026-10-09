import { beforeEach, describe, expect, it, vi } from "vitest";
import { physicalQaService, type QaFilters, type QaItem } from "./physicalQaService";

const mock = vi.hoisted(() => ({ request: vi.fn(), blob: vi.fn() }));
vi.mock("@/services/apiClient", async (original) => ({
  ...await original<typeof import("@/services/apiClient")>(),
  apiRequest: mock.request,
  apiRequestBlob: mock.blob,
}));
vi.mock("@/lib/adminListShared", async (original) => ({
  ...await original<typeof import("@/lib/adminListShared")>(),
  triggerDownload: vi.fn(),
}));

const filters: QaFilters = { batch: "", sku: "", tagCode: "", qaStatus: "", shipment: "SHIP-900" };
const item = { id: "tag-1", tagCode: "MPL-ABCD-2345", version: 3 } as QaItem;
const root = "/api/v1/admin/tag-inventory/qa";

beforeEach(() => {
  mock.request.mockReset();
  mock.request.mockResolvedValue({ data: {}, meta: { total: 0 } });
  mock.blob.mockReset();
  mock.blob.mockResolvedValue({ blob: new Blob(), fileName: "qa.csv" });
});

// The API client sends paths as given, so every physical QA call must name the
// versioned API route; a missing prefix is a 404 in production.
describe("physical QA requests use the versioned API routes", () => {
  it("lists, summarizes, looks up and reads history", async () => {
    await physicalQaService.list(filters, 2);
    await physicalQaService.summary(filters);
    await physicalQaService.lookup("MPL-ABCD-2345");
    await physicalQaService.history("tag-1");
    const paths = mock.request.mock.calls.map(call => call[0] as string);
    expect(paths[0]).toMatch(new RegExp(`^${root}\\?.*page=2`));
    expect(paths[1]).toMatch(new RegExp(`^${root}/summary\\?`));
    expect(paths[2]).toBe(`${root}/lookup?code=MPL-ABCD-2345`);
    expect(paths[3]).toBe(`${root}/tag-1/history`);
  });

  it("captures, saves, previews and enrolls", async () => {
    await physicalQaService.capture(item, "WebNfc", "https://mypetlink.com.my/n/MPL-ABCD-2345", "04:AA");
    await physicalQaService.save(item, { inspectionId: "i1", decision: "Passed", physicalCondition: "Good", remarks: "" });
    const cohort = { shipmentReference: "SHIP-900", tagCodes: ["MPL-ABCD-2345"], expectedCount: 1, acknowledgeCommitments: false };
    await physicalQaService.preview(cohort);
    await physicalQaService.enroll(cohort);
    expect(mock.request.mock.calls.map(call => [call[0], call[1]?.method])).toEqual([
      [`${root}/capture`, "POST"],
      [`${root}/tag-1`, "PUT"],
      [`${root}/cohort/preview`, "POST"],
      [`${root}/cohort/enroll`, "POST"],
    ]);
  });

  it("exports", async () => {
    await physicalQaService.export(filters);
    expect(mock.blob.mock.calls[0][0]).toMatch(new RegExp(`^${root}/export\\?`));
  });
});
