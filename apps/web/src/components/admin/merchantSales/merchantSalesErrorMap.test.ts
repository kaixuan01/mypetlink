import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  getMerchantSalesError,
  getMerchantSalesFieldErrors,
  isConcurrencyConflict,
} from "@/services/adminMerchantSalesService";

const fallback = "We couldn’t do that.";
const message = (error: unknown) => getMerchantSalesError(error, fallback);

describe("Merchant Sales error mapping", () => {
  it("never repeats a raw framework message to an operator", () => {
    const text = message(
      new ApiClientError(400, "validation_failed", "The LegalBusinessName field is required.")
    );

    expect(text).toBe("Please check the highlighted fields and try again.");
    expect(text).not.toContain("LegalBusinessName");
  });

  it("explains an inactive merchant and an inactive salesperson differently", () => {
    expect(message(new ApiClientError(400, "merchant_inactive", "x"))).toMatch(
      /merchant is inactive/i
    );
    expect(message(new ApiClientError(400, "salesperson_inactive", "x"))).toMatch(
      /salesperson is inactive/i
    );
  });

  it("tells the operator to reload only for a genuine stale record", () => {
    expect(message(new ApiClientError(409, "concurrency_conflict", "x"))).toMatch(
      /updated by another administrator/i
    );
    expect(
      message(
        new ApiClientError(
          409,
          "merchant_registration_duplicate",
          "Another merchant already uses this business registration number."
        )
      )
    ).not.toMatch(/reload/i);
  });

  it("explains an invalid lifecycle change without naming a status machine", () => {
    const text = message(
      new ApiClientError(409, "invalid_quotation_transition", "A draft cannot become accepted.")
    );

    expect(text).toMatch(/not available for this quotation any more/i);
    expect(text).not.toMatch(/transition|state machine/i);
  });

  it("says a document is not available yet rather than refusing silently", () => {
    expect(message(new ApiClientError(409, "quotation_not_issued", "x"))).toMatch(
      /Send the quotation before producing its document/i
    );
  });

  it("keeps the server's own list of what the business identity is missing", () => {
    const text = message(
      new ApiClientError(
        409,
        "business_identity_incomplete",
        "Complete the business identity before issuing this document: Registered address."
      )
    );

    expect(text).toContain("Registered address");
  });

  it("maps authorization and session failures to something actionable", () => {
    expect(message(new ApiClientError(401, "unauthorized", "x"))).toMatch(/sign in again/i);
    expect(message(new ApiClientError(403, "forbidden", "x"))).toMatch(/do not have permission/i);
    expect(message(new ApiClientError(404, "not_found", "x"))).toMatch(/no longer exists/i);
  });

  it("explains a lost connection without technical wording", () => {
    const text = message(new ApiClientError(0, "network_error", "x"));

    expect(text).toMatch(/couldn’t connect/i);
    expect(text).not.toMatch(/fetch|socket|ECONN/i);
  });

  it("falls back to the caller's wording for anything unrecognised", () => {
    expect(message(new ApiClientError(500, "teapot", "x"))).toBe(fallback);
    expect(message(new Error("plain"))).toBe(fallback);
  });

  it("recognises every shape a concurrency conflict arrives in", () => {
    expect(isConcurrencyConflict(new ApiClientError(409, "concurrency_conflict", "x"))).toBe(true);
    expect(isConcurrencyConflict(new ApiClientError(412, "precondition_failed", "x"))).toBe(true);
    expect(isConcurrencyConflict(new ApiClientError(400, "validation_failed", "x"))).toBe(false);
  });

  it("returns no field errors when the failure carries no details", () => {
    expect(getMerchantSalesFieldErrors(new ApiClientError(500, "server_error", "x"))).toEqual({});
    expect(getMerchantSalesFieldErrors(new Error("plain"))).toEqual({});
  });

  it("keeps only the first message per field so nothing is lost behind another", () => {
    const fields = getMerchantSalesFieldErrors(
      new ApiClientError(400, "validation_failed", "x", {
        ContactEmail: ["Enter a contact email address.", "Second message."],
      })
    );

    expect(fields.contactEmail).toBe("Enter a contact email address.");
  });

  it("leaves an already camel-cased key alone", () => {
    const fields = getMerchantSalesFieldErrors(
      new ApiClientError(400, "validation_failed", "x", {
        deliveryFee: ["A delivery fee cannot be negative."],
      })
    );

    expect(fields.deliveryFee).toBe("A delivery fee cannot be negative.");
  });
});
