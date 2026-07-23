import { describe, expect, it } from "vitest";
import { ApiClientError } from "./apiClient";
import { getOwnerOrderErrorMessage } from "./ownerOrderErrors";

describe("owner tag error messages", () => {
  it("keeps a rate limit response distinct from missing or unauthorized tags", () => {
    const message = getOwnerOrderErrorMessage(
      new ApiClientError(
        429,
        "rate_limit_exceeded",
        "Too many requests. Please wait a moment and try again."
      )
    );

    expect(message).toBe(
      "Too many requests. Please wait a moment and try again."
    );
    expect(message).not.toMatch(/not found|permission|unavailable/i);
  });
});
