// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import type { BackendPetDetail } from "@/services/apiDtos";
import { mapBackendPetToFrontend } from "@/services/petService";

afterEach(() => window.localStorage.clear());

describe("owner pet social version mapping", () => {
  it("keeps the API-derived version for owner share actions", () => {
    const backendPet: BackendPetDetail = {
      id: "pet-1",
      name: "Nori",
      species: "Cat",
      profileTheme: "default",
      lifecycleStatus: "Active",
      lostModeEnabled: false,
      showMemorialOnPublicProfile: true,
      publicCode: "futurepet1234",
      publicSlug: "nori-futurepet1234",
      publicProfileVersion: "0123456789abcdef",
      safetyCode: "safety1234",
      publicProfilePath: "/p/nori-futurepet1234",
      qrSafetyPath: "/q/safety1234",
      contact: { useOwnerDefaults: true },
      visibility: {
        showOwnerName: true,
        showGeneralArea: true,
        showPhone: true,
        showWhatsapp: true,
        showEmergencyNote: true,
        showCareBadges: true,
        showMoments: true,
        showTimeline: true,
        showBirthdayOnTimeline: true,
        showAdoptionDayOnTimeline: true,
        showHealthSummary: false,
      },
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    };

    const pet = mapBackendPetToFrontend(backendPet);

    expect(pet.publicProfileVersion).toBe("0123456789abcdef");
  });
});
