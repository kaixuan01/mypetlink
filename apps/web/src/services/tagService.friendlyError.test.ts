import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import { getFriendlyTagErrorMessage } from "@/services/tagService";

describe("getFriendlyTagErrorMessage", () => {
  it("gives a configuration-specific message when the backend is not configured", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(0, "connection_not_configured", "MyPetLink connection is not configured.")
    );

    expect(message).toMatch(/preview/i);
    expect(message).toMatch(/configured MyPetLink connection/i);
    // Must not imply the live service is down.
    expect(message).not.toMatch(/could not reach/i);
  });

  it("gives actionable connectivity guidance for a real connectivity failure", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now.")
    );

    expect(message).toMatch(/couldn’t connect/i);
    expect(message).toMatch(/internet connection/i);
  });

  it("replaces backend validation text with owner-facing wording", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        productVariantKey: ["ProductVariantKey is invalid."],
      })
    );

    expect(message).toBe("This tag option is no longer available. Please choose another option.");
    // The raw backend field name and message never reach the owner.
    expect(message).not.toMatch(/ProductVariantKey/i);
  });

  it("explains an expired session instead of showing Unauthorized", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(401, "unauthorized", "Authentication is required.")
    );

    expect(message).toBe("Your session has expired. Please sign in again to continue.");
  });

  it("never claims the order failed when the request was already accepted", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(409, "idempotency_key_conflict", "Idempotency key conflict.")
    );

    expect(message).toMatch(/already been submitted/i);
    expect(message).not.toMatch(/failed|not created|not charged/i);
  });

  it("does not leak raw server text on an unexpected server error", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(500, "server_error", "Object reference not set to an instance of an object.")
    );

    expect(message).toBe("We could not complete your order right now. Please try again.");
    expect(message).not.toMatch(/Object reference/i);
  });
});
