import { describe, expect, it } from "vitest";
import {
  getPetSafetySummaryLabel,
  getPetSummaryLabel,
  getPetTypeGroupLabel,
  getPetTypeLabel,
  PET_TYPE_GROUPS,
  PET_TYPE_OPTIONS,
} from "@/lib/petDisplay";
import type { PetSpecies } from "@/types";

/**
 * How pet type and breed reach the surfaces a visitor sees: the Public Share
 * Profile summary and the finder-facing Safety Profile.
 */

const basePet = {
  birthday: "",
  estimatedBirthYear: undefined,
};

describe("pet type list", () => {
  it("keeps every previously supported pet type", () => {
    for (const species of [
      "Dog",
      "Cat",
      "Rabbit",
      "Bird",
      "Hamster",
      "Guinea Pig",
      "Fish",
      "Turtle",
      "Tortoise",
      "Reptile",
      "Snake",
      "Lizard",
      "Ferret",
      "Hedgehog",
      "Sugar Glider",
      "Chinchilla",
      "Horse",
      "Other",
    ] as PetSpecies[]) {
      expect(PET_TYPE_OPTIONS, species).toContain(species);
    }
  });

  it("adds the three new small rodents", () => {
    expect(PET_TYPE_OPTIONS).toContain("Rat");
    expect(PET_TYPE_OPTIONS).toContain("Mouse");
    expect(PET_TYPE_OPTIONS).toContain("Gerbil");
  });

  it("lists every pet type exactly once", () => {
    expect(new Set(PET_TYPE_OPTIONS).size).toBe(PET_TYPE_OPTIONS.length);
  });

  it("places every pet type in exactly one group", () => {
    for (const species of PET_TYPE_OPTIONS) {
      const groups = PET_TYPE_GROUPS.filter((group) =>
        group.species.includes(species)
      );
      expect(groups.length, species).toBe(1);
    }
  });

  it("keeps the reptile values selectable while grouping them together", () => {
    // The overlap between Reptile and its members is known taxonomy debt; the
    // values stay put so no stored pet is affected.
    const reptiles = PET_TYPE_GROUPS.find((group) => group.label === "Reptiles");

    expect(reptiles?.species).toEqual([
      "Turtle",
      "Tortoise",
      "Snake",
      "Lizard",
      "Reptile",
    ]);
  });

  it("reports the group a pet type belongs to", () => {
    expect(getPetTypeGroupLabel("Dog")).toBe("Dogs & Cats");
    expect(getPetTypeGroupLabel("Gerbil")).toBe("Small Pets");
    expect(getPetTypeGroupLabel("Lizard")).toBe("Reptiles");
    expect(getPetTypeGroupLabel("Other")).toBe("Other");
  });
});

describe("public display of pet type and breed", () => {
  it("shows the local Malaysian dog term on the public summary", () => {
    expect(
      getPetSummaryLabel({
        ...basePet,
        species: "Dog",
        breed: "Kampung dog",
      })
    ).toBe("Dog - Kampung dog - Age unknown");
  });

  it("shows the local Malaysian cat term on the Safety Profile summary", () => {
    expect(
      getPetSafetySummaryLabel({
        ...basePet,
        species: "Cat",
        breed: "Kucing kampung",
      })
    ).toBe("Cat - Kucing kampung - Age unknown");
  });

  it("shows a newly supported pet type", () => {
    expect(
      getPetSummaryLabel({ ...basePet, species: "Gerbil", breed: "" })
    ).toBe("Gerbil - Age unknown");
  });

  it("still shows an owner's custom pet type instead of Other", () => {
    expect(
      getPetTypeLabel({ species: "Other", customSpecies: "Axolotl" })
    ).toBe("Axolotl");
  });

  it("shows a legacy pet type stored before the list existed", () => {
    // Older records may hold anything; the public pages must still render.
    expect(
      getPetSummaryLabel({
        ...basePet,
        species: "Dinosaur" as PetSpecies,
        breed: "Velociraptor",
      })
    ).toBe("Dinosaur - Velociraptor - Age unknown");
  });

  it("shows an owner's own custom breed unchanged", () => {
    expect(
      getPetSummaryLabel({
        ...basePet,
        species: "Dog",
        breed: "Grandma's special mix",
      })
    ).toBe("Dog - Grandma's special mix - Age unknown");
  });

  it("omits a breed that was never filled in", () => {
    expect(getPetSummaryLabel({ ...basePet, species: "Cat", breed: "" })).toBe(
      "Cat - Age unknown"
    );
  });
});
