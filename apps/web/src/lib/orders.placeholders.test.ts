import { describe, expect, it } from "vitest";

import { getMissingProofLabel, getPaymentDateLabel } from "./orders";
import type { OrderStatus } from "@/types";

describe("optional and pending payment placeholders", () => {
  it("calls a missing proof outstanding only while it is genuinely owed", () => {
    expect(getMissingProofLabel({ status: "Pending Payment" })).toBe(
      "Not submitted yet"
    );
    expect(getMissingProofLabel({ status: "Draft" })).toBe("Not submitted yet");
  });

  it("never tells a paid order that its proof is still outstanding", () => {
    const settled: OrderStatus[] = [
      "Payment Submitted",
      "Payment Confirmed",
      "Preparing",
      "Ready to Ship",
      "Shipped",
      "Delivered",
    ];

    for (const status of settled) {
      expect(getMissingProofLabel({ status })).toBe("Not available");
    }
  });

  it("marks a proof that will never arrive as not applicable", () => {
    expect(getMissingProofLabel({ status: "Cancelled" })).toBe("Not applicable");
  });

  it("keeps the payment date pending only while confirmation is still possible", () => {
    expect(
      getPaymentDateLabel({ status: "Payment Submitted", paymentConfirmedDate: undefined })
    ).toBe("Not confirmed yet");
    expect(
      getPaymentDateLabel({ status: "Cancelled", paymentConfirmedDate: undefined })
    ).toBe("Not applicable");
    expect(
      getPaymentDateLabel({ status: "Delivered", paymentConfirmedDate: "08 Jul 2026" })
    ).toBe("08 Jul 2026");
  });
});
