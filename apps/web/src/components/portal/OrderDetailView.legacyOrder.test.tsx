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
    expect(screen.getAllByText("Standard Tag").length).toBeGreaterThan(0);
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
    expect(screen.getByText("MyPetLink Smart Tag")).toBeTruthy();
    expect(screen.getByText("Standard NFC")).toBeTruthy();
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
    expect(screen.getByText("QR code · NFC tap")).toBeTruthy();
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
    expect(screen.getByText("QR code")).toBeTruthy();
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
});
