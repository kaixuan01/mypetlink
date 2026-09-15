// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MomentPetSelector } from "@/components/portal/MomentPetSelector";
import type { PetListItem } from "@/types";

function buildPet(id: string, name: string): PetListItem {
  return {
    id,
    slug: `${name.toLowerCase()}-abc12`,
    name,
    species: "Cat",
    customSpecies: "",
    breed: "British Shorthair",
    gender: "Female",
    ageLabel: "3 years",
    ageSource: "birthday",
    ageInformationMode: "birthday",
    estimatedBirthYear: undefined,
    birthday: "2023-01-01",
    adoptionDay: "",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    photoInitial: name[0],
    photoTone: "apricot",
    profilePhotoLabel: name,
    coverPhotoLabel: name,
    photoUrl: "",
    coverUrl: "",
    coverPositionX: 50,
    coverPositionY: 50,
    generalArea: "Bangsar",
    lifecycleStatus: "Active",
    memorial: { passedAwayDate: "", message: "", showOnPublicProfile: false },
    publicCode: "abc12",
    safetyCode: "s-abc12",
    qrSafetyEnabled: true,
    publicProfileEnabled: true,
    qrSafetyPath: "/q/s-abc12",
    publicProfilePath: `/p/${name.toLowerCase()}-abc12`,
    finderProfileUrl: "",
    qrStatus: "Active",
    lostModeEnabled: false,
    profileTheme: "default",
  } as unknown as PetListItem;
}

const mochi = buildPet("p1", "Mochi");
const coco = buildPet("p2", "Coco");
const lucky = buildPet("p3", "Lucky");

describe("MomentPetSelector", () => {
  afterEach(cleanup);

  it("is not offered to a single-pet owner", () => {
    // With no second pet there is no choice to make, so the control would be a
    // question with exactly one answer.
    const { container } = render(
      <MomentPetSelector
        onChange={vi.fn()}
        otherPets={[]}
        primaryPet={mochi}
        selectedPetIds={[]}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows the owner's other pets to a multi-pet owner", () => {
    render(
      <MomentPetSelector
        onChange={vi.fn()}
        otherPets={[coco, lucky]}
        primaryPet={mochi}
        selectedPetIds={[]}
      />
    );

    expect(screen.getByText(/who's in this moment/i)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /coco/i })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /lucky/i })).toBeTruthy();
  });

  it("shows the primary pet but gives it no checkbox to clear", () => {
    render(
      <MomentPetSelector
        onChange={vi.fn()}
        otherPets={[coco]}
        primaryPet={mochi}
        selectedPetIds={[]}
      />
    );

    // The Moment belongs to Mochi — it owns that pet's timeline placement and
    // plan allowance — so it must not be removable from a checkbox list.
    expect(screen.getByTestId("moment-subject-primary")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /mochi/i })).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("adds a pet when it is selected", () => {
    const onChange = vi.fn();
    render(
      <MomentPetSelector
        onChange={onChange}
        otherPets={[coco, lucky]}
        primaryPet={mochi}
        selectedPetIds={[]}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /coco/i }));

    expect(onChange).toHaveBeenCalledWith(["p2"]);
  });

  it("removes a pet when it is deselected", () => {
    const onChange = vi.fn();
    render(
      <MomentPetSelector
        onChange={onChange}
        otherPets={[coco, lucky]}
        primaryPet={mochi}
        selectedPetIds={["p2", "p3"]}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /coco/i }));

    expect(onChange).toHaveBeenCalledWith(["p3"]);
  });

  it("reflects the already-selected pets when editing", () => {
    render(
      <MomentPetSelector
        onChange={vi.fn()}
        otherPets={[coco, lucky]}
        primaryPet={mochi}
        selectedPetIds={["p3"]}
      />
    );

    expect(
      (screen.getByRole("checkbox", { name: /lucky/i }) as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: /coco/i }) as HTMLInputElement).checked
    ).toBe(false);
  });

  it("disables every choice while the form is submitting", () => {
    render(
      <MomentPetSelector
        disabled
        onChange={vi.fn()}
        otherPets={[coco, lucky]}
        primaryPet={mochi}
        selectedPetIds={[]}
      />
    );

    for (const box of screen.getAllByRole("checkbox")) {
      expect((box as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("explains that a multi-pet Moment is still one Moment", () => {
    render(
      <MomentPetSelector
        onChange={vi.fn()}
        otherPets={[coco]}
        primaryPet={mochi}
        selectedPetIds={[]}
      />
    );

    expect(screen.getByText(/still counts as one moment/i)).toBeTruthy();
  });
});
