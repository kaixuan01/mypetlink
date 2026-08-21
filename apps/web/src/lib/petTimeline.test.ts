import { describe, expect, it } from "vitest";
import { mockPets } from "@/data/mockPets";
import { buildPetTimeline, getPublicTimeline } from "@/lib/petTimeline";
import type { PetMoment } from "@/types";

const adoptionMoment: PetMoment = {
  id: "moment-adoption",
  petId: mockPets[0].id,
  title: "The day Milo joined our family",
  date: mockPets[0].adoptionDay,
  type: "Adoption Day",
  caption: "Home at last.",
  media: [],
  visibility: "Public",
  showOnPublicProfile: true,
  showInLifeTimeline: true,
};

describe("petTimeline Adoption Day ownership", () => {
  it("does not generate an automatic event from the legacy pet field", () => {
    const timeline = buildPetTimeline(mockPets[0], []);

    expect(timeline.some((item) => item.id === "auto-adoption")).toBe(false);
    expect(timeline.some((item) => item.group === "adoption")).toBe(false);
  });

  it("shows an owner-created Adoption Day Moment once", () => {
    const timeline = buildPetTimeline(mockPets[0], [adoptionMoment]);
    const adoptionItems = timeline.filter((item) => item.group === "adoption");

    expect(adoptionItems).toHaveLength(1);
    expect(adoptionItems[0]).toMatchObject({
      id: `moment-${adoptionMoment.id}`,
      source: "moment",
      title: adoptionMoment.title,
    });
  });

  it("keeps First Day Home in the adoption Moment group", () => {
    const firstDayHome: PetMoment = {
      ...adoptionMoment,
      id: "moment-first-day-home",
      title: "First day home",
      type: "First Day Home",
    };

    expect(buildPetTimeline(mockPets[0], [firstDayHome])).toContainEqual(
      expect.objectContaining({
        id: `moment-${firstDayHome.id}`,
        group: "adoption",
        source: "moment",
      })
    );
  });

  it("only exposes Adoption Day publicly through a public timeline Moment", () => {
    const privateMoment = {
      ...adoptionMoment,
      id: "moment-private-adoption",
      visibility: "Private" as const,
    };

    expect(
      getPublicTimeline(mockPets[0], []).some(
        (item) => item.group === "adoption"
      )
    ).toBe(false);
    expect(
      getPublicTimeline(mockPets[0], [privateMoment]).some(
        (item) => item.group === "adoption"
      )
    ).toBe(false);
    expect(
      getPublicTimeline(mockPets[0], [adoptionMoment]).filter(
        (item) => item.group === "adoption"
      )
    ).toHaveLength(1);
  });
});

describe("public Moment timeline eligibility", () => {
  const publicTimelineMoment: PetMoment = {
    ...adoptionMoment,
    id: "public-timeline",
    type: "Memory",
    title: "Public timeline Moment",
    showOnPublicProfile: false,
  };

  it("uses Public visibility and Timeline placement without the gallery flag", () => {
    const moments: PetMoment[] = [
      publicTimelineMoment,
      {
        ...publicTimelineMoment,
        id: "public-timeline-off",
        title: "Public timeline off",
        showInLifeTimeline: false,
      },
      {
        ...publicTimelineMoment,
        id: "private-timeline",
        title: "Private timeline",
        visibility: "Private",
        showOnPublicProfile: true,
      },
      {
        ...publicTimelineMoment,
        id: "family-timeline",
        title: "Family timeline",
        visibility: "Family Only",
        showOnPublicProfile: true,
      },
    ];
    const timelinePet = {
      ...mockPets[0],
      birthday: "",
      estimatedBirthYear: undefined,
      visibility: {
        ...mockPets[0].visibility,
        showMoments: false,
        showTimeline: true,
        showBirthdayOnTimeline: false,
      },
    };

    expect(getPublicTimeline(timelinePet, moments).map((item) => item.title)).toEqual([
      "Public timeline Moment",
    ]);
    expect(
      getPublicTimeline(
        {
          ...timelinePet,
          visibility: { ...timelinePet.visibility, showTimeline: false },
        },
        moments
      )
    ).toEqual([]);
  });
});
