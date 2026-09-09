import { calculatePetAge } from "@/lib/petAge";
import type { Pet, PetSpecies, PublicPetProfile } from "@/types";

type PetLike = Pick<
  Pet | PublicPetProfile,
  "species" | "breed" | "birthday" | "estimatedBirthYear"
> & {
  customSpecies?: string;
};

/**
 * Pet types grouped for the picker.
 *
 * The groups exist purely so a long list is easier to scan and search — every
 * value below is stored exactly as written and none has ever been renamed.
 *
 * TAXONOMY DEBT: "Reptile" is a category that also contains Snake, Lizard,
 * Turtle and Tortoise, all of which are separately selectable. A bearded
 * dragon owner can reasonably pick either "Lizard" or "Reptile". Resolving
 * that means renaming or merging values pets already store, so it is out of
 * scope here and grouping is used instead. A future dedicated change should
 * decide the target shape and migrate the stored values with a guarded
 * migration and a read-only diagnostic first.
 */
export const PET_TYPE_GROUPS: readonly {
  label: string;
  species: readonly PetSpecies[];
}[] = [
  { label: "Dogs & Cats", species: ["Dog", "Cat"] },
  {
    label: "Small Pets",
    species: [
      "Rabbit",
      "Guinea Pig",
      "Hamster",
      "Rat",
      "Mouse",
      "Gerbil",
      "Chinchilla",
      "Ferret",
      "Hedgehog",
      "Sugar Glider",
    ],
  },
  { label: "Birds & Fish", species: ["Bird", "Fish"] },
  {
    label: "Reptiles",
    species: ["Turtle", "Tortoise", "Snake", "Lizard", "Reptile"],
  },
  { label: "Other", species: ["Horse", "Other"] },
];

/**
 * Flat list in group order. Every consumer that just needs "all pet types"
 * reads this, so the grouping stays a presentation concern.
 */
export const PET_TYPE_OPTIONS: PetSpecies[] = PET_TYPE_GROUPS.flatMap(
  (group) => [...group.species]
);

/** The group a pet type belongs to, used as a search keyword in the picker. */
export function getPetTypeGroupLabel(species: PetSpecies): string {
  return (
    PET_TYPE_GROUPS.find((group) => group.species.includes(species))?.label ??
    "Other"
  );
}

export function getPetTypeLabel(pet: Pick<PetLike, "species" | "customSpecies">) {
  const customType = pet.customSpecies?.trim();
  return pet.species === "Other" && customType ? customType : pet.species;
}

export function getPetAgeLabel(
  pet: Pick<PetLike, "birthday" | "estimatedBirthYear">,
  referenceDate?: Date
) {
  return calculatePetAge(pet, referenceDate).displayLabel;
}

export function getPetSummaryLabel(pet: PetLike) {
  return formatPetSummaryLabel({
    species: getPetTypeLabel(pet),
    breed: pet.breed,
    ageDisplayLabel: getPetAgeLabel(pet),
  });
}

export function formatPetSummaryLabel(pet: {
  species: string;
  breed?: string | null;
  ageDisplayLabel?: string | null;
}) {
  return [pet.species, pet.breed, pet.ageDisplayLabel]
    .filter((value) => value && value !== "Not set")
    .join(" - ");
}

export function getPetSafetySummaryLabel(pet: PetLike) {
  return [getPetTypeLabel(pet), pet.breed, getPetAgeLabel(pet)]
    .filter((value) => value && value !== "Not set")
    .join(" - ");
}
