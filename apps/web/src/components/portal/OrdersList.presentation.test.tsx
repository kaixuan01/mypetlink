// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagOrder } from "@/types";

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => false }));
vi.mock("@/services/petService", () => ({ getPets: vi.fn(async () => ({ data: [] })) }));

const tagMocks = vi.hoisted(() => ({
  getOrders: vi.fn(),
  getAllTags: vi.fn(async () => ({ data: [] })),
}));

vi.mock("@/services/tagService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/tagService")>();
  return { ...actual, getOrders: tagMocks.getOrders, getAllTags: tagMocks.getAllTags };
});

const { OrdersList } = await import("./OrdersList");

const streetLine = "6934, Taman Gemencheh Baru";

function order(overrides: Partial<TagOrder>): TagOrder {
  return {
    id: "order-1",
    orderNumber: "MPL-0001",
    petId: "pet-1",
    petName: "Mochi",
    tagType: "MyPetLink QR Pet Tag",
    variant: "Standard",
    delivery: {
      recipientName: "Aina",
      phone: "+60123456789",
      addressLine1: streetLine,
      addressLine2: "",
      postcode: "68000",
      city: "Ampang",
      state: "Kuala Lumpur",
      notes: "",
    },
    estimatedPrice: "RM29.90",
    status: "Shipped",
    orderedDate: "2026-07-20",
    ...overrides,
  } as TagOrder;
}

function renderList(value: TagOrder) {
  tagMocks.getOrders.mockResolvedValue({ data: [value] });
  return render(<OrdersList initialOrders={[value]} initialTags={[]} pets={[]} />);
}

beforeEach(() => {
  tagMocks.getOrders.mockReset();
  tagMocks.getAllTags.mockReset().mockResolvedValue({ data: [] });
});

afterEach(cleanup);

describe("Orders list compact card", () => {
  it("summarises the destination as city and state, not a cut-off street address", async () => {
    renderList(order({}));

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    expect(screen.getByText("Ampang, Kuala Lumpur")).toBeTruthy();
    // The full address belongs to the expanded details only.
    expect(screen.queryByText(new RegExp(streetLine))).toBeNull();
  });

  it("shows the courier and tracking number for a shipped order with no tracking link", async () => {
    renderList(
      order({
        status: "Shipped",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        shippedDate: "2026-07-24",
      })
    );

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    expect(screen.getByText("J&T Express")).toBeTruthy();
    expect(screen.getByText("JT123456789MY")).toBeTruthy();
    expect(
      screen.getByText(
        "Tracking link is not available. Use this number on the courier’s website."
      )
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: /track parcel/i })).toBeNull();
  });

  it("offers Track Parcel when the courier link is available", async () => {
    renderList(
      order({
        status: "Shipped",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        trackingUrl: "https://www.jtexpress.my/track?no=JT123456789MY",
      })
    );

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    expect(screen.getByRole("link", { name: /track parcel/i })).toBeTruthy();
    expect(screen.getByText("JT123456789MY")).toBeTruthy();
  });

  it("hides courier and tracking entirely before the parcel is handed over", async () => {
    renderList(
      order({
        status: "Preparing",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
      })
    );

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    expect(screen.queryByText("JT123456789MY")).toBeNull();
    expect(screen.queryByText("J&T Express")).toBeNull();
    expect(screen.queryByTestId("order-tracking-panel")).toBeNull();
    expect(screen.getByText("Preparing", { selector: "p" })).toBeTruthy();
  });

  it("never exposes internal fulfilment or courier-cost details", async () => {
    renderList(
      order({
        status: "Shipped",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
      })
    );

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    const body = document.body.textContent ?? "";
    for (const internal of [
      "RowVersion",
      "courierCode",
      "Courier cost",
      "Shipping notes",
      "Internal",
    ]) {
      expect(body).not.toContain(internal);
    }
  });
});

describe("Orders list expanded details", () => {
  it("shows the complete address exactly once and only after opening details", async () => {
    const { container } = renderList(order({}));

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    screen.getByRole("button", { name: "View Order" }).click();

    await waitFor(() =>
      expect(screen.getByText("Delivery & shipment", { selector: "h3" })).toBeTruthy()
    );

    const matches = Array.from(container.querySelectorAll("dd, p")).filter((node) =>
      (node.textContent ?? "").includes(streetLine)
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].textContent).toContain("Ampang");
    expect(matches[0].textContent).toContain("68000");
    // Long values wrap instead of being clipped, so there is no hidden text.
    expect(matches[0].className).not.toContain("truncate");
  });

  it("prices every order line with pet, product, option, quantity and subtotal", async () => {
    renderList(
      order({
        currency: "MYR",
        merchandiseSubtotal: 59.8,
        discountTotal: 0,
        deliveryFee: 0,
        totalAmount: 59.8,
        items: [
          {
            id: "item-1",
            petId: "pet-1",
            petName: "Mochi",
            sku: "MPL-QR-LW",
            productName: "MyPetLink QR Pet Tag",
            variantName: "Lightweight",
            quantity: 2,
            unitBasePrice: 19.9,
            subtotal: 39.8,
            discountAmount: 0,
            finalUnitPrice: 19.9,
            finalAmount: 39.8,
            currency: "MYR",
            supportsQr: true,
            supportsNfc: false,
            assignedTags: [],
          },
          {
            id: "item-2",
            petId: "pet-2",
            petName: "Bibi",
            sku: "MPL-NFC-STD",
            productName: "MyPetLink QR + NFC Smart Tag",
            variantName: "Standard",
            quantity: 1,
            unitBasePrice: 20,
            subtotal: 20,
            discountAmount: 0,
            finalUnitPrice: 20,
            finalAmount: 20,
            currency: "MYR",
            supportsQr: true,
            supportsNfc: true,
            assignedTags: [],
          },
        ],
      })
    );

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    screen.getByRole("button", { name: "View Order" }).click();

    await waitFor(() =>
      expect(screen.getByText("Order items", { selector: "h3" })).toBeTruthy()
    );
    expect(screen.getByText("MyPetLink QR Pet Tag")).toBeTruthy();
    expect(screen.getByText("Lightweight")).toBeTruthy();
    expect(screen.getByText("For Mochi")).toBeTruthy();
    expect(screen.getByText(/2 ×/)).toBeTruthy();
    expect(screen.getByText("MyPetLink QR + NFC Smart Tag")).toBeTruthy();
    expect(screen.getByText("For Bibi")).toBeTruthy();
    expect(screen.getByText("Merchandise subtotal")).toBeTruthy();
  });

  it("groups the expanded panel into order, payment, delivery and shipment", async () => {
    renderList(
      order({
        status: "Shipped",
        courierProvider: "J&T Express",
        trackingNumber: "JT123456789MY",
        shippedDate: "2026-07-24",
      })
    );

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    screen.getByRole("button", { name: "View Order" }).click();

    await waitFor(() =>
      expect(screen.getByText("Delivery & shipment", { selector: "h3" })).toBeTruthy()
    );
    for (const section of ["Order items", "Payment", "Delivery & shipment"]) {
      expect(screen.getByText(section, { selector: "h3" })).toBeTruthy();
    }

    // Delivery and shipment are one journey, so they share one section.
    const journey = screen
      .getByText("Delivery & shipment", { selector: "h3" })
      .closest("section") as HTMLElement;
    expect(within(journey).getByText("Aina")).toBeTruthy();
    expect(within(journey).getByText(new RegExp(streetLine))).toBeTruthy();
    expect(within(journey).getByText("J&T Express")).toBeTruthy();
    expect(within(journey).getByText("2026-07-24")).toBeTruthy();
    expect(within(journey).getByText("JT123456789MY")).toBeTruthy();
    // Copying already lives on the tracking card above the details.
    expect(
      within(journey).queryByRole("button", { name: /copy tracking number/i })
    ).toBeNull();
  });

  it("omits the shipment section for an order that has not shipped", async () => {
    renderList(order({ status: "Payment Confirmed" }));

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    screen.getByRole("button", { name: "View Order" }).click();

    await waitFor(() =>
      expect(screen.getByText("Delivery & shipment", { selector: "h3" })).toBeTruthy()
    );
    const journey = screen
      .getByText("Delivery & shipment", { selector: "h3" })
      .closest("section") as HTMLElement;
    expect(within(journey).queryByText("Shipment")).toBeNull();
    expect(within(journey).queryByText("Courier")).toBeNull();
  });

  it("uses the existing View Order control as the only more-details affordance", async () => {
    renderList(order({}));

    await waitFor(() => expect(screen.getByText("MPL-0001")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /^more$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /show (more|full)/i })).toBeNull();

    screen.getByRole("button", { name: "View Order" }).click();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close Details" })).toBeTruthy()
    );
  });
});
