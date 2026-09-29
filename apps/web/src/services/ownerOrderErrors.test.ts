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

describe("a payment proof that arrives after the order expired", () => {
  // This is the moment a DuitNow customer may already have transferred the
  // money. The message used to say only "Please start a new order", which is
  // an invitation to pay twice.
  const message = getOwnerOrderErrorMessage(
    new ApiClientError(409, "payment_window_expired", "server wording")
  );

  it("says the order can no longer accept a proof", () => {
    expect(message).toContain("can no longer accept one");
  });

  it("tells somebody who already paid not to pay again, and who to contact", () => {
    expect(message).toContain("If you have already paid, please do not pay again.");
    expect(message).toContain("Contact MyPetLink Support");
    expect(message).toContain("order number and payment screenshot");
  });

  it("never sends them straight to a new order", () => {
    expect(message).not.toMatch(/start a new order/i);
  });
});
