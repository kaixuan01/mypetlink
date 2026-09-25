import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { actOnCommunityReport, getCommunityReport, listCommunityReports, moderationErrorMessage } from "./adminCommunityReportService";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/services/apiClient", async (original) => ({
  ...await original<typeof import("@/services/apiClient")>(),
  apiRequest: mock.request,
}));

beforeEach(() => mock.request.mockReset());

describe("Admin Community report requests", () => {
  it("sends only supported server filters and paging", async () => {
    mock.request.mockResolvedValue({ data: [{ id: "one" }], meta: { total: 42 } });
    const result = await listCommunityReports({ page: 2, pageSize: 50, status: "Open", targetType: "Moment", reason: "Other", reportedOwnerId: "owner-id", createdFrom: "2026-09-01T00:00:00Z", createdTo: "2026-09-25T23:59:59Z" });
    const [path, options] = mock.request.mock.calls[0];
    const url = new URL(path, "https://example.test");
    expect(url.pathname).toBe("/api/v1/admin/community-reports");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "2", pageSize: "50", status: "Open", targetType: "Moment", reason: "Other", reportedOwnerId: "owner-id", createdFrom: "2026-09-01T00:00:00Z", createdTo: "2026-09-25T23:59:59Z" });
    expect(options.cache).toBe("no-store");
    expect(result.total).toBe(42);
  });

  it("loads detail and sends only note and current rowVersion for a decision", async () => {
    mock.request.mockResolvedValueOnce({ data: { id: "one", rowVersion: "AQID" } });
    expect((await getCommunityReport("one")).rowVersion).toBe("AQID");
    mock.request.mockResolvedValueOnce({ data: { outcome: "Applied", reportsResolved: 2 } });
    await actOnCommunityReport("one", "HideMoment", "  Reviewed  ", "AQID");
    expect(mock.request).toHaveBeenLastCalledWith("/api/v1/admin/community-reports/one/hide-moment", {
      method: "POST", body: { note: "Reviewed", rowVersion: "AQID" }, cache: "no-store",
    });
  });

  it("maps stale, permission and action errors to safe messages", () => {
    expect(moderationErrorMessage(new ApiClientError(409, "community_report_already_resolved", "private detail"))).toMatch(/changed while you were reviewing/);
    expect(moderationErrorMessage(new ApiClientError(422, "moderation_action_not_applicable", "private detail"))).toMatch(/no longer available/);
    expect(moderationErrorMessage(new ApiClientError(403, "moderation_conflict_of_interest", "private detail"))).toMatch(/involves your household/);
  });
});
