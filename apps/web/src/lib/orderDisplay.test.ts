import { describe, expect, it } from "vitest";
import {
  formatOrderPets,
  formatOrderProduct,
  formatStateAndZone,
  petSummaryLabel,
} from "./orderDisplay";

describe("customer order display", () => {
  it("does not repeat an option already present in the product label", () => {
    expect(formatOrderProduct("Paw Pet Tag — Lightweight, QR", "Lightweight")).toBe(
      "Paw Pet Tag — Lightweight, QR"
    );
  });

  it("keeps a distinct option when it adds information", () => {
    expect(formatOrderProduct("MyPetLink Pet Tag", "Standard")).toBe(
      "MyPetLink Pet Tag · Standard"
    );
  });

  it("does not repeat identical state and zone labels", () => {
    expect(formatStateAndZone("Sabah", "sabah")).toBe("Sabah");
    expect(formatStateAndZone("Selangor", "Peninsular")).toBe("Selangor · Peninsular");
  });

  it("summarizes unique pets for a multi-item Admin order", () => {
    const items = [
      { petName: "Topu" },
      { petName: "Topu" },
      { petName: "Milo" },
    ];
    expect(petSummaryLabel(items)).toBe("Pets");
    expect(formatOrderPets(items)).toBe("Topu, Milo");
  });

  it("collapses a large pet list while preserving one-pet wording", () => {
    expect(petSummaryLabel([{ petName: "Topu" }])).toBe("Pet");
    expect(formatOrderPets([
      { petName: "A" }, { petName: "B" }, { petName: "C" }, { petName: "D" },
    ])).toBe("4 pets");
  });
});
