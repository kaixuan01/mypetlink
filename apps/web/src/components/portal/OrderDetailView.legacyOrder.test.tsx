// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagOrder } from "@/types";

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: vi.fn(async () => ({ data: [] })) }));

const tagMocks = vi.hoisted(() => ({
  getOrder: vi.fn(),
  getAllTags: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return { ...actual, getOrder: tagMocks.getOrder, getAllTags: tagMocks.getAllTags };
});

const { OrderDetailView } = await import("./OrderDetailView");

function baseOrder(overrides: Partial<TagOrder>): TagOrder {
  return {
    id: "order-1",
    orderNumber: "MPL-0001",
    petId: "pet-1",
    tagType: "MyPetLink QR Pet Tag",
    variant: "Standard",
    delivery: {
      recipientName: "Aina",
      phone: "+60123456789",
      addressLine1: "1 Jalan Pet",
      addressLine2: "",
      postcode: "50000",
      city: "Kuala Lumpur",
      state: "WP Kuala Lumpur",
      notes: "",
    },
    estimatedPrice: "RM29.90",
    status: "Pending Payment",
    orderedDate: "2026-07-20",
    paymentMethod: "QR Payment",
    ...overrides,
  } as TagOrder;
}

beforeEach(() => {
  tagMocks.getOrder.mockReset();
  tagMocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe("OrderDetailView legacy order labelling", () => {
  it("never shows 'Earlier catalog item' or an internal SKU code for a legacy order", async () => {
    const legacy = baseOrder({ sku: undefined, productName: undefined, variantName: undefined });
    tagMocks.getOrder.mockResolvedValue({ data: legacy });

    render(<OrderDetailView initialOrder={legacy} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    await waitFor(() => expect(screen.getByText("Order summary")).toBeTruthy());
    expect(screen.queryByText("Earlier catalog item")).toBeNull();
    expect(screen.queryByText("SKU")).toBeNull();
    // Falls back to the customer-facing tag type and variant labels.
    expect(screen.getAllByText("MyPetLink QR Pet Tag").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Standard").length).toBeGreaterThan(0);
  });

  it("shows the catalog product and variant names without exposing the SKU", async () => {
    const catalogOrder = baseOrder({
      sku: "MPL-NFC-STANDARD-V1",
      productName: "MyPetLink Smart Tag",
      variantName: "Standard NFC",
    });
    tagMocks.getOrder.mockResolvedValue({ data: catalogOrder });

    render(<OrderDetailView initialOrder={catalogOrder} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    await waitFor(() => expect(screen.getByText("Order summary")).toBeTruthy());
    expect(screen.getAllByText("MyPetLink Smart Tag").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Standard NFC").length).toBeGreaterThan(0);
    // The internal SKU code is not shown to owners.
    expect(screen.queryByText("MPL-NFC-STANDARD-V1")).toBeNull();
  });

  it("shows the features that were purchased, not the current catalog setup", async () => {
    const nfcOrder = baseOrder({
      productName: "MyPetLink Smart Tag",
      variantName: "Standard NFC",
      supportsQr: true,
      supportsNfc: true,
    });
    tagMocks.getOrder.mockResolvedValue({ data: nfcOrder });

    render(<OrderDetailView initialOrder={nfcOrder} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    await waitFor(() => expect(screen.getByText("Order summary")).toBeTruthy());
    expect(screen.getAllByText("QR code · NFC tap")).toHaveLength(2);
  });

  it("never shows NFC for an order placed against a QR-only option", async () => {
    const qrOrder = baseOrder({
      productName: "MyPetLink Paw Pet Tag",
      variantName: "Lightweight QR",
      supportsQr: true,
      supportsNfc: false,
    });
    tagMocks.getOrder.mockResolvedValue({ data: qrOrder });

    render(<OrderDetailView initialOrder={qrOrder} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    await waitFor(() => expect(screen.getByText("Order summary")).toBeTruthy());
    expect(screen.getAllByText("QR code")).toHaveLength(2);
    expect(screen.queryByText(/NFC/i)).toBeNull();
  });

  it("omits the features row entirely for older orders that never recorded them", async () => {
    const legacy = baseOrder({ supportsQr: undefined, supportsNfc: undefined });
    tagMocks.getOrder.mockResolvedValue({ data: legacy });

    render(<OrderDetailView initialOrder={legacy} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    await waitFor(() => expect(screen.getByText("Order summary")).toBeTruthy());
    // Better to say nothing than to invent features or show a placeholder.
    expect(screen.queryByText("Features")).toBeNull();
  });

  it("shows only the masked sent confirmation to the owner", async () => {
    const confirmed = baseOrder({
      status: "Payment Confirmed",
      paymentConfirmedDate: "27 Jul 2026",
      paymentConfirmationEmail: {
        sentAt: "2026-07-27T02:01:00Z",
        maskedRecipient: "a***@example.com",
      },
    });
    tagMocks.getOrder.mockResolvedValue({ data: confirmed });

    render(<OrderDetailView initialOrder={confirmed} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    expect(
      await screen.findByText(/A payment confirmation email has been sent to/)
    ).toBeTruthy();
    expect(screen.getByText(/a\*\*\*@example\.com/)).toBeTruthy();
    expect(screen.queryByText(/retry/i)).toBeNull();
  });

  it("shows the full persisted receipt reference for a confirmed order", async () => {
    const confirmed = baseOrder({
      status: "Payment Confirmed",
      receiptNumber: "MPL-RCP-260727141423-4827",
    });
    tagMocks.getOrder.mockResolvedValue({ data: confirmed });

    render(
      <OrderDetailView
        initialOrder={confirmed}
        initialTags={[]}
        orderKey="MPL-ORD-260727123029-9916"
        pets={[]}
      />
    );

    expect(
      await screen.findByText(/MPL-RCP-260727141423-4827/)
    ).toBeTruthy();
  });

  it("shows customer-safe shipment details without internal courier cost or notes", async () => {
    const shipped = baseOrder({
      status: "Shipped",
      courierProvider: "J&T Express",
      courierService: "Standard Delivery",
      trackingNumber: "MY123456789",
      readyToShipDate: "29 Jul 2026",
      shippedDate: "30 Jul 2026",
      trackingStatus: "Shipped with J&T Express.",
    });
    tagMocks.getOrder.mockResolvedValue({ data: shipped });

    render(<OrderDetailView initialOrder={shipped} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    expect(await screen.findByText("J&T Express")).toBeTruthy();
    expect(screen.getByText("Standard Delivery")).toBeTruthy();
    expect(screen.getByText("MY123456789")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy tracking number" })).toBeTruthy();
    expect(screen.queryByText(/actual courier cost/i)).toBeNull();
    expect(screen.queryByText(/shipping notes/i)).toBeNull();
  });

  it("shows Track Parcel only when the shipped order contains a safe generated URL", async () => {
    const shipped = baseOrder({
      status: "Shipped",
      courierProvider: "J&T Express",
      trackingNumber: "MY 123/45",
      trackingUrl: "https://example.test/track?number=MY%20123%2F45",
      shippedDate: "30 Jul 2026",
    });
    tagMocks.getOrder.mockResolvedValue({ data: shipped });

    const { unmount } = render(
      <OrderDetailView initialOrder={shipped} initialTags={[]} orderKey="MPL-0001" pets={[]} />
    );
    const link = await screen.findByRole("link", { name: "Track Parcel" });
    expect(link.getAttribute("href")).toBe(
      "https://example.test/track?number=MY%20123%2F45"
    );
    expect(screen.getByText("MY 123/45")).toBeTruthy();

    const withoutUrl = { ...shipped, trackingUrl: undefined };
    unmount();
    render(
      <OrderDetailView initialOrder={withoutUrl} initialTags={[]} orderKey="MPL-0001" pets={[]} />
    );
    expect(screen.queryByRole("link", { name: "Track Parcel" })).toBeNull();
    expect(screen.getByText("MY 123/45")).toBeTruthy();
  });

  it("hides courier and tracking details until the parcel has actually shipped", async () => {
    // Admins enter courier details while the tag is still being packed. Showing
    // them now would have the customer chasing a number the courier has not
    // accepted yet.
    const readyToShip = baseOrder({
      status: "Ready to Ship",
      courierProvider: "Pos Laju",
      courierService: "Overnight",
      trackingNumber: "PL-QA-9999",
      readyToShipDate: "30 Jul 2026",
      trackingStatus: "Your tag is ready to ship.",
    });
    tagMocks.getOrder.mockResolvedValue({ data: readyToShip });

    render(<OrderDetailView initialOrder={readyToShip} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    expect(await screen.findByText("Your tag is ready to ship.")).toBeTruthy();
    expect(screen.queryByText("Pos Laju")).toBeNull();
    expect(screen.queryByText("Overnight")).toBeNull();
    expect(screen.queryByText("PL-QA-9999")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy tracking number" })).toBeNull();
    // The shipment card only appears after handover, so there are no empty
    // courier rows for the customer to read as a problem.
    expect(screen.queryByRole("heading", { name: "Shipment" })).toBeNull();
    expect(screen.queryByText("Not available yet")).toBeNull();
    // The fulfilment progress the customer can act on is still shown.
    expect(screen.getAllByText("30 Jul 2026").length).toBeGreaterThan(0);
  });

  it("does not tell the customer a timeline step has no recorded time", async () => {
    const preparing = baseOrder({
      status: "Preparing",
      timeline: [
        { type: "OrderCreated", title: "Order created", timestampLabel: "30 Jul 2026, 7:36 PM", tone: "completed" },
        // The API sends no timestamp for tag preparation, which the service
        // layer maps to undefined.
        { type: "PreparingTag", title: "Tag preparing", description: "Your tag is being prepared.", timestampLabel: undefined, tone: "current" },
      ],
    });
    tagMocks.getOrder.mockResolvedValue({ data: preparing });

    render(<OrderDetailView initialOrder={preparing} initialTags={[]} orderKey="MPL-0001" pets={[]} />);

    expect(await screen.findByText("Tag preparing")).toBeTruthy();
    expect(screen.queryByText(/time not available/i)).toBeNull();
  });
});
