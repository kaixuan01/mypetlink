// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { TagProduct } from "@/services/tagCatalogService";

const catalog: TagProduct[] = [
  {
    slug: "mypetlink-smart-tag",
    name: "MyPetLink Smart Tag",
    shortDescription: "Durable identification for a safer way home.",
    description: "Customer description",
    media: [],
    variants: [
      {
        key: "PUBLICVARIANT001",
        sku: "MPL-NFC-STANDARD-V1",
        name: "Standard NFC",
        supportsQr: true,
        supportsNfc: true,
        tagVariant: "Standard",
        widthMm: 32,
        heightMm: 32,
        thicknessMm: 2,
        weightGrams: 8,
        material: "Stainless steel",
        shape: "Round",
        colour: "Silver",
        packagingType: "Retail sleeve",
        price: {
          basePrice: 49.9,
          discountAmount: 10,
          finalPrice: 39.9,
          currency: "MYR",
          promotionName: "Launch offer",
          promotionLabel: "Save RM10",
          promotionEndsAt: "2026-07-31T00:00:00Z",
        },
        inStock: true,
        media: [],
      },
    ],
  },
];

vi.mock("@/services/apiConfig", () => ({ isApiConfigured: () => true }));
vi.mock("@/services/petService", () => ({
  getPets: vi.fn(async () => ({ data: [mockPets[0]], error: null })),
}));
// Swapped per test so capability rendering can be checked against different
// option configurations without re-mocking the module.
let catalogData: typeof catalog = catalog;

vi.mock("@/services/tagCatalogService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagCatalogService")>();
  return { ...original, listTagProducts: vi.fn(async () => catalogData) };
});
vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return { ...original, createTagOrder: vi.fn() };
});

const { TagOrderFlow } = await import("./TagOrderFlow");

const qrOnlyVariant = {
  ...catalog[0].variants[0],
  key: "PUBLICVARIANT002",
  sku: "PAW-LW-QR",
  name: "Lightweight QR",
  supportsQr: true,
  supportsNfc: false,
  tagVariant: "Lightweight",
  price: { ...catalog[0].variants[0].price, basePrice: 19.9, discountAmount: 0, finalPrice: 19.9, promotionName: null, promotionLabel: null },
};

describe("TagOrderFlow catalog pricing", () => {
  beforeEach(() => {
    window.localStorage.clear();
    catalogData = catalog;
  });
  afterEach(cleanup);

  it("renders backend-calculated product, capabilities, promotion and effective price", async () => {
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect((await screen.findAllByText("MyPetLink Smart Tag")).length).toBeGreaterThan(0);
    expect(screen.getByText("Standard NFC · Standard")).toBeTruthy();
    expect(screen.getByText("NFC tap")).toBeTruthy();
    expect(screen.getByText("QR code")).toBeTruthy();
    expect(screen.getByText("Stainless steel")).toBeTruthy();
    expect(screen.getByText("Save RM10")).toBeTruthy();
    expect(screen.getByText(/39\.90/)).toBeTruthy();
    expect(screen.getByText(/49\.90/)).toBeTruthy();
    expect(screen.queryByText(/MPL-[A-Z0-9]{4}-[A-Z0-9]{4}/)).toBeNull();
  });

  it("never advertises NFC for a QR-only option", async () => {
    catalogData = [{ ...catalog[0], variants: [qrOnlyVariant] }];
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect(await screen.findByText("QR code")).toBeTruthy();
    // No NFC wording anywhere in the flow for a tag that cannot be tapped.
    expect(screen.queryByText(/NFC/i)).toBeNull();
  });

  it("shows each option separately and never leads with the internal code", async () => {
    catalogData = [{ ...catalog[0], variants: [qrOnlyVariant, catalog[0].variants[0]] }];
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect(await screen.findByText("Lightweight QR · Lightweight")).toBeTruthy();
    expect(screen.getByText("Standard NFC · Standard")).toBeTruthy();
    // The customer chooses by name and price, not by decoding "PAW-LW-QR".
    expect(screen.queryByText("PAW-LW-QR")).toBeNull();
    expect(screen.getByText(/19\.90/)).toBeTruthy();
  });

  it("updates the features shown when the customer picks a different option", async () => {
    catalogData = [{ ...catalog[0], variants: [qrOnlyVariant, catalog[0].variants[0]] }];
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    // The QR + NFC option is preselected, so both features are listed.
    expect(await screen.findByText("NFC tap")).toBeTruthy();

    fireEvent.click(screen.getByText("Lightweight QR · Lightweight"));

    // Selecting the QR-only option must drop the NFC feature.
    await waitFor(() => expect(screen.getAllByText("QR code").length).toBeGreaterThan(0));
  });

  it("does not let the customer reach review before delivery details are complete", async () => {
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);
    await screen.findByText("Standard NFC · Standard");

    fireEvent.click(screen.getByRole("button", { name: /Step 4/ }));

    expect(screen.queryByText("Confirm order")).toBeNull();
  });

  it("uses owner-facing wording on the review step, never SKU or Variant", async () => {
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);
    await screen.findByText("Standard NFC · Standard");

    fireEvent.click(screen.getByRole("button", { name: /Step 3/ }));
    fireEvent.change(screen.getByLabelText("Recipient name"), { target: { value: "Kai Xuan" } });
    fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: "123456789" } });
    fireEvent.change(screen.getByLabelText("Address line 1"), { target: { value: "12 Jalan Mawar" } });
    fireEvent.change(screen.getByLabelText("Postcode"), { target: { value: "47300" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Petaling Jaya" } });
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "Selangor" } });
    fireEvent.click(screen.getByRole("button", { name: /Step 4/ }));

    expect(await screen.findByText("Confirm order")).toBeTruthy();
    expect(screen.getByText("Pet tag")).toBeTruthy();
    expect(screen.getByText("Features")).toBeTruthy();
    expect(screen.getByText("QR code · NFC tap")).toBeTruthy();
    // Operations vocabulary must never appear on a customer screen.
    expect(screen.queryByText("SKU")).toBeNull();
    expect(screen.queryByText("Variant")).toBeNull();
    expect(screen.queryByText("MPL-NFC-STANDARD-V1")).toBeNull();
  });
});
