import { describe, expect, it } from "vitest";

import {
  adminRegionLabel,
  customerDeliveryMethod,
  normalizeDeliveryMethod,
  normalizeDeliveryRegion,
  resolveZoneCode,
  toPlainDeliveryLabel,
} from "./deliveryLabels";

describe("customer delivery wording", () => {
  it("uses one canonical shape for every region", () => {
    expect(customerDeliveryMethod("PEN")).toBe("Standard Delivery — West Malaysia");
    expect(customerDeliveryMethod("SBH")).toBe("Standard Delivery — Sabah");
    expect(customerDeliveryMethod("SWK")).toBe("Standard Delivery — Sarawak");
    expect(customerDeliveryMethod("LBN")).toBe("Standard Delivery — Labuan");
  });

  it("never shows customers the Peninsular wording", () => {
    expect(customerDeliveryMethod("PEN")).not.toContain("Peninsular");
    expect(normalizeDeliveryRegion("Peninsular")).toBe("West Malaysia");
  });

  it("uses the typographic en dash, not a hyphen", () => {
    expect(customerDeliveryMethod("PEN")).toContain("—");
    expect(customerDeliveryMethod("PEN")).not.toContain(" - ");
  });
});

describe("admin region wording", () => {
  it("keeps both names so the zone stays recognisable", () => {
    expect(adminRegionLabel("PEN")).toBe("Peninsular Malaysia (West Malaysia)");
    expect(adminRegionLabel("SBH")).toBe("Sabah");
    expect(adminRegionLabel("SWK")).toBe("Sarawak");
    expect(adminRegionLabel("LBN")).toBe("Labuan");
  });
});

describe("legacy snapshots are re-worded for display only", () => {
  it.each([
    "Peninsular Standard Delivery",
    "Peninsular Malaysia Standard Delivery",
    "Peninsular Malaysia Delivery",
    "Standard Delivery - Peninsular Malaysia",
    "Standard Delivery — Peninsular Malaysia",
    "  peninsular standard delivery  ",
  ])("re-words %s", (stored) => {
    expect(normalizeDeliveryMethod(stored, "PEN")).toBe(
      "Standard Delivery — West Malaysia"
    );
  });

  it("re-words the other regions the same way", () => {
    expect(normalizeDeliveryMethod("Sabah Standard Delivery")).toBe(
      "Standard Delivery — Sabah"
    );
    expect(normalizeDeliveryMethod("Sarawak Standard Delivery")).toBe(
      "Standard Delivery — Sarawak"
    );
    expect(normalizeDeliveryMethod("Labuan Standard Delivery")).toBe(
      "Standard Delivery — Labuan"
    );
  });

  it("leaves an administrator's own wording exactly as entered", () => {
    for (const custom of [
      "Weekend Express (Klang Valley)",
      "Pickup from our Ampang counter",
      "Peninsular Bulk Contract Rate 2026",
    ]) {
      expect(normalizeDeliveryMethod(custom, "PEN")).toBe(custom);
    }
  });

  it("leaves an already canonical label unchanged", () => {
    const canonical = "Standard Delivery — West Malaysia";
    expect(normalizeDeliveryMethod(canonical, "PEN")).toBe(canonical);
  });

  it("falls back to the zone when nothing was stored", () => {
    expect(normalizeDeliveryMethod(null, "PEN")).toBe("Standard Delivery — West Malaysia");
    expect(normalizeDeliveryMethod("   ", "SBH")).toBe("Standard Delivery — Sabah");
  });
});

describe("zone codes", () => {
  it("resolves from a code, a region name, or a state code", () => {
    expect(resolveZoneCode("PEN")).toBe("PEN");
    expect(resolveZoneCode("West Malaysia")).toBe("PEN");
    expect(resolveZoneCode("Peninsular")).toBe("PEN");
    expect(resolveZoneCode("Sabah")).toBe("SBH");
    expect(resolveZoneCode("Somewhere else")).toBe("");
  });

  it("is a wording change only — codes are untouched", () => {
    for (const code of ["PEN", "SBH", "SWK", "LBN"]) {
      expect(resolveZoneCode(code)).toBe(code);
    }
  });
});

describe("plain-text contexts", () => {
  it("falls back to a hyphen where an en dash is unsafe", () => {
    expect(toPlainDeliveryLabel(customerDeliveryMethod("PEN"))).toBe(
      "Standard Delivery - West Malaysia"
    );
  });
});
