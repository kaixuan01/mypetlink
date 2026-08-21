// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockPets } from "@/data/mockPets";
import type { Pet } from "@/types";

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
});
