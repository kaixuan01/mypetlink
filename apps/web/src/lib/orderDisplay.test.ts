import { describe, expect, it } from "vitest";
import { formatOrderProduct, formatStateAndZone } from "./orderDisplay";

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
});
