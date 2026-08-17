// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { derivePetOccasions } from "@/lib/petOccasions";
import { deriveProfileCompletion } from "@/lib/profileCompletion";
import type { BackendPetDetail, BackendPetListItem } from "@/services/apiDtos";
import { mapBackendPetToFrontend } from "@/services/petService";

const commonPet = {
  id: "pet-1",
  name: "Milo",
  species: "Dog",
  birthday: "2021-08-17",
  estimatedBirthYear: null,
  age: { source: "ExactBirthday" as const, ageInYears: 5, displayLabel: "5 years old" },
  publicSlug: "milo-p123",
  publicCode: "p123",
  publicProfileVersion: "v1",
  safetyCode: "safe-milo",
  lifecycleStatus: "Active" as const,
  lostModeEnabled: false,
  publicProfilePath: "/p/milo-p123",
  qrSafetyPath: "/q/safe-milo",
  profileMediaId: null,
  coverMediaId: null,
  profilePhotoUrl: "https://media.mypetlink.test/milo.jpg",
  coverPhotoUrl: null,
  coverPositionX: 50,
  coverPositionY: 50,
  personalityTags: ["Friendly"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-08-17T00:00:00Z",
  qrSafetyEnabled: true,
  publicProfileEnabled: true,
  hasUsableSafetyContact: true,
};

function listPet(overrides: Partial<BackendPetListItem> = {}): BackendPetListItem {
  return {
    ...commonPet,
    breed: "Golden Retriever",
    gender: "Male",
    adoptionDay: "2022-08-17",
    bio: "Gentle, loyal, and always ready for a walk.",
    ...overrides,
  };
}

function detailPet(overrides: Partial<BackendPetDetail> = {}): BackendPetDetail {
  return {
    ...commonPet,
    profileTheme: "default",
    showMemorialOnPublicProfile: true,
    contact: { useOwnerDefaults: true },
    visibility: {
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
    },
    breed: "Golden Retriever",
    gender: "Male",
    adoptionDay: "2022-08-17",
    bio: "Gentle, loyal, and always ready for a walk.",
    ...overrides,
  };
}

function completion(input: BackendPetListItem | BackendPetDetail) {
  return deriveProfileCompletion({
    pet: mapBackendPetToFrontend(input),
    momentCount: 1,
    careRecordCount: 1,
    safetyProfilesEnabled: true,
    publicProfilesEnabled: true,
  });
}

afterEach(() => window.localStorage.clear());

describe("authenticated pet profile data mapping", () => {
  it("keeps list and detail completion equivalent for a representative pet", () => {
    const fromList = completion(listPet());
    const fromDetail = completion(detailPet());

    expect(fromList.percentage).toBe(100);
    expect(fromList).toEqual(fromDetail);
  });

  it("keeps breed and gender truthful and equivalent in list and detail data", () => {
    const fromList = mapBackendPetToFrontend(listPet());
    const fromDetail = mapBackendPetToFrontend(detailPet());

    expect([fromList.breed, fromList.gender]).toEqual([fromDetail.breed, fromDetail.gender]);
    expect(completion(listPet()).items.find((item) => item.id === "basics")?.isComplete).toBe(true);
  });

  it("does not let a display sentence fabricate a completed bio", () => {
    const pet = mapBackendPetToFrontend(listPet({ bio: null }));

    expect(pet.bio).toBe("");
    expect(completion(listPet({ bio: null })).items.find((item) => item.id === "bio")?.isComplete).toBe(false);
  });

  it("counts a real owner-written bio", () => {
    expect(completion(listPet()).items.find((item) => item.id === "bio")?.isComplete).toBe(true);
  });

  it("maps an adoption anniversary into the shared occasion calculator", () => {
    const pet = mapBackendPetToFrontend(listPet({ birthday: null }));

    expect(derivePetOccasions(pet, new Date("2026-08-16T16:00:00Z"))).toEqual([
      { variant: "adoption", count: 4, label: "Adoption Day" },
    ]);
  });
});
