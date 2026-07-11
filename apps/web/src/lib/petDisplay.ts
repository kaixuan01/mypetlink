import { calculatePetAge } from "@/lib/petAge";
import type { Pet, PetSpecies, PublicPetProfile } from "@/types";

type PetLike = Pick<
  Pet | PublicPetProfile,
  "species" | "breed" | "birthday" | "estimatedBirthYear"
> & {
  customSpecies?: string;
};

export const PET_TYPE_OPTIONS: PetSpecies[] = [
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
];

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
  return [getPetTypeLabel(pet), pet.breed, getPetAgeLabel(pet)]
    .filter((value) => value && value !== "Not set")
    .join(" - ");
}

export function getPetSafetySummaryLabel(pet: PetLike) {
  return [getPetTypeLabel(pet), pet.breed, getPetAgeLabel(pet)]
    .filter((value) => value && value !== "Not set")
    .join(" - ");
}
