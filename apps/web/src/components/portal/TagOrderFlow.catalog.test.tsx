// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { TagProduct } from "@/services/tagCatalogService";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

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
let petData = [mockPets[0]];
vi.mock("@/services/petService", () => ({
  getPets: vi.fn(async () => ({ data: petData, error: null })),
}));
// Swapped per test so capability rendering can be checked against different
// option configurations without re-mocking the module.
let catalogData: typeof catalog = catalog;
let deliveryQuoteFailure: Error | null = null;

vi.mock("@/services/tagCatalogService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagCatalogService")>();
  return { ...original, listTagProducts: vi.fn(async () => catalogData) };
});
vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return { ...original, createTagOrder: vi.fn() };
});
vi.mock("@/services/deliveryService", () => ({
  listMalaysiaStates: vi.fn(async () => [
    { code: "SGR", name: "Selangor", zoneCode: "PEN", zoneName: "Peninsular", aliases: [] },
  ]),
  resolveLegacyStateCode: vi.fn(() => ""),
  getDeliveryQuote: vi.fn(async () => {
    if (deliveryQuoteFailure) throw deliveryQuoteFailure;
    return ({
    stateCode: "SGR",
    stateName: "Selangor",
    country: "Malaysia",
    zoneCode: "PEN",
    zoneName: "Peninsular",
    deliveryMethod: "Standard Delivery",
    itemSubtotal: 49.9,
    discountAmount: 10,
    deliveryFee: 8,
    isFreeDelivery: false,
    freeDeliveryReason: null,
    total: 47.9,
    currency: "MYR",
    });
  }),
}));

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

const queenQrVariant = {
  ...qrOnlyVariant,
  key: "QUEENQRVARIANT01",
  sku: "QUEEN-LW-QR",
  name: "Queen QR",
};

describe("TagOrderFlow catalog pricing", () => {
  beforeEach(() => {
    window.localStorage.clear();
    catalogData = catalog;
    petData = [mockPets[0]];
    deliveryQuoteFailure = null;
  });
  afterEach(cleanup);

  it("renders backend-calculated product, capabilities, promotion and effective price", async () => {
    render(<TagOrderFlow initialTagType="MyPetLink QR + NFC Smart Tag" pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect(await screen.findByRole("button", { name: /Change tag for Tag 1: Smart Tag, Standard, QR \+ NFC, RM\s*39\.90/ })).toBeTruthy();
    expect(screen.getByText("Smart Tag")).toBeTruthy();
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.getByText("QR + NFC")).toBeTruthy();
    expect(screen.getByText("Save RM10")).toBeTruthy();
    expect(screen.getAllByText(/39\.90/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/MPL-[A-Z0-9]{4}-[A-Z0-9]{4}/)).toBeNull();
    expect(screen.queryByText("Stainless steel")).toBeNull();
  });

  it("never advertises NFC for a QR-only option", async () => {
    catalogData = [{ ...catalog[0], variants: [qrOnlyVariant] }];
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect(await screen.findByRole("button", { name: /Change tag for Tag 1: Smart Tag, Lightweight, QR, RM\s*19\.90/ })).toBeTruthy();
    expect(screen.getByText("QR")).toBeTruthy();
    // No NFC wording anywhere in the flow for a tag that cannot be tapped.
    expect(screen.queryByText(/NFC/i)).toBeNull();
  });

  it("shows a product-level unavailable state when every option is unavailable", async () => {
    catalogData = [{ ...catalog[0], variants: [{ ...catalog[0].variants[0], inStock: false }] }];
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect(await screen.findByText("This product is temporarily unavailable. Please check again later.")).toBeTruthy();
    expect(screen.queryByText(/choose another option/i)).toBeNull();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces a quote failure and clears it after the address is corrected", async () => {
    deliveryQuoteFailure = new Error("network unavailable");
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);
    await screen.findByRole("button", { name: /Change tag for Tag 1/ });
    fireEvent.click(screen.getByRole("button", { name: /Step 3/ }));
    fireEvent.change(screen.getByLabelText(/Recipient name/), { target: { value: "Kai Xuan" } });
    fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: "123456789" } });
    fireEvent.change(screen.getByLabelText(/Address line 1/), { target: { value: "12 Jalan Mawar" } });
    fireEvent.change(screen.getByLabelText(/Postcode/), { target: { value: "47300" } });
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Petaling Jaya" } });
    fireEvent.change(screen.getByLabelText(/State/), { target: { value: "SGR" } });

    expect((await screen.findAllByText(/couldn’t calculate delivery right now/i)).length).toBeGreaterThan(0);
    deliveryQuoteFailure = null;
    fireEvent.change(screen.getByLabelText(/Postcode/), { target: { value: "47301" } });
    expect(await screen.findByText(/Delivery is available/i)).toBeTruthy();
    expect(screen.queryAllByText(/couldn’t calculate delivery right now/i)).toHaveLength(0);
  });

  it("groups technology options under one product and never exposes internal codes", async () => {
    catalogData = [{ ...catalog[0], variants: [qrOnlyVariant, catalog[0].variants[0]] }];
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    const selected = await screen.findByRole("button", { name: /Change tag for Tag 1/ });
    fireEvent.click(selected);

    expect(screen.getByRole("dialog", { name: "Choose a tag" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "Smart Tag" })).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Smart Tag, Lightweight, QR, RM\s*19\.90/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Smart Tag, Standard, QR \+ NFC, RM\s*39\.90/ })).toBeTruthy();
    expect(screen.queryByText("PAW-LW-QR")).toBeNull();
    expect(screen.getAllByText(/19\.90/).length).toBeGreaterThan(0);
  });

  it("updates the features shown when the customer picks a different option", async () => {
    catalogData = [{ ...catalog[0], variants: [qrOnlyVariant, catalog[0].variants[0]] }];
    render(<TagOrderFlow initialTagType="MyPetLink QR + NFC Smart Tag" pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    const selected = await screen.findByRole("button", { name: /Change tag for Tag 1: Smart Tag, Standard, QR \+ NFC/ });
    fireEvent.click(selected);
    fireEvent.click(screen.getByRole("radio", { name: /Smart Tag, Lightweight, QR, RM\s*19\.90/ }));

    expect(await screen.findByRole("button", { name: /Change tag for Tag 1: Smart Tag, Lightweight, QR, RM\s*19\.90/ })).toBeTruthy();
    expect(screen.queryByText("QR + NFC")).toBeNull();
  });

  it("keeps product selections independent across multiple tag lines", async () => {
    catalogData = [
      { ...catalog[0], variants: [qrOnlyVariant, catalog[0].variants[0]] },
      {
        ...catalog[0],
        slug: "queen-pet-tag",
        name: "MyPetLink Queen Pet Tag",
        variants: [queenQrVariant],
      },
    ];
    petData = mockPets.slice(0, 2);
    render(<TagOrderFlow initialTagType="MyPetLink QR + NFC Smart Tag" pets={petData} preselectedPetId={petData[0].id} />);

    expect(await screen.findByRole("button", { name: /Change tag for Tag 1: Smart Tag, Standard, QR \+ NFC/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add another tag" }));
    fireEvent.click(screen.getByRole("button", { name: /Change tag for Tag 2/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Queen Pet Tag, Lightweight, QR, RM\s*19\.90/ }));

    expect(screen.getByRole("button", { name: /Change tag for Tag 1: Smart Tag, Standard, QR \+ NFC/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Change tag for Tag 2: Queen Pet Tag, Lightweight, QR, RM\s*19\.90/ })).toBeTruthy();
  });

  it("does not let the customer reach review before delivery details are complete", async () => {
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);
    await screen.findByRole("button", { name: /Change tag for Tag 1/ });

    fireEvent.click(screen.getByRole("button", { name: /Step 4/ }));

    expect(screen.queryByText("Confirm order")).toBeNull();
  });

  it("uses owner-facing wording on the review step, never SKU or Variant", async () => {
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);
    await screen.findByRole("button", { name: /Change tag for Tag 1/ });

    fireEvent.click(screen.getByRole("button", { name: /Step 3/ }));
    fireEvent.change(screen.getByLabelText(/Recipient name/), { target: { value: "Kai Xuan" } });
    fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: "123456789" } });
    fireEvent.change(screen.getByLabelText(/Address line 1/), { target: { value: "12 Jalan Mawar" } });
    fireEvent.change(screen.getByLabelText(/Postcode/), { target: { value: "47300" } });
    fireEvent.change(screen.getByLabelText(/City/), { target: { value: "Petaling Jaya" } });
    fireEvent.change(screen.getByLabelText(/State/), { target: { value: "SGR" } });
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(screen.getByRole("button", { name: /Step 4/ }));

    expect(await screen.findByText("Confirm order")).toBeTruthy();
    expect(screen.getByText("Merchandise subtotal")).toBeTruthy();
    expect(screen.getAllByText(/MyPetLink Smart Tag/).length).toBeGreaterThan(0);
    // Operations vocabulary must never appear on a customer screen.
    expect(screen.queryByText("SKU")).toBeNull();
    expect(screen.queryByText("Variant")).toBeNull();
    expect(screen.queryByText("MPL-NFC-STANDARD-V1")).toBeNull();
  });

  it("builds one review for multiple pets, line quantities, discounts, and one pending delivery fee", async () => {
    petData = mockPets.slice(0, 2);
    render(<TagOrderFlow pets={petData} preselectedPetId={petData[0].id} />);
    await screen.findByText("Choose your physical tags");

    fireEvent.change(screen.getByLabelText(/^Quantity/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add another tag" }));
    const petSelectors = screen.getAllByLabelText(/^Pet/);
    fireEvent.change(petSelectors[1], { target: { value: petData[1].id } });

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Review tags")).toBeTruthy();
    expect(screen.getAllByText(new RegExp(petData[0].name)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(petData[1].name)).length).toBeGreaterThan(0);
    expect(screen.getByText("Merchandise subtotal")).toBeTruthy();
    expect(screen.getByText("Discount")).toBeTruthy();
    expect(screen.getByText("Calculated after delivery details")).toBeTruthy();
  });
});
