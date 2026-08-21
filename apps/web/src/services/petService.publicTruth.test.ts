import { describe, expect, it } from "vitest";
import type {
  BackendPublicPetProfile,
  BackendPublicSafetyPage,
} from "@/services/apiDtos";
import {
  mapBackendPublicProfile,
  mapBackendSafetyPage,
} from "@/services/petService";

function publicProfile(
  overrides: Partial<BackendPublicPetProfile> = {}
): BackendPublicPetProfile {
  return {
    publicCode: "public-code",
    publicSlug: "milo-public-code",
    name: "Milo",
    species: "Dog",
    birthday: "2021-09-15",
    profileTheme: "default",
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    memories: [],
    careRecords: [],
    ...overrides,
  };
}

function safetyPage(
  overrides: Partial<BackendPublicSafetyPage> = {}
): BackendPublicSafetyPage {
  return {
    safetyCode: "safety-code",
    state: "Active",
    name: "Milo",
    species: "Dog",
    profileTheme: "default",
    lifecycleStatus: "Active",
    lostModeEnabled: false,
    showFoundLocationAction: false,
    ...overrides,
  };
}

describe("public profile truth mapping", () => {
  it("fails closed when timeline visibility flags are missing", () => {
    const mapped = mapBackendPublicProfile(
      publicProfile({
        adoptionDay: "2022-09-16",
        memories: [
          {
            title: "First day home",
            momentDate: "2022-09-16",
            type: "Adoption Day",
            showOnPublicProfile: true,
            showInLifeTimeline: true,
            media: [],
          },
        ],
      })
    );

    expect(mapped.birthday).toBe("15 Sept 2021");
    expect(mapped.visibility.showMoments).toBe(false);
    expect(mapped.visibility.showTimeline).toBe(false);
    expect(mapped.visibility.showBirthdayOnTimeline).toBe(false);
    expect(mapped.visibility.showAdoptionDayOnTimeline).toBe(false);
  });

  it("uses the explicit timeline visibility flags from the API", () => {
    const birthdayHidden = mapBackendPublicProfile(
      publicProfile({
        showTimeline: true,
        showBirthdayOnTimeline: false,
      })
    );
    const birthdayShown = mapBackendPublicProfile(
      publicProfile({
        showTimeline: true,
        showBirthdayOnTimeline: true,
      })
    );

    expect(birthdayHidden.visibility.showTimeline).toBe(true);
    expect(birthdayHidden.visibility.showBirthdayOnTimeline).toBe(false);
    expect(birthdayShown.visibility.showBirthdayOnTimeline).toBe(true);
  });

  it("uses the explicit gallery switch instead of Moment compatibility flags", () => {
    const compatibilityTrueButGalleryOff = mapBackendPublicProfile(
      publicProfile({
        showMoments: false,
        memories: [
          {
            title: "Timeline-only public Moment",
            visibility: "Public",
            showOnPublicProfile: true,
            showInLifeTimeline: true,
            media: [],
          },
        ],
      })
    );
    const compatibilityFalseButGalleryOn = mapBackendPublicProfile(
      publicProfile({
        showMoments: true,
        memories: [
          {
            title: "Gallery public Moment",
            visibility: "Public",
            showOnPublicProfile: false,
            showInLifeTimeline: false,
            media: [],
          },
        ],
      })
    );

    expect(compatibilityTrueButGalleryOff.visibility.showMoments).toBe(false);
    expect(compatibilityFalseButGalleryOn.visibility.showMoments).toBe(true);
  });

  it("keeps missing public values empty instead of inventing profile content", () => {
    const mapped = mapBackendPublicProfile(
      publicProfile({
        breed: "Not set",
        gender: null,
        color: "Not set",
        bio: null,
        generalArea: null,
        ownerDisplayName: null,
        lifecycleStatus: "Memorial",
        memorialMessage: null,
      })
    );

    expect(mapped).toMatchObject({
      breed: "",
      gender: "",
      color: "",
      bio: "",
      generalArea: "",
      owner: { name: "" },
      memorial: { memorialMessage: "" },
    });
    expect(JSON.stringify(mapped)).not.toContain("Not set");
    expect(JSON.stringify(mapped)).not.toContain("safe MyPetLink profile ready");
    expect(JSON.stringify(mapped)).not.toContain("Milo's owner");
  });

  it("preserves real public biography, location, owner name, and tribute", () => {
    const mapped = mapBackendPublicProfile(
      publicProfile({
        bio: "Loves morning walks.",
        generalArea: "Petaling Jaya",
        ownerDisplayName: "Aina",
        lifecycleStatus: "Memorial",
        memorialMessage: "Forever in our hearts.",
      })
    );

    expect(mapped.bio).toBe("Loves morning walks.");
    expect(mapped.generalArea).toBe("Petaling Jaya");
    expect(mapped.owner.name).toBe("Aina");
    expect(mapped.memorial.memorialMessage).toBe("Forever in our hearts.");
  });

  it("normalizes missing Safety Profile values without fabricating a tribute", () => {
    const mapped = mapBackendSafetyPage(
      safetyPage({
        lifecycleStatus: "Memorial",
        generalArea: "Not set",
        safetyNote: "Not set",
        emergencyNote: null,
        contact: { ownerDisplayName: null },
      })
    );

    expect(mapped).toMatchObject({
      breed: "",
      gender: "",
      color: "",
      adoptionDay: "",
      generalArea: "",
      safetyNote: "",
      emergencyNote: "",
      owner: { name: "" },
      memorial: { memorialMessage: "" },
    });
    expect(JSON.stringify(mapped)).not.toContain("Not set");
    expect(JSON.stringify(mapped)).not.toContain("lovingly remembered");
    expect(JSON.stringify(mapped)).not.toContain("Milo's owner");
  });
});
