import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { isUncertainRequestOutcome } from "@/lib/requestOutcome";

describe("isUncertainRequestOutcome", () => {
  it.each([
    ["the client's dropped-connection error (status 0)", new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now.")],
    ["a timeout", new ApiClientError(408, "http_408", "Timed out")],
    ["a server failure", new ApiClientError(500, "server_error", "Failed")],
    ["an unavailable service", new ApiClientError(503, "http_503", "Unavailable")],
    ["a database still waking", new ApiClientError(503, "database_waking_up", "Waking")],
    ["a raw network failure", new TypeError("Failed to fetch")],
    ["an aborted request", new DOMException("Aborted", "AbortError")],
    ["a response that could not be read", new Error("Care record was not returned after saving.")],
  ])("treats %s as an unknown outcome", (_label, error) => {
    expect(isUncertainRequestOutcome(error)).toBe(true);
  });

  it.each([
    ["a request that never left", new ApiClientError(0, "connection_not_configured", "Not configured")],
    ["a validation refusal", new ApiClientError(400, "validation_failed", "Invalid")],
    ["an expired session", new ApiClientError(401, "unauthorized", "Sign in")],
    ["a missing record", new ApiClientError(404, "not_found", "Missing")],
    ["a conflict", new ApiClientError(409, "conflict", "Conflict")],
    ["an invalid state", new ApiClientError(422, "invalid_record_state", "Archived")],
    ["a rate limit", new ApiClientError(429, "rate_limited", "Slow down")],
  ])("treats %s as definitely not applied", (_label, error) => {
    expect(isUncertainRequestOutcome(error)).toBe(false);
  });
});
