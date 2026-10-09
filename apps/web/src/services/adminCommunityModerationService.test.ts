import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { actOnCommunityReport } from "./adminCommunityReportService";
import {
  directModerationErrorMessage,
  issueCommunityWarning,
  listCommunityComments,
  liftCommunityRestriction,
  moderationHistoryLabel,
  removeCommunityComment,
  removeCommunityMoment,
  restrictCommunity,
  suspendOwnerAccount,
} from "./adminCommunityModerationService";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/services/apiClient", async (original) => ({
  ...await original<typeof import("@/services/apiClient")>(),
  apiRequest: mock.request,
}));

beforeEach(() => {
  mock.request.mockReset();
  mock.request.mockResolvedValue({ data: { actionId: "a", action: "Done", restrictedUntil: null } });
});

describe("Admin direct moderation requests", () => {
  it("sends the reason, and a remark only when one was written", async () => {
    await removeCommunityMoment("m1", "SpamOrAdvertising", "   ");
    expect(mock.request).toHaveBeenLastCalledWith("/api/v1/admin/community/moments/m1/remove", {
      method: "POST", body: { reason: "SpamOrAdvertising" }, cache: "no-store",
    });

    await removeCommunityComment("c1", "Harassment", "  Targets one family ");
    expect(mock.request).toHaveBeenLastCalledWith("/api/v1/admin/community/comments/c1/remove", {
      method: "POST", body: { reason: "Harassment", remark: "Targets one family" }, cache: "no-store",
    });
  });

  it("keeps Community actions and account suspension on separate routes", async () => {
    await issueCommunityWarning("o1", "Harassment", "");
    await restrictCommunity("o1", "RepeatedViolations", "30d", "");
    await liftCommunityRestriction("o1", "");
    await suspendOwnerAccount("o1", "ScamOrFraud", "");

    expect(mock.request.mock.calls.map(([path, options]) => [path, options.body])).toEqual([
      ["/api/v1/admin/community/households/o1/warnings", { reason: "Harassment" }],
      ["/api/v1/admin/community/households/o1/restrict", { reason: "RepeatedViolations", duration: "30d" }],
      ["/api/v1/admin/community/households/o1/lift-restriction", {}],
      ["/api/v1/admin/owners/o1/suspend", { reason: "ScamOrFraud" }],
    ]);
  });

  it("sends only supported list filters", async () => {
    mock.request.mockResolvedValue({ data: [], meta: { total: 0 } });
    await listCommunityComments({ page: 2, pageSize: 20, status: "Removed", kind: "Reply", momentId: undefined });
    const url = new URL(mock.request.mock.calls[0][0], "https://example.test");
    expect(url.pathname).toBe("/api/v1/admin/community/comments");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "2", pageSize: "20", status: "Removed", kind: "Reply" });
  });

  it("sends a reason with a report decision only when the household is told", async () => {
    mock.request.mockResolvedValue({ data: { outcome: "Applied", reportsResolved: 1 } });
    await actOnCommunityReport("r1", "RemoveComment", "Reviewed", "AQID", "Harassment");
    await actOnCommunityReport("r1", "Dismiss", "Reviewed", "AQID", "Harassment");
    expect(mock.request.mock.calls.map(([, options]) => options.body)).toEqual([
      { note: "Reviewed", rowVersion: "AQID", reason: "Harassment" },
      { note: "Reviewed", rowVersion: "AQID" },
    ]);
  });

  it("words failures and history for moderators without internal detail", () => {
    expect(directModerationErrorMessage(new ApiClientError(403, "account_is_admin", "private"))).toMatch(/managed from Access/);
    expect(directModerationErrorMessage(new ApiClientError(409, "content_already_removed", "private"))).toMatch(/already been removed/);
    expect(directModerationErrorMessage(new ApiClientError(403, "moderation_conflict_of_interest", "private"))).toMatch(/your own household/);
    expect(moderationHistoryLabel({ action: "CommunityRestricted", restrictedUntil: null })).toBe("Community permanently suspended");
    expect(moderationHistoryLabel({ action: "CommunityRestricted", restrictedUntil: "2026-10-15T00:00:00Z" })).toBe("Community restricted");
    expect(moderationHistoryLabel({ action: "CommunityRestrictionExpired", restrictedUntil: null })).toBe("Community restriction ended");
  });
});
