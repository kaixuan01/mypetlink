import { describe, expect, it } from "vitest";
import {
  publicCommerceAvailability,
  resolvePublicCommerceAvailability,
  type PublicRetailPartner,
} from "@/lib/publicCommerceAvailability";

const partner: PublicRetailPartner = {
  name: "Approved Pet Shop",
  state: "Selangor",
  area: "Petaling Jaya",
  authorised: true,
};

describe("public commerce availability", () => {
  it("hides Where to Buy when no supported purchase channel exists", () => {
    expect(publicCommerceAvailability.onlineOrderingAvailable).toBe(false);
    expect(publicCommerceAvailability.publicRetailPartners).toEqual([]);
    expect(publicCommerceAvailability.hasPublicRetailPartners).toBe(false);
    expect(publicCommerceAvailability.showWhereToBuy).toBe(false);
  });

  it("shows Where to Buy when online ordering is available", () => {
    expect(
      resolvePublicCommerceAvailability({
        onlineOrderingAvailable: true,
        publicRetailPartners: [],
      }).showWhereToBuy
    ).toBe(true);
  });

  it("shows Where to Buy when a real public partner collection is non-empty", () => {
    const availability = resolvePublicCommerceAvailability({
      onlineOrderingAvailable: false,
      publicRetailPartners: [partner],
    });

    expect(availability.hasPublicRetailPartners).toBe(true);
    expect(availability.showWhereToBuy).toBe(true);
  });
});
