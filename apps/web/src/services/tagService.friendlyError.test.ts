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

  it("keeps the network-outage message for a real connectivity failure", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(0, "service_unavailable", "We could not reach MyPetLink right now.")
    );

    expect(message).toMatch(/could not reach MyPetLink/i);
  });

  it("surfaces the field message from a validation response", () => {
    const message = getFriendlyTagErrorMessage(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        productVariantKey: ["This tag option is no longer available."],
      })
    );

    expect(message).toBe("This tag option is no longer available.");
  });
});
