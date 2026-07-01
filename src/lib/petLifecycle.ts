import type { PetLifecycleStatus } from "@/types";

export type PetLifecycleFilter = "active" | "memorial" | "archived" | "all";

export type PetLifecycleLike = {
  lifecycleStatus?: PetLifecycleStatus | string;
  isMemorial?: boolean;
  archived?: boolean;
  isArchived?: boolean;
};

export function getPetLifecycleStatus(
  pet?: PetLifecycleLike | null
): PetLifecycleStatus {
  if (!pet) {
    return "Active";
  }

  if (pet.archived || pet.isArchived) {
    return "Archived";
  }

  if (pet.isMemorial) {
    return "Memorial";
  }

  const normalized = String(pet.lifecycleStatus ?? "Active")
    .trim()
    .toLowerCase();

  if (normalized === "memorial") {
    return "Memorial";
  }

  if (normalized === "archived") {
    return "Archived";
  }

  return "Active";
}

export function isActivePet(pet?: PetLifecycleLike | null) {
  return getPetLifecycleStatus(pet) === "Active";
}

export function isMemorialPet(pet?: PetLifecycleLike | null) {
  return getPetLifecycleStatus(pet) === "Memorial";
}

export function isArchivedPet(pet?: PetLifecycleLike | null) {
  return getPetLifecycleStatus(pet) === "Archived";
}

export function getActivePets<T extends PetLifecycleLike>(pets: T[]) {
  return pets.filter(isActivePet);
}

export function getMemorialPets<T extends PetLifecycleLike>(pets: T[]) {
  return pets.filter(isMemorialPet);
}

export function getArchivedPets<T extends PetLifecycleLike>(pets: T[]) {
  return pets.filter(isArchivedPet);
}

export function getCountedPetProfiles<T extends PetLifecycleLike>(pets: T[]) {
  return pets.filter((pet) => !isArchivedPet(pet));
}

export function getPetsByFilter<T extends PetLifecycleLike>(
  pets: T[],
  filter: PetLifecycleFilter
) {
  switch (filter) {
    case "active":
      return getActivePets(pets);
    case "memorial":
      return getMemorialPets(pets);
    case "archived":
      return getArchivedPets(pets);
    case "all":
    default:
      return pets;
  }
}
