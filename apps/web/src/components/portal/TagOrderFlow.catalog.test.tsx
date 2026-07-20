// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";

const catalog = [
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
vi.mock("@/services/tagCatalogService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagCatalogService")>();
  return { ...original, listTagProducts: vi.fn(async () => catalog) };
});
vi.mock("@/services/tagService", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/tagService")>();
  return { ...original, createTagOrder: vi.fn() };
});

const { TagOrderFlow } = await import("./TagOrderFlow");

describe("TagOrderFlow catalog pricing", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("renders backend-calculated product, capabilities, promotion and effective price", async () => {
    render(<TagOrderFlow pets={[mockPets[0]]} preselectedPetId={mockPets[0].id} />);

    expect((await screen.findAllByText("MyPetLink Smart Tag")).length).toBeGreaterThan(0);
    expect(screen.getByText("Standard NFC · Standard")).toBeTruthy();
    expect(screen.getByText("NFC")).toBeTruthy();
    expect(screen.getByText("Stainless steel")).toBeTruthy();
    expect(screen.getByText("Save RM10")).toBeTruthy();
    expect(screen.getByText(/39\.90/)).toBeTruthy();
    expect(screen.getByText(/49\.90/)).toBeTruthy();
    expect(screen.queryByText(/MPL-[A-Z0-9]{4}-[A-Z0-9]{4}/)).toBeNull();
  });
});
