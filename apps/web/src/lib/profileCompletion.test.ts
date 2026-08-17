import { describe, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";
import {
  deriveProfileCompletion,
  type ProfileCompletionItemId,
} from "./profileCompletion";

function minimalPet(overrides: Partial<Pet> = {}): Pet {
  return {
    ...structuredClone(mockPets[0]),
    photoUrl: "",
    breed: "Not set",
    gender: "",
    birthday: "Not set",
    estimatedBirthYear: undefined,
    personalityTags: [],
    bio: "",
    hasUsableSafetyContact: false,
    ...overrides,
  };
}

function derive(pet: Pet, overrides = {}) {
  return deriveProfileCompletion({
    pet,
    momentCount: 0,
    careRecordCount: 0,
    safetyProfilesEnabled: true,
    ...overrides,
  });
}

describe("deriveProfileCompletion", () => {
  it("returns all eight canonical items and 0% for a minimal profile", () => {
    const result = derive(minimalPet());
    expect(result.items.map(({ id, weight }) => [id, weight])).toEqual([
      ["photo", 3],
      ["basics", 2],
      ["personality", 2],
      ["birthday", 2],
      ["moment", 3],
      ["contact", 3],
      ["bio", 1],
      ["care_record", 1],
    ]);
    expect(result.percentage).toBe(0);
    expect(result.applicableWeight).toBe(17);
  });

  it.each<{
    id: ProfileCompletionItemId;
    pet?: Partial<Pet>;
    counts?: { momentCount?: number; careRecordCount?: number };
  }>([
    { id: "photo", pet: { photoUrl: "photo.jpg" } },
    { id: "basics", pet: { breed: "Mixed breed", gender: "Male" } },
    { id: "personality", pet: { personalityTags: ["Playful"] } },
    { id: "birthday", pet: { birthday: "12 Oct 2023" } },
    { id: "birthday", pet: { estimatedBirthYear: 2021 } },
    { id: "moment", counts: { momentCount: 1 } },
    { id: "contact", pet: { hasUsableSafetyContact: true } },
    { id: "bio", pet: { bio: "Gentle and curious." } },
    { id: "care_record", counts: { careRecordCount: 1 } },
  ])("marks $id complete independently", ({ id, pet, counts }) => {
    const result = derive(minimalPet(pet), counts);
    expect(result.items.find((item) => item.id === id)?.isComplete).toBe(true);
  });

  it("calculates the weighted percentage from the rendered items", () => {
    const result = derive(
      minimalPet({ photoUrl: "photo.jpg", breed: "Poodle", gender: "Female" })
    );
    expect(result.completedWeight).toBe(5);
    expect(result.percentage).toBe(Math.round((5 / 17) * 100));
  });

  it("returns 100% when every item is complete", () => {
    const result = derive(
      minimalPet({
        photoUrl: "photo.jpg",
        breed: "Poodle",
        gender: "Female",
        personalityTags: ["Playful"],
        birthday: "2023-10-12",
        hasUsableSafetyContact: true,
        bio: "Gentle and curious.",
      }),
      { momentCount: 1, careRecordCount: 1 }
    );
    expect(result.isComplete).toBe(true);
    expect(result.percentage).toBe(100);
  });

  it("derives share readiness from photo, basics, and a Moment", () => {
    const result = derive(
      minimalPet({ photoUrl: "photo.jpg", breed: "Poodle", gender: "Female" }),
      { momentCount: 1 }
    );
    expect(result.isReadyToShare).toBe(true);
    expect(result.isComplete).toBe(false);
  });

  it("uses the existing local safety-contact fallback without exposing values", () => {
    const pet = minimalPet({
      hasUsableSafetyContact: undefined,
      contactOverride: undefined,
      owner: {
        name: "Owner",
        phone: "+60123456789",
        whatsapp: "",
        emergencyContact: "",
      },
      visibility: {
        ...minimalPet().visibility,
        showPhone: true,
        showWhatsapp: false,
      },
    });
    expect(
      derive(pet).items.find((item) => item.id === "contact")?.isComplete
    ).toBe(true);
  });

  it("excludes disabled or unavailable items from both weights", () => {
    const result = deriveProfileCompletion({
      pet: minimalPet(),
      safetyProfilesEnabled: false,
      momentCount: undefined,
      careRecordCount: undefined,
    });
    expect(result.items.map((item) => item.id)).not.toContain("contact");
    expect(result.items.map((item) => item.id)).not.toContain("moment");
    expect(result.items.map((item) => item.id)).not.toContain("care_record");
    expect(result.applicableWeight).toBe(10);
  });

  it.each(["Memorial", "Archived"] as const)(
    "suppresses a %s pet",
    (lifecycleStatus) => {
      const result = derive(minimalPet({ lifecycleStatus }));
      expect(result.items).toEqual([]);
      expect(result.isComplete).toBe(false);
    }
  );

  it("handles null-like and malformed values safely and deterministically", () => {
    const pet = minimalPet({
      photoUrl: "   ",
      breed: "Not set",
      gender: "Not set",
      birthday: "not-a-date",
      personalityTags: undefined as never,
      bio: undefined as never,
    });
    const first = derive(pet, { momentCount: Number.NaN, careRecordCount: -10 });
    const second = derive(pet, { momentCount: Number.NaN, careRecordCount: -10 });
    expect(first).toEqual(second);
    expect(first.percentage).toBeGreaterThanOrEqual(0);
    expect(first.percentage).toBeLessThanOrEqual(100);
  });
});
