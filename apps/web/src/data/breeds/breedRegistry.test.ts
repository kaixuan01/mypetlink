import { describe, expect, it } from "vitest";
import {
  CUSTOM_BREED_OPTION,
  FALLBACK_BREEDS,
  getBreedsForSpecies,
  isKnownBreedForSpecies,
} from "@/data/breeds";
import { PET_TYPE_OPTIONS } from "@/lib/petDisplay";
import type { PetSpecies } from "@/types";

/**
 * Data-quality gates for the breed registry. These run over every species, so
 * a bad entry added later fails here rather than reaching an owner's picker.
 */

const speciesWithBreeds: PetSpecies[] = [
  "Dog",
  "Cat",
  "Rabbit",
  "Guinea Pig",
  "Hamster",
  "Bird",
  "Fish",
];

describe("breed registry data quality", () => {
  it.each(PET_TYPE_OPTIONS)("has no empty or padded values for %s", (species) => {
    for (const entry of getBreedsForSpecies(species)) {
      expect(entry.value, `${species}: empty breed value`).not.toBe("");
      expect(entry.value, `${species}: "${entry.value}" is padded`).toBe(
        entry.value.trim()
      );
      expect(
        entry.value.includes("  "),
        `${species}: "${entry.value}" has a double space`
      ).toBe(false);
      expect(entry.label ?? entry.value).toBe((entry.label ?? entry.value).trim());
    }
  });

  it.each(PET_TYPE_OPTIONS)("has no exact duplicate breeds for %s", (species) => {
    const values = getBreedsForSpecies(species).map((entry) => entry.value);
    expect(new Set(values).size, `${species}: ${values.join(", ")}`).toBe(
      values.length
    );
  });

  it.each(PET_TYPE_OPTIONS)(
    "has no case-insensitive duplicate breeds for %s",
    (species) => {
      const keys = getBreedsForSpecies(species).map((entry) =>
        entry.value.toLocaleLowerCase()
      );
      const duplicates = keys.filter(
        (key, index) => keys.indexOf(key) !== index
      );
      expect(duplicates, `${species}: ${duplicates.join(", ")}`).toEqual([]);
    }
  );

  it.each(PET_TYPE_OPTIONS)(
    "never repeats a shared fallback inside %s",
    (species) => {
      const keys = new Set(
        getBreedsForSpecies(species).map((entry) =>
          entry.value.toLocaleLowerCase()
        )
      );

      // Mixed breed, Unknown and Other are offered for every species by the
      // picker, so a species list repeating one would render twice.
      for (const fallback of [...FALLBACK_BREEDS, { value: CUSTOM_BREED_OPTION }]) {
        expect(
          keys.has(fallback.value.toLocaleLowerCase()),
          `${species} repeats the shared "${fallback.value}" option`
        ).toBe(false);
      }
    }
  );

  it.each(speciesWithBreeds)("keeps %s sorted for review", (species) => {
    const values = getBreedsForSpecies(species).map((entry) => entry.value);
    // Dog and Cat deliberately lead with the local owner term; everything
    // after it is alphabetical so additions land in an obvious place.
    const sortable = species === "Dog" || species === "Cat" ? values.slice(1) : values;
    const sorted = [...sortable].sort((left, right) => left.localeCompare(right));
    expect(sortable).toEqual(sorted);
  });

  it("gives every species that should have breeds a usable list", () => {
    const expectedMinimums: Record<string, number> = {
      Dog: 120,
      Cat: 55,
      Rabbit: 20,
      "Guinea Pig": 10,
      Hamster: 5,
      Bird: 15,
      Fish: 15,
    };

    for (const [species, minimum] of Object.entries(expectedMinimums)) {
      expect(
        getBreedsForSpecies(species as PetSpecies).length,
        species
      ).toBeGreaterThanOrEqual(minimum);
    }
  });

  it("leaves species without a reliable breed list empty rather than invented", () => {
    // Morph and variety names are not breeds; an empty list plus the shared
    // fallbacks is the honest answer for these.
    for (const species of [
      "Reptile",
      "Snake",
      "Lizard",
      "Turtle",
      "Tortoise",
      "Ferret",
      "Hedgehog",
      "Sugar Glider",
      "Chinchilla",
      "Rat",
      "Mouse",
      "Gerbil",
      "Horse",
      "Other",
    ] as PetSpecies[]) {
      expect(getBreedsForSpecies(species), species).toEqual([]);
    }
  });
});

describe("Malaysian owner terminology", () => {
  it("offers Kampung dog with an explanatory label and a stable stored value", () => {
    const entry = getBreedsForSpecies("Dog").find(
      (breed) => breed.value === "Kampung dog"
    );

    expect(entry).toBeDefined();
    expect(entry?.label).toBe("Kampung dog (Local mixed breed)");
    expect(entry?.keywords).toContain("anjing kampung");
  });

  it("offers Kucing kampung with an explanatory label and a stable stored value", () => {
    const entry = getBreedsForSpecies("Cat").find(
      (breed) => breed.value === "Kucing kampung"
    );

    expect(entry).toBeDefined();
    expect(entry?.label).toBe("Kucing kampung (Domestic mixed cat)");
  });

  it("keeps the local terms distinct from the shared Mixed breed fallback", () => {
    const fallbackKeys = FALLBACK_BREEDS.map((entry) =>
      entry.value.toLocaleLowerCase()
    );

    expect(fallbackKeys).toContain("mixed breed");
    expect(fallbackKeys).not.toContain("kampung dog");
    expect(fallbackKeys).not.toContain("kucing kampung");
  });
});

describe("canonical values are preserved", () => {
  it("keeps the existing Mixed breed casing rather than introducing a variant", () => {
    const mixed = FALLBACK_BREEDS.find(
      (entry) => entry.value.toLocaleLowerCase() === "mixed breed"
    );

    // Pets already store "Mixed breed". Shipping "Mixed Breed" would split the
    // same concept across two stored values with no migration to reconcile it.
    expect(mixed?.value).toBe("Mixed breed");
  });

  it.each([
    "Poodle",
    "Shih Tzu",
    "Golden Retriever",
    "Labrador Retriever",
    "Corgi",
    "Pomeranian",
    "German Shepherd",
    "Husky",
    "Chihuahua",
  ])("still offers the previously shipped dog breed %s", (breed) => {
    expect(getBreedsForSpecies("Dog").map((entry) => entry.value)).toContain(breed);
  });

  it.each([
    "Domestic Shorthair",
    "British Shorthair",
    "Persian",
    "Ragdoll",
    "Maine Coon",
    "Siamese",
    "Munchkin",
  ])("still offers the previously shipped cat breed %s", (breed) => {
    expect(getBreedsForSpecies("Cat").map((entry) => entry.value)).toContain(breed);
  });

  it("finds a formal name through keywords without storing it separately", () => {
    const husky = getBreedsForSpecies("Dog").find(
      (entry) => entry.value === "Husky"
    );

    expect(husky?.keywords).toContain("Siberian Husky");
    expect(getBreedsForSpecies("Dog").map((entry) => entry.value)).not.toContain(
      "Siberian Husky"
    );
  });
});

describe("isKnownBreedForSpecies", () => {
  it("recognises a listed breed for its own species", () => {
    expect(isKnownBreedForSpecies("Dog", "Golden Retriever")).toBe(true);
    expect(isKnownBreedForSpecies("Cat", "Ragdoll")).toBe(true);
  });

  it("does not recognise a breed belonging to a different species", () => {
    expect(isKnownBreedForSpecies("Cat", "Golden Retriever")).toBe(false);
    expect(isKnownBreedForSpecies("Dog", "Ragdoll")).toBe(false);
  });

  it("recognises the shared fallbacks for every species", () => {
    for (const species of PET_TYPE_OPTIONS) {
      expect(isKnownBreedForSpecies(species, "Mixed breed"), species).toBe(true);
      expect(isKnownBreedForSpecies(species, "Unknown"), species).toBe(true);
    }
  });

  it("ignores casing and surrounding space", () => {
    expect(isKnownBreedForSpecies("Dog", "  golden retriever  ")).toBe(true);
  });

  it("treats an empty breed as nothing to warn about", () => {
    expect(isKnownBreedForSpecies("Dog", "")).toBe(true);
    expect(isKnownBreedForSpecies("Dog", "   ")).toBe(true);
  });

  it("does not recognise an owner's own custom breed", () => {
    expect(isKnownBreedForSpecies("Dog", "Grandma's special mix")).toBe(false);
  });
});
