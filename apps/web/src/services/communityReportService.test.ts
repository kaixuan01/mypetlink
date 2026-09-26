import { afterEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>("@/services/apiClient");
  return { ...actual, apiRequest: (...args: unknown[]) => request(...args) };
});

import { ApiClientError } from "@/services/apiClient";
import { CommunityReportError, reportReasons, submitCommunityReport } from "@/services/communityReportService";

afterEach(() => request.mockReset());

describe("Community reports", () => {
  it("sends only the E2 contract and accepts identical repeat responses", async () => {
    request.mockResolvedValue({ data: { accepted: true } });
    const body = { targetType: "household" as const, target: "tanfamily", reason: "SpamOrScam" as const, details: "🐾" };
    await submitCommunityReport(body);
    await submitCommunityReport(body);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("/api/v1/social/reports", { method: "POST", body });
    expect(Object.keys(request.mock.calls[0][1].body)).toEqual(["targetType", "target", "reason", "details"]);
  });

  it("keeps reason labels tied to the exact seven E2 values", () => {
    expect(reportReasons.map(({ value }) => value)).toEqual([
      "SpamOrScam", "HarassmentOrBullying", "InappropriateContent", "AnimalWelfareConcern",
      "Impersonation", "PrivacyConcern", "Other",
    ]);
  });

  it.each([
    [404, "report_target_unavailable", "unavailable"],
    [422, "report_own_content", "own"],
    [403, "community_profile_required", "profile"],
    [403, "community_restricted", "restricted"],
    [429, "rate_limited", "rate-limit"],
    [401, "unauthorized", "session"],
    [500, "server_error", "error"],
  ] as const)("maps %i %s to %s", async (status, code, reason) => {
    request.mockRejectedValue(new ApiClientError(status, code, "server detail"));
    try {
      await submitCommunityReport({ targetType: "moment", target: "moment-id", reason: "Other", details: "detail" });
      throw new Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CommunityReportError);
      expect((error as CommunityReportError).reason).toBe(reason);
      expect((error as Error).message).not.toBe("server detail");
    }
  });
});
