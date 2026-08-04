import { describe, expect, it } from "vitest";

import {
  formatDeliveryDestination,
  getOrderShipmentView,
  getShipmentSummaryLabel,
} from "./orders";
import type { TagOrder } from "@/types";

function order(overrides: Partial<TagOrder>): TagOrder {
  return {
    id: "order-1",
    orderNumber: "MPL-0001",
    petId: "pet-1",
    tagType: "MyPetLink QR Pet Tag",
    variant: "Standard",
    delivery: {
      recipientName: "Aina",
      phone: "+60123456789",
      addressLine1: "6934, Taman Gemencheh Baru",
      addressLine2: "",
      postcode: "68000",
      city: "Ampang",
      state: "Kuala Lumpur",
      notes: "",
    },
    estimatedPrice: "RM29.90",
    status: "Pending Payment",
    orderedDate: "2026-07-20",
    ...overrides,
  } as TagOrder;
}

describe("compact delivery destination", () => {
  it("is a normalised city and state, never a slice of the street address", () => {
    const destination = formatDeliveryDestination(order({}));

    expect(destination).toBe("Ampang, Kuala Lumpur");
    expect(destination).not.toContain("6934");
    expect(destination).not.toContain("…");
    expect(destination).not.toContain("...");
  });

  it("drops an empty half instead of leaving a dangling separator", () => {
    const noState = order({});
    noState.delivery.state = "   ";

    expect(formatDeliveryDestination(noState)).toBe("Ampang");
  });
});

describe("owner shipment visibility", () => {
  it("stays hidden before the parcel is handed to the courier", () => {
    for (const status of [
      "Pending Payment",
      "Payment Submitted",
      "Payment Confirmed",
      "Preparing",
      "Ready to Ship",
    ] as const) {
      const view = getOrderShipmentView(
        order({
          status,
          courierProvider: "J&T Express",
          trackingNumber: "JT123456789MY",
        })
      );

      expect(view.visible).toBe(false);
      expect(view.courierName).toBeUndefined();
      expect(view.trackingNumber).toBeUndefined();
      expect(view.trackingUrl).toBeUndefined();
    }
  });

  it("shows the tracking number for a shipped order that has no tracking link", () => {
    const view = getOrderShipmentView(
      order({
        status: "Shipped",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        shippedDate: "2026-07-24",
        trackingUrl: undefined,
      })
    );

    expect(view.visible).toBe(true);
    expect(view.courierName).toBe("J&T Express");
    expect(view.trackingNumber).toBe("JT123456789MY");
    expect(view.shippedDate).toBe("2026-07-24");
    // The number must never depend on a link being available.
    expect(view.trackingUrl).toBeUndefined();
  });

  it("keeps the number and the link independent when both exist", () => {
    const view = getOrderShipmentView(
      order({
        status: "Delivered",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        trackingUrl: "https://www.jtexpress.my/track?no=JT123456789MY",
        shippedDate: "2026-07-24",
        deliveredDate: "2026-07-26",
      })
    );

    expect(view.trackingNumber).toBe("JT123456789MY");
    expect(view.trackingUrl).toBe(
      "https://www.jtexpress.my/track?no=JT123456789MY"
    );
    expect(view.deliveredDate).toBe("2026-07-26");
  });

  it("still reports a shipment when a shipped date exists without a status change", () => {
    const view = getOrderShipmentView(
      order({ status: "Ready to Ship", shippedDate: "2026-07-24" })
    );

    expect(view.visible).toBe(true);
  });

  it("treats a courier with no number and a number with no courier as partial, not broken", () => {
    const courierOnly = getOrderShipmentView(
      order({ status: "Shipped", courierProvider: "J&T Express" })
    );
    expect(courierOnly.visible).toBe(true);
    expect(courierOnly.courierName).toBe("J&T Express");
    expect(courierOnly.trackingNumber).toBeUndefined();

    const numberOnly = getOrderShipmentView(
      order({ status: "Shipped", trackingNumber: "JT123456789MY" })
    );
    expect(numberOnly.visible).toBe(true);
    expect(numberOnly.courierName).toBeUndefined();
    expect(numberOnly.trackingNumber).toBe("JT123456789MY");
  });

  it("treats blank server values as absent rather than rendering empty fields", () => {
    const view = getOrderShipmentView(
      order({ status: "Shipped", courierProvider: "", trackingNumber: "" })
    );

    expect(view.courierName).toBeUndefined();
    expect(view.trackingNumber).toBeUndefined();
  });
});

describe("compact shipment summary tile", () => {
  it("names the courier once the parcel has shipped", () => {
    expect(
      getShipmentSummaryLabel(
        order({ status: "Shipped", courierProvider: "J&T Express" })
      )
    ).toEqual({ label: "Shipment", value: "J&T Express" });
  });

  it("stays neutral when a shipped order has no courier name recorded", () => {
    expect(
      getShipmentSummaryLabel(order({ status: "Shipped" })).value
    ).toBe("Handed to courier");
  });

  it("reports fulfilment progress instead of courier details before shipping", () => {
    expect(getShipmentSummaryLabel(order({ status: "Preparing" }))).toEqual({
      label: "Fulfilment",
      value: "Preparing",
    });
    expect(getShipmentSummaryLabel(order({ status: "Ready to Ship" }))).toEqual({
      label: "Fulfilment",
      value: "Ready to ship",
    });
    expect(
      getShipmentSummaryLabel(order({ status: "Pending Payment" })).value
    ).toBe("Awaiting shipment");
    expect(getShipmentSummaryLabel(order({ status: "Cancelled" })).value).toBe(
      "Cancelled"
    );
  });
});
