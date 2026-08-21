// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { defaultOwnerSettings } from "@/lib/ownerSettings";
import { newPetVisibilityDefaults } from "@/lib/petVisibility";
import { buildBackendPetPayload } from "@/services/petService";
import { buildPayload, toFormState } from "./PetProfileForm";

describe("PetProfileForm date round trips", () => {
  it("preserves September birthday and Adoption Day through edit and save", () => {
    const form = toFormState(
      {
        ...structuredClone(mockPets[0]),
        birthday: "02 Sept 2020",
        adoptionDay: "15 Sept 2021",
        visibility: {
          ...structuredClone(mockPets[0].visibility),
          showAdoptionDayOnTimeline: true,
        },
      },
      defaultOwnerSettings
    );

    expect(form.birthdayDate).toBe("2020-09-02");
    expect(form.adoptionDate).toBe("2021-09-15");

    const request = buildBackendPetPayload(buildPayload(form), {
      completeProfile: true,
    });
    expect(request.birthday).toBe("2020-09-02");
    expect(request.adoptionDay).toBe("2021-09-15");
    expect(request.visibility?.showAdoptionDayOnTimeline).toBe(false);
    expect(request.completeProfile).toBe(true);
  });

  it("keeps a normal three-letter month unchanged", () => {
    const form = toFormState(
      {
        ...structuredClone(mockPets[0]),
        birthday: "12 Oct 2023",
        adoptionDay: "03 Feb 2024",
      },
      defaultOwnerSettings
    );
    const request = buildBackendPetPayload(buildPayload(form));

    expect(request.birthday).toBe("2023-10-12");
    expect(request.adoptionDay).toBe("2024-02-03");
    expect(request.completeProfile).toBe(false);
  });
});

describe("PetProfileForm create visibility", () => {
  it("uses product defaults internally and omits visibility from the create payload", () => {
    const form = toFormState(undefined, defaultOwnerSettings);

    expect({
      showOwnerName: form.showOwnerName,
      showGeneralArea: form.showGeneralArea,
      showPhone: form.showPhone,
      showWhatsapp: form.showWhatsapp,
      showEmergencyNote: form.showEmergencyNote,
      showCareBadges: form.showCareBadges,
      showMoments: form.showMoments,
      showTimeline: form.showTimeline,
      showBirthdayOnTimeline: form.showBirthdayOnTimeline,
      showAdoptionDayOnTimeline: form.showAdoptionDayOnTimeline,
      showHealthSummary: form.showHealthSummary,
      showAllergiesOnPublicProfile: form.showAllergiesOnPublicProfile,
    }).toEqual(newPetVisibilityDefaults);
    expect(
      buildPayload(form, { includeVisibility: false })
    ).not.toHaveProperty("visibility");
  });
});
