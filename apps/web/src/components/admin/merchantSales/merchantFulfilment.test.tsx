// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/services/apiClient";
import {
  allocationItem,
  allocationSummary,
  courierOption,
  deliveryOrder,
  fulfilment,
  order,
} from "./merchantSalesFixtures";

const getFulfilment = vi.fn();
const markReadyToShip = vi.fn();
const markShipped = vi.fn();
const markDelivered = vi.fn();
const issueDeliveryOrder = vi.fn();
const listShippingCourierOptions = vi.fn();

vi.mock("@/services/adminMerchantFulfilmentService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantFulfilmentService")
  >("@/services/adminMerchantFulfilmentService");
  return {
    ...actual,
    getFulfilment: (...a: unknown[]) => getFulfilment(...a),
    markReadyToShip: (...a: unknown[]) => markReadyToShip(...a),
    markShipped: (...a: unknown[]) => markShipped(...a),
    markDelivered: (...a: unknown[]) => markDelivered(...a),
    issueDeliveryOrder: (...a: unknown[]) => issueDeliveryOrder(...a),
  };
});

const downloadMerchantDocument = vi.fn();

vi.mock("@/services/adminMerchantBillingService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminMerchantBillingService")
  >("@/services/adminMerchantBillingService");
  return {
    ...actual,
    downloadMerchantDocument: (...a: unknown[]) => downloadMerchantDocument(...a),
  };
});

vi.mock("@/services/adminShippingFulfilmentService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/adminShippingFulfilmentService")
  >("@/services/adminShippingFulfilmentService");
  return {
    ...actual,
    listShippingCourierOptions: (...a: unknown[]) => listShippingCourierOptions(...a),
  };
});

const { OrderFulfilmentSection } = await import("./OrderFulfilmentSection");

const paidOrder = order({ paymentStatus: "PaymentConfirmed" });
const complete = () =>
  allocationSummary({
    allocatedUnits: 100,
    remainingUnits: 0,
    isFullyAllocated: true,
    items: [allocationItem({ allocatedUnits: 100, remainingUnits: 0, isFullyAllocated: true })],
  });

beforeEach(() => {
  vi.clearAllMocks();
  getFulfilment.mockResolvedValue(fulfilment());
  markReadyToShip.mockResolvedValue(fulfilment({ fulfilmentStatus: "ReadyToShip" }));
  markShipped.mockResolvedValue(fulfilment({ fulfilmentStatus: "Shipped" }));
  markDelivered.mockResolvedValue(fulfilment({ fulfilmentStatus: "Delivered" }));
  issueDeliveryOrder.mockResolvedValue(deliveryOrder());
  downloadMerchantDocument.mockResolvedValue({ fileName: "MyPetLink-Delivery-Order-MPL-DO-260806-0001.pdf" });
  listShippingCourierOptions.mockResolvedValue([
    courierOption(),
    courierOption({ code: "POSLAJU", displayName: "Pos Laju", isDefault: false, displayOrder: 2 }),
  ]);
});
afterEach(cleanup);

const noop = () => {};
const renderSection = (summary = complete()) =>
  render(
    <OrderFulfilmentSection onFulfilmentChanged={noop} order={paidOrder} summary={summary} />
  );

/** Gets to the shipment form with the order already Ready to Ship. */
async function renderReadyToShip() {
  getFulfilment.mockResolvedValue(fulfilment({ fulfilmentStatus: "ReadyToShip" }));
  renderSection();
  return screen.findByTestId("shipment-form");
}

async function renderShipped(overrides = {}) {
  getFulfilment.mockResolvedValue(
    fulfilment({
      fulfilmentStatus: "Shipped",
      courierProvider: "J&T Express",
      courierProviderCode: "JNT",
      courierService: "Express",
      trackingNumber: "JT123456789MY",
      trackingUrl: "https://track.example/JT123456789MY",
      shippedAt: "2026-08-08T04:00:00Z",
      ...overrides,
    })
  );
  renderSection();
  return screen.findByTestId("shipment-card");
}

describe("Ready to Ship", () => {
  it("offers the step once every line is allocated", async () => {
    renderSection();

    expect(await screen.findByTestId("mark-ready-to-ship")).toBeTruthy();
    expect(screen.getByText("All required tags are allocated.")).toBeTruthy();
  });

  it("never takes the step on its own", async () => {
    renderSection();

    await screen.findByTestId("mark-ready-to-ship");
    expect(markReadyToShip).not.toHaveBeenCalled();
    expect(screen.getByTestId("fulfilment-status").textContent).toBe("Preparing");
  });

  it("names every line that is still short", async () => {
    renderSection(
      allocationSummary({
        allocatedUnits: 70,
        remainingUnits: 30,
        items: [
          allocationItem({
            merchantOrderItemId: "line-1",
            skuCode: "PAW-LW-NFC",
            allocatedUnits: 75,
            remainingUnits: 25,
          }),
          allocationItem({
            merchantOrderItemId: "line-2",
            skuCode: "BONE-ST-QR",
            allocatedUnits: 20,
            remainingUnits: 5,
          }),
        ],
      })
    );

    const blocked = await screen.findByTestId("ready-blocked");
    expect(blocked.textContent).toContain("Cannot mark Ready to Ship yet.");
    expect(blocked.textContent).toContain("Missing inventory:");
    expect(blocked.textContent).toContain("PAW-LW-NFC — 25 tags remaining");
    expect(blocked.textContent).toContain("BONE-ST-QR — 5 tags remaining");
    expect(screen.queryByTestId("mark-ready-to-ship")).toBeNull();
  });

  it("lists only the line that is short when just one is", async () => {
    renderSection(
      allocationSummary({
        allocatedUnits: 95,
        remainingUnits: 5,
        items: [
          allocationItem({ merchantOrderItemId: "line-1", allocatedUnits: 100, remainingUnits: 0 }),
          allocationItem({
            merchantOrderItemId: "line-2",
            skuCode: "BONE-ST-QR",
            allocatedUnits: 20,
            remainingUnits: 5,
          }),
        ],
      })
    );

    const blocked = await screen.findByTestId("ready-blocked");
    const bullets = blocked.textContent?.match(/•/g) ?? [];
    expect(bullets).toHaveLength(1);
    expect(blocked.textContent).toContain("BONE-ST-QR — 5 tags remaining");
  });

  it("confirms with the total, the merchant and the delivery address", async () => {
    renderSection();
    fireEvent.click(await screen.findByTestId("mark-ready-to-ship"));

    expect(screen.getByText("Mark this order Ready to Ship?")).toBeTruthy();
    expect(screen.getByText(/All 100 required tags are allocated\./)).toBeTruthy();
    expect(screen.getByText(/Happy Paws Veterinary Group Sdn Bhd/)).toBeTruthy();
    expect(screen.getByText(/Once confirmed, the order will move to the shipping step\./))
      .toBeTruthy();

    const items = screen.getByTestId("ready-item-summary");
    expect(within(items).getByText("WS-QR-0001")).toBeTruthy();
    expect(within(items).getByText("100 tags")).toBeTruthy();
  });

  it("sends the current concurrency token and records the delivery note", async () => {
    renderSection();
    fireEvent.click(await screen.findByTestId("mark-ready-to-ship"));
    fireEvent.click(screen.getByRole("button", { name: "Mark Ready to Ship" }));

    expect(await screen.findByText("This order is ready to ship. Record the shipment below."))
      .toBeTruthy();
    expect(markReadyToShip).toHaveBeenCalledWith("order-1", "token-fulfilment-1");
    expect(issueDeliveryOrder).toHaveBeenCalledWith("order-1");
  });

  it("still reports success when the delivery note cannot be recorded", async () => {
    issueDeliveryOrder.mockRejectedValue(new ApiClientError(409, "delivery_order_not_ready", ""));
    renderSection();
    fireEvent.click(await screen.findByTestId("mark-ready-to-ship"));
    fireEvent.click(screen.getByRole("button", { name: "Mark Ready to Ship" }));

    expect(await screen.findByText("This order is ready to ship. Record the shipment below."))
      .toBeTruthy();
  });

  it("says so and offers a way back when the delivery note was not prepared", async () => {
    issueDeliveryOrder.mockRejectedValue(new ApiClientError(409, "delivery_order_not_ready", ""));
    // The order starts Preparing so the action is offered; every read after the
    // transition finds it Ready to Ship with no delivery note.
    getFulfilment
      .mockResolvedValueOnce(fulfilment())
      .mockResolvedValue(fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: null }));
    renderSection();
    fireEvent.click(await screen.findByTestId("mark-ready-to-ship"));
    fireEvent.click(screen.getByRole("button", { name: "Mark Ready to Ship" }));

    const warning = await screen.findByTestId("delivery-order-missing");
    expect(warning.textContent).toContain(
      "The order is Ready to Ship, but the Delivery Order could not be prepared. Try again."
    );
    expect(screen.getByTestId("retry-delivery-order")).toBeTruthy();
  });

  it("shows the same warning on a later visit, not only right after the failure", async () => {
    // A reload, a Back, or another admin opening the order must all find the
    // stranded delivery note and the way out of it.
    getFulfilment.mockResolvedValue(
      fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: null })
    );
    renderSection();

    expect(await screen.findByTestId("delivery-order-missing")).toBeTruthy();
    expect(issueDeliveryOrder).not.toHaveBeenCalled();
  });

  it("retrying prepares the delivery note and clears the warning", async () => {
    getFulfilment
      .mockResolvedValueOnce(fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: null }))
      .mockResolvedValue(
        fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: deliveryOrder() })
      );
    renderSection();

    fireEvent.click(await screen.findByTestId("retry-delivery-order"));

    expect((await screen.findByTestId("delivery-order-number")).textContent)
      .toBe("MPL-DO-260806-0001");
    expect(screen.queryByTestId("delivery-order-missing")).toBeNull();
    expect(issueDeliveryOrder).toHaveBeenCalledWith("order-1");
  });

  it("explains a failed retry without losing the way back", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: null })
    );
    issueDeliveryOrder.mockRejectedValue(
      new ApiClientError(409, "allocation_incomplete", "Every line must be fully allocated.")
    );
    renderSection();

    fireEvent.click(await screen.findByTestId("retry-delivery-order"));

    expect(await screen.findByText("Every line must be fully allocated.")).toBeTruthy();
    expect(screen.getByTestId("retry-delivery-order")).toBeTruthy();
  });

  it("offers the delivery note as a download once it exists", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: deliveryOrder() })
    );
    renderSection();

    const button = await screen.findByTestId("download-deliveryOrder");
    expect(button.textContent).toBe("Download Delivery Order");

    fireEvent.click(button);

    expect(downloadMerchantDocument).toHaveBeenCalledWith("deliveryOrder", "delivery-order-1");
  });

  it("reports the shipment email once the order has shipped", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({
        fulfilmentStatus: "Shipped",
        trackingNumber: "JT1",
        deliveryOrder: deliveryOrder(),
        shipmentEmail: {
          state: "Sent",
          recipientEmail: "orders@happypaws.example",
          sentAt: "2026-08-10T02:00:00Z",
        },
      })
    );
    renderSection();

    expect((await screen.findByTestId("shipment-email-status")).textContent).toBe("Sent");
  });

  it("says plainly when the shipment email is held because the template is off", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({
        fulfilmentStatus: "Shipped",
        trackingNumber: "JT1",
        deliveryOrder: deliveryOrder(),
        shipmentEmail: {
          state: "HeldTemplateOff",
          recipientEmail: "orders@happypaws.example",
          sentAt: null,
        },
      })
    );
    renderSection();

    expect((await screen.findByTestId("shipment-email-status")).textContent)
      .toBe("Held — template off");
  });

  it("describes a queued or failed shipment email without exposing internals", async () => {
    for (const [state, label] of [
      ["Queued", "Queued"],
      ["Failed", "Failed — we will try again"],
    ] as const) {
      cleanup();
      getFulfilment.mockResolvedValue(
        fulfilment({
          fulfilmentStatus: "Shipped",
          trackingNumber: "JT1",
          deliveryOrder: deliveryOrder(),
          shipmentEmail: { state, recipientEmail: "a@b.example", sentAt: null },
        })
      );
      renderSection();

      const status = await screen.findByTestId("shipment-email-status");
      expect(status.textContent).toBe(label);
      // Never the raw outbox vocabulary, never a message id.
      expect(status.textContent).not.toMatch(/Suppressed|Pending|Sending|[0-9a-f]{8}-/i);
    }
  });

  it("shows no shipment email before the order has one", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: deliveryOrder() })
    );
    renderSection();

    await screen.findByTestId("delivery-order-number");
    expect(screen.queryByTestId("shipment-email-status")).toBeNull();
  });

  it("never offers to send or resend the shipment email", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({
        fulfilmentStatus: "Shipped",
        trackingNumber: "JT1",
        deliveryOrder: deliveryOrder(),
        shipmentEmail: { state: "HeldTemplateOff", recipientEmail: "a@b.example", sentAt: null },
      })
    );
    renderSection();

    await screen.findByTestId("shipment-email-status");
    const labels = screen.getAllByRole("button").map((el) => el.textContent ?? "");
    expect(labels.some((l) => /send|resend|retry email/i.test(l))).toBe(false);
  });

  it("offers no delivery note download before one has been prepared", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({ fulfilmentStatus: "ReadyToShip", deliveryOrder: null })
    );
    renderSection();

    await screen.findByTestId("delivery-order-missing");
    expect(screen.queryByTestId("download-deliveryOrder")).toBeNull();
  });

  it("says plainly when the delivery note could not be prepared for download", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({ fulfilmentStatus: "Shipped", deliveryOrder: deliveryOrder() })
    );
    downloadMerchantDocument.mockRejectedValue(
      new Error("That document is not available. The record may have been removed.")
    );
    renderSection();

    fireEvent.click(await screen.findByTestId("download-deliveryOrder"));

    expect(
      await screen.findByText("That document is not available. The record may have been removed.")
    ).toBeTruthy();
  });

  it("never warns about a delivery note before the order is ready", async () => {
    getFulfilment.mockResolvedValue(fulfilment({ fulfilmentStatus: "Preparing" }));
    renderSection();

    await screen.findByTestId("mark-ready-to-ship");
    expect(screen.queryByTestId("delivery-order-missing")).toBeNull();
  });

  it("explains a refusal in plain words", async () => {
    markReadyToShip.mockRejectedValue(
      new ApiClientError(409, "allocation_incomplete", "WS-QR-0001 still needs 5 more unit(s).")
    );
    renderSection();
    fireEvent.click(await screen.findByTestId("mark-ready-to-ship"));
    fireEvent.click(screen.getByRole("button", { name: "Mark Ready to Ship" }));

    expect(await screen.findByText("WS-QR-0001 still needs 5 more unit(s).")).toBeTruthy();
    expect(screen.queryByText(/allocation_incomplete/)).toBeNull();
  });

  it("cancelling changes nothing", async () => {
    renderSection();
    fireEvent.click(await screen.findByTestId("mark-ready-to-ship"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(markReadyToShip).not.toHaveBeenCalled();
  });
});

describe("Shipment form", () => {
  it("offers only configured couriers, never free text", async () => {
    await renderReadyToShip();

    const picker = screen.getByTestId("courier-provider") as HTMLSelectElement;
    expect(picker.tagName).toBe("SELECT");
    expect([...picker.options].map((o) => o.textContent)).toEqual([
      "Choose a courier",
      "J&T Express",
      "Pos Laju",
    ]);
  });

  it("requires a courier", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    expect(screen.getByText("Choose the courier carrying this shipment.")).toBeTruthy();
    expect(markShipped).not.toHaveBeenCalled();
  });

  it("requires a tracking number", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    expect(
      screen.getByText("Enter the courier tracking number before marking this order as Shipped.")
    ).toBeTruthy();
    expect(markShipped).not.toHaveBeenCalled();
  });

  it("rejects a tracking number that is only whitespace", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    expect(
      screen.getByText("Enter the courier tracking number before marking this order as Shipped.")
    ).toBeTruthy();
  });

  it("rejects control characters in a tracking number", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    // A single-line input strips CR/LF itself, so the guard is proved with a
    // control character that survives being typed or pasted.
    fireEvent.change(screen.getByTestId("tracking-number"), {
      target: { value: "JT123456" },
    });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    expect(
      screen.getByText("Tracking numbers cannot contain line breaks or control characters.")
    ).toBeTruthy();
    expect(markShipped).not.toHaveBeenCalled();
  });

  it("trims the tracking number before sending it", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), {
      target: { value: "  JT123456789MY  " },
    });
    fireEvent.click(screen.getByTestId("mark-shipped"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as Shipped" }));

    expect(markShipped.mock.calls[0][1].trackingNumber).toBe("JT123456789MY");
  });

  it("accepts ordinary courier characters", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), {
      target: { value: "JT-123-456789-MY" },
    });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    expect(screen.getByText("Mark this order as Shipped?")).toBeTruthy();
  });

  it("ships without a courier service", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as Shipped" }));

    expect(markShipped.mock.calls[0][1].courierService).toBeNull();
  });

  it("names the service in the confirmation when one is given", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("courier-service"), { target: { value: "Express" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    expect(screen.getByText(/Service:\s*Express/)).toBeTruthy();
  });

  for (const [label, value, expected] of [
    ["a negative cost", "-5", "The cost cannot be negative."],
    ["a non-numeric cost", "abc", "Enter the cost as a number, or leave it blank."],
    ["a three-decimal cost", "12.345", "Enter the cost with at most two decimal places."],
  ] as const) {
    it(`rejects ${label}`, async () => {
      await renderReadyToShip();

      fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
      fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
      fireEvent.change(screen.getByTestId("internal-cost"), { target: { value } });
      fireEvent.click(screen.getByTestId("mark-shipped"));

      expect(screen.getByText(expected)).toBeTruthy();
      expect(markShipped).not.toHaveBeenCalled();
    });
  }

  it("accepts a two-decimal cost", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.change(screen.getByTestId("internal-cost"), { target: { value: "12.50" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as Shipped" }));

    expect(markShipped.mock.calls[0][1].internalCourierCost).toBe(12.5);
  });

  it("marks the internal fields as Admin-only in visible text", async () => {
    await renderReadyToShip();

    expect(
      screen.getByText("For internal cost tracking only. The merchant will not see this amount.")
    ).toBeTruthy();
    expect(
      screen.getByText("Admin only. These notes are not shown to the merchant.")
    ).toBeTruthy();
  });

  it("keeps the internal fields out of the shipment confirmation", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.change(screen.getByTestId("internal-cost"), { target: { value: "42.00" } });
    fireEvent.change(screen.getByTestId("internal-notes"), {
      target: { value: "Fragile, double boxed." },
    });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    const dialog = screen.getByText("Mark this order as Shipped?").closest("div") as HTMLElement;
    expect(dialog.textContent).not.toContain("42.00");
    expect(dialog.textContent).not.toContain("Fragile, double boxed.");
  });

  it("shows the tracking link preview once a courier and number are chosen", async () => {
    await renderReadyToShip();

    expect(screen.queryByTestId("tracking-preview")).toBeNull();
    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });

    const preview = screen.getByTestId("tracking-preview");
    expect(preview.textContent).toContain("Tracking link preview");
    expect(preview.textContent).toContain(
      "The Track Parcel button will use the configured courier tracking link after shipment."
    );
  });

  it("explains a refused shipment without showing the raw code", async () => {
    markShipped.mockRejectedValue(
      new ApiClientError(400, "tracking_required", "Enter the tracking number.")
    );
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as Shipped" }));

    expect(
      await screen.findByText("Enter the tracking number before marking this order shipped.")
    ).toBeTruthy();
    expect(screen.queryByText(/tracking_required/)).toBeNull();
  });

  it("reloads the courier list when a chosen provider is refused", async () => {
    markShipped.mockRejectedValue(
      new ApiClientError(409, "concurrency_conflict", "Changed.")
    );
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("courier-provider"), { target: { value: "JNT" } });
    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "JT1" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as Shipped" }));

    expect(
      await screen.findByText(
        "Inventory changed while you were working. The latest availability has been loaded."
      )
    ).toBeTruthy();
    expect(listShippingCourierOptions.mock.calls.length).toBeGreaterThan(1);
  });
});

describe("Shipped state", () => {
  it("shows the courier, service, tracking and dispatch time", async () => {
    const card = await renderShipped();

    expect(card.textContent).toContain("J&T Express");
    expect(card.textContent).toContain("Express");
    expect(screen.getByTestId("tracking-value").textContent).toBe("JT123456789MY");
    expect(card.textContent).toContain("Shipped");
  });

  it("omits the service row when none was recorded", async () => {
    const card = await renderShipped({ courierService: null });

    expect(within(card).queryByText("Service")).toBeNull();
  });

  it("offers Track Parcel only when the courier has a link", async () => {
    await renderShipped();

    const link = screen.getByTestId("track-parcel");
    expect(link.getAttribute("href")).toBe("https://track.example/JT123456789MY");
    expect(link.textContent).toContain("J&T Express");
    expect(screen.queryByTestId("no-tracking-link")).toBeNull();
  });

  it("still shows the number when the courier has no link", async () => {
    await renderShipped({ trackingUrl: null });

    expect(screen.getByTestId("tracking-value").textContent).toBe("JT123456789MY");
    expect(screen.queryByTestId("track-parcel")).toBeNull();
    expect(screen.getByTestId("no-tracking-link").textContent).toBe(
      "Tracking is available directly from the courier using this number."
    );
  });

  it("refuses to turn an unsafe tracking link into a destination", async () => {
    await renderShipped({ trackingUrl: "javascript:alert(1)" });

    expect(screen.queryByTestId("track-parcel")).toBeNull();
    expect(screen.getByTestId("no-tracking-link")).toBeTruthy();
  });

  it("copies the exact tracking number and says so politely", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await renderShipped();

    fireEvent.click(screen.getByTestId("copy-tracking"));

    expect(writeText).toHaveBeenCalledWith("JT123456789MY");
    const announcement = await screen.findByText("Tracking number copied");
    expect(announcement.getAttribute("aria-live")).toBe("polite");
  });

  it("says so without breaking when the clipboard is blocked", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    await renderShipped();

    fireEvent.click(screen.getByTestId("copy-tracking"));

    expect(
      await screen.findByText(
        "Copy the tracking number manually: your browser blocked the clipboard."
      )
    ).toBeTruthy();
  });

  it("shows the delivery note number when one exists", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({
        fulfilmentStatus: "Shipped",
        trackingNumber: "JT1",
        deliveryOrder: deliveryOrder(),
      })
    );
    renderSection();

    expect((await screen.findByTestId("delivery-order-number")).textContent).toBe(
      "MPL-DO-260806-0001"
    );
  });

  it("offers only the download, never printing or emailing the delivery note", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({
        fulfilmentStatus: "Shipped",
        trackingNumber: "JT1",
        deliveryOrder: deliveryOrder(),
      })
    );
    renderSection();
    await screen.findByTestId("delivery-order-number");

    const labels = screen.getAllByRole("button").map((el) => el.textContent ?? "");
    expect(labels.some((l) => /^Download Delivery Order$/.test(l))).toBe(true);
    expect(labels.some((l) => /print|email/i.test(l))).toBe(false);
  });

  it("closes the shipment to further editing", async () => {
    await renderShipped();

    expect(screen.queryByTestId("shipment-form")).toBeNull();
    expect(screen.queryByTestId("courier-provider")).toBeNull();
    expect(screen.queryByTestId("tracking-number")).toBeNull();
    expect(screen.queryByRole("button", { name: /edit shipment/i })).toBeNull();
  });

  it("withdraws the earlier fulfilment actions", async () => {
    await renderShipped();

    expect(screen.queryByTestId("mark-ready-to-ship")).toBeNull();
    expect(screen.queryByTestId("mark-shipped")).toBeNull();
    expect(screen.getByTestId("mark-delivered")).toBeTruthy();
  });
});

describe("Delivered", () => {
  it("confirms with the merchant, courier and tracking", async () => {
    await renderShipped();
    fireEvent.click(screen.getByTestId("mark-delivered"));

    // The card behind the dialog names the same courier, so the assertion is
    // scoped to the confirmation itself.
    const dialog = screen
      .getByText("Mark this order as Delivered?")
      .closest('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain("Happy Paws Veterinary Group Sdn Bhd");
    expect(dialog.textContent).toContain("J&T Express");
    expect(dialog.textContent).toContain("JT123456789MY");
    expect(dialog.textContent).toContain("This will record the shipment as delivered.");
  });

  it("records delivery with the current token", async () => {
    await renderShipped();
    fireEvent.click(screen.getByTestId("mark-delivered"));
    fireEvent.click(screen.getByRole("button", { name: "Mark as Delivered" }));

    expect(await screen.findByText("This order is marked as delivered.")).toBeTruthy();
    expect(markDelivered).toHaveBeenCalledWith("order-1", "token-fulfilment-1");
  });

  it("is terminal: nothing further can be changed", async () => {
    getFulfilment.mockResolvedValue(
      fulfilment({
        fulfilmentStatus: "Delivered",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        shippedAt: "2026-08-08T04:00:00Z",
        deliveredAt: "2026-08-09T04:00:00Z",
      })
    );
    renderSection();
    await screen.findByTestId("shipment-card");

    expect(screen.getByTestId("fulfilment-status").textContent).toBe("Delivered");
    expect(screen.queryByTestId("mark-delivered")).toBeNull();
    expect(screen.queryByTestId("mark-shipped")).toBeNull();
    expect(screen.queryByTestId("mark-ready-to-ship")).toBeNull();
    expect(screen.queryByTestId("shipment-form")).toBeNull();

    const labels = screen.getAllByRole("button").map((el) => el.textContent ?? "");
    expect(labels.some((l) => /return to|reassign|cancel order|release/i.test(l))).toBe(false);
    // The tracking number stays readable and copyable after delivery.
    expect(screen.getByTestId("tracking-value").textContent).toBe("JT123456789MY");
  });
});

describe("Accessibility", () => {
  it("labels every shipment field and ties its helper text to it", async () => {
    await renderReadyToShip();

    for (const testId of [
      "courier-provider",
      "courier-service",
      "tracking-number",
      "internal-cost",
      "internal-notes",
    ]) {
      const field = screen.getByTestId(testId);
      expect(document.querySelector(`label[for="${field.id}"]`)).toBeTruthy();
    }

    const cost = screen.getByTestId("internal-cost");
    const described = cost.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(described.split(" ")[0])?.textContent).toContain(
      "The merchant will not see this amount."
    );
  });

  it("marks a rejected field invalid and points at its message", async () => {
    await renderReadyToShip();

    fireEvent.change(screen.getByTestId("tracking-number"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("mark-shipped"));

    const field = screen.getByTestId("tracking-number");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const describedBy = field.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toBe(
      "Enter the courier tracking number before marking this order as Shipped."
    );
  });

  it("states the fulfilment status in words", async () => {
    await renderShipped();

    expect(screen.getByTestId("fulfilment-status").textContent).toBe("Shipped");
  });
});
