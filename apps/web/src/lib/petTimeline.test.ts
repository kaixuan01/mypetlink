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
