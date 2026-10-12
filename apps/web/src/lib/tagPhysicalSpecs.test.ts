import { describe, expect, it } from "vitest";
import { formatTagPhysicalSpecs } from "./tagPhysicalSpecs";

describe("formatTagPhysicalSpecs", () => {
  it("uses diameter only for a round SKU with matching width and height", () => {
    expect(formatTagPhysicalSpecs({ widthMm: 25, heightMm: 25, weightGrams: 5, thicknessMm: 1.5, material: "Aluminium", shape: "Round" })).toEqual({
      size: "Diameter 25 mm",
      weight: "Weight 5 g",
      summary: "Diameter 25 mm · Weight 5 g",
      secondary: "Thickness 1.5 mm · Aluminium",
    });
  });

  it("uses width and height for non-round and unequal round SKUs", () => {
    expect(formatTagPhysicalSpecs({ widthMm: 32, heightMm: 32, weightGrams: 8, shape: "Square" }).size).toBe("32 × 32 mm (W × H)");
    expect(formatTagPhysicalSpecs({ widthMm: 32, heightMm: 28, weightGrams: 8, shape: "Round" }).size).toBe("32 × 28 mm (W × H)");
  });

  it("shows only supplied, valid measurements", () => {
    expect(formatTagPhysicalSpecs({ widthMm: 28, heightMm: null, weightGrams: null }).summary).toBe("Width 28 mm");
    expect(formatTagPhysicalSpecs({ widthMm: null, heightMm: 24, weightGrams: 6 }).summary).toBe("Height 24 mm · Weight 6 g");
    expect(formatTagPhysicalSpecs({ widthMm: null, heightMm: null, weightGrams: null }).summary).toBe("");
    expect(formatTagPhysicalSpecs({ widthMm: 0, heightMm: -1, weightGrams: Number.NaN }).summary).toBe("");
  });
});
