import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { classifyAdminAccessError } from "@/lib/adminGuardState";

function abortError() {
  return Object.assign(new Error("The request was cancelled."), {
    name: "AbortError",
  });
}

describe("classifyAdminAccessError", () => {
  it("maps 403 to denied (Access Denied, no retry)", () => {
    expect(classifyAdminAccessError(new ApiClientError(403, "forbidden", "x"))).toBe(
      "denied"
    );
  });

  it("maps 401 to sessionExpired (redirect to login)", () => {
    expect(
      classifyAdminAccessError(new ApiClientError(401, "unauthorized", "x"))
    ).toBe("sessionExpired");
  });

  it("maps database_waking_up to a retryable temporary state", () => {
    expect(
      classifyAdminAccessError(new ApiClientError(503, "database_waking_up", "x"))
    ).toBe("temporarilyUnavailable");
  });

  it("maps an unreachable service (status 0) to temporarily unavailable", () => {
    expect(
      classifyAdminAccessError(new ApiClientError(0, "service_unavailable", "x"))
    ).toBe("temporarilyUnavailable");
  });

  it("does NOT label a real 500 as a temporary wake-up", () => {
    expect(
      classifyAdminAccessError(new ApiClientError(500, "internal_error", "x"))
    ).toBe("error");
  });

  it("treats an aborted/cancelled request as cancelled, not an error", () => {
    expect(classifyAdminAccessError(abortError())).toBe("cancelled");
  });

  it("maps unknown/programming errors to error", () => {
    expect(classifyAdminAccessError(new Error("boom"))).toBe("error");
  });
});
