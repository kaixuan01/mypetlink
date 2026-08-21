// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet, PetMoment } from "@/types";

const mocks = vi.hoisted(() => ({
  getPetById: vi.fn(),
  getPetMoments: vi.fn(),
}));

vi.mock("@/services/petService", () => ({
  getPetById: (...args: unknown[]) => mocks.getPetById(...args),
}));

vi.mock("@/services/momentService", () => ({
  getPetMoments: (...args: unknown[]) => mocks.getPetMoments(...args),
  getFriendlyMomentErrorMessage: () => "Please try again.",
}));

const { PetTimeline } = await import("./PetTimeline");

describe("PetTimeline owner guidance", () => {
  let pet: Pet;

  beforeEach(() => {
    pet = {
      ...structuredClone(mockPets[0]),
      birthday: "",
      estimatedBirthYear: undefined,
      adoptionDay: "15 Sept 2021",
    };
    mocks.getPetById.mockResolvedValue({ data: pet });
    mocks.getPetMoments.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("directs Adoption Day and First Day Home milestones to Moments", async () => {
    render(<PetTimeline initialMoments={[]} pet={pet} />);

    expect(
      await screen.findByText(
        /Add a birthday in Pet Details, or record Adoption Day, First Day Home, and other milestones as Moments/
      )
    ).toBeTruthy();
    expect(
      screen.queryByText(/Add a birthday or adoption day in Edit Pet Details/i)
    ).toBeNull();
  });

  it("presents Public as Shared and Private or legacy FamilyOnly as Only me", async () => {
    const moments: PetMoment[] = [
      timelineMoment("public", "Public"),
      timelineMoment("private", "Private"),
      timelineMoment("legacy-family", "Family Only"),
    ];
    mocks.getPetMoments.mockResolvedValue({ data: moments });

    render(<PetTimeline initialMoments={moments} pet={pet} />);

    expect(await screen.findByText("public")).toBeTruthy();
    expect(screen.getAllByText("Shared")).toHaveLength(1);
    expect(screen.getAllByText("Only me")).toHaveLength(2);
    expect(screen.queryByText("Family Only")).toBeNull();
  });
});

function timelineMoment(
  title: string,
  visibility: PetMoment["visibility"]
): PetMoment {
  return {
    id: title,
    petId: mockPets[0].id,
    title,
    date: "21 Aug 2026",
    type: title === "public" ? "First Day Home" : "Memory",
    caption: "",
    media: [],
    visibility,
    showOnPublicProfile: visibility !== "Private",
    showInLifeTimeline: true,
  };
}
