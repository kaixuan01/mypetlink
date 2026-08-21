import { describe, expect, it } from "vitest";
import {
  conservativePetVisibility,
  mergeConservativePetVisibility,
  newPetVisibilityDefaults,
} from "./petVisibility";

describe("conservative pet visibility", () => {
  it("fails closed when visibility is missing", () => {
    expect(Object.values(mergeConservativePetVisibility())).toEqual(
      Object.values(conservativePetVisibility)
    );
    expect(Object.values(mergeConservativePetVisibility()).every((value) => !value)).toBe(true);
  });

  it("honours only fields explicitly present in a partial response", () => {
    const visibility = mergeConservativePetVisibility({ showMoments: true });

    expect(visibility.showMoments).toBe(true);
    expect(visibility.showOwnerName).toBe(false);
    expect(visibility.showGeneralArea).toBe(false);
    expect(visibility.showPhone).toBe(false);
    expect(visibility.showWhatsapp).toBe(false);
    expect(visibility.showEmergencyNote).toBe(false);
  });
});

describe("new-pet visibility product defaults", () => {
  it("stays distinct from the all-false conservative fallback", () => {
    expect(
      Object.values(conservativePetVisibility).every((value) => !value)
    ).toBe(true);
    expect(newPetVisibilityDefaults).toEqual({
      showOwnerName: false,
      showGeneralArea: true,
      showPhone: false,
      showWhatsapp: true,
      showEmergencyNote: true,
      showCareBadges: true,
      showMoments: true,
      showTimeline: true,
      showBirthdayOnTimeline: false,
      showAdoptionDayOnTimeline: false,
      showHealthSummary: false,
      showAllergiesOnPublicProfile: false,
    });
    expect(newPetVisibilityDefaults).not.toEqual(conservativePetVisibility);
  });
});
