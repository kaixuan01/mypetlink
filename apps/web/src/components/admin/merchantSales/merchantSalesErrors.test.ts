import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  getMerchantSalesError,
  getMerchantSalesFieldErrors,
} from "@/services/adminMerchantSalesService";

describe("Merchant Sales failure messages", () => {
  it("keeps nested address messages attached to the field they belong to", () => {
    // The server keys nested fields in PascalCase, one segment per level. Lowering
    // only the first character leaves "billingAddress.AddressLine1", which no field
    // looks up, so the operator sees a rejection with nothing highlighted.
    const fields = getMerchantSalesFieldErrors(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        "BillingAddress.AddressLine1": ["Enter the street address."],
        "BillingAddress.Postcode": ["Enter the postcode."],
        "DeliveryAddress.City": ["Enter the city or town."],
        LegalBusinessName: ["Enter the registered business name."],
      })
    );

    expect(fields["billingAddress.addressLine1"]).toBe("Enter the street address.");
    expect(fields["billingAddress.postcode"]).toBe("Enter the postcode.");
    expect(fields["deliveryAddress.city"]).toBe("Enter the city or town.");
    expect(fields.legalBusinessName).toBe("Enter the registered business name.");
  });

  it("keeps indexed quotation line messages intact", () => {
    const fields = getMerchantSalesFieldErrors(
      new ApiClientError(400, "validation_failed", "Please check the submitted fields.", {
        "items[0].lineDiscount": ["A line discount cannot exceed the line amount."],
        discountTotal: ["An order discount cannot exceed the merchandise subtotal."],
      })
    );

    expect(fields["items[0].lineDiscount"]).toBe(
      "A line discount cannot exceed the line amount."
    );
    expect(fields.discountTotal).toBe(
      "An order discount cannot exceed the merchandise subtotal."
    );
  });

  it("names a duplicate business registration number instead of asking for a reload", () => {
    // The server answers 409 for both a stale record and a duplicate number.
    // Treating every 409 as staleness sends the operator after the wrong problem.
    const message = getMerchantSalesError(
      new ApiClientError(
        409,
        "merchant_registration_duplicate",
        "Another merchant already uses this business registration number."
      ),
      "We couldn’t save this merchant."
    );

    expect(message).toContain("business registration number");
    expect(message).not.toContain("Reload");
  });

  it("still asks for a reload when a record really was changed by someone else", () => {
    const message = getMerchantSalesError(
      new ApiClientError(
        409,
        "concurrency_conflict",
        "Someone else changed this record. Reload and try again."
      ),
      "We couldn’t save this merchant."
    );

    expect(message).toContain("Reload");
    expect(message).not.toContain("RowVersion");
  });

  it("falls back to plain wording when a 409 arrives with no message", () => {
    const message = getMerchantSalesError(
      new ApiClientError(409, "unexpected_state", "   "),
      "We couldn’t save this merchant."
    );

    expect(message).toBe("That action is no longer available. Reload and try again.");
  });
});
