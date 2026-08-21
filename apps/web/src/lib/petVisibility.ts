import type { Pet } from "@/types";

/**
 * Product defaults for a newly created pet. These mirror the backend creation
 * defaults and are intentionally distinct from the fail-closed fallback below.
 */
export const newPetVisibilityDefaults: Readonly<Pet["visibility"]> =
  Object.freeze({
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

/**
 * Fail-closed baseline for incomplete or unexpectedly missing visibility data.
 * Saved API values are authoritative and are merged over this baseline.
 */
export const conservativePetVisibility: Readonly<Pet["visibility"]> =
  Object.freeze({
    showOwnerName: false,
    showGeneralArea: false,
    showPhone: false,
    showWhatsapp: false,
    showEmergencyNote: false,
    showCareBadges: false,
    showMoments: false,
    showTimeline: false,
    showBirthdayOnTimeline: false,
    showAdoptionDayOnTimeline: false,
    showHealthSummary: false,
    showAllergiesOnPublicProfile: false,
  });

export function mergeConservativePetVisibility(
  visibility?: Partial<Pet["visibility"]> | null
): Pet["visibility"] {
  return {
    ...conservativePetVisibility,
    ...visibility,
  };
}
