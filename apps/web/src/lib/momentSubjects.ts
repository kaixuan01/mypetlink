/**
 * How a Moment names the pets it is about.
 *
 * A Moment has one authoritative primary pet (`PetMoment.petId`) plus any number
 * of additional owned pets. For display the primary simply comes first; there is
 * no visual "primary" marker, because to a reader they are all just the pets in
 * the photo.
 */

import { isArchivedPet, type PetLifecycleLike } from "@/lib/petLifecycle";

export type MomentSubjectPet = {
  id: string;
  name: string;
};

/**
 * Orders a Moment's subjects for display: primary first, then the additional
 * pets in the owner's own pet order. Unknown ids are dropped rather than
 * rendered as blanks — a pet that was deleted should disappear, not leave a gap.
 */
export function resolveMomentSubjects(
  primaryPetId: string,
  additionalPetIds: readonly string[] | undefined,
  pets: readonly MomentSubjectPet[]
): MomentSubjectPet[] {
  const byId = new Map(pets.map((pet) => [pet.id, pet]));
  const ordered: MomentSubjectPet[] = [];
  const seen = new Set<string>();

  const primary = byId.get(primaryPetId);
  if (primary) {
    ordered.push(primary);
    seen.add(primary.id);
  }

  for (const pet of pets) {
    if (
      !seen.has(pet.id) &&
      (additionalPetIds ?? []).includes(pet.id)
    ) {
      ordered.push(pet);
      seen.add(pet.id);
    }
  }

  return ordered;
}

/**
 * Names the subjects of a Moment in running text.
 *
 *   ["Mochi"]                  → "Mochi"
 *   ["Mochi", "Coco"]          → "Mochi & Coco"
 *   ["Mochi", "Coco", "Lucky"] → "Mochi, Coco & Lucky"
 *   five or more               → "Mochi, Coco, Lucky & 2 more"
 *
 * The overflow form exists because the plan limit is small today but is a
 * product decision, not a law: a household with eight pets must not produce a
 * sentence that overflows a card.
 */
export function formatMomentSubjects(
  names: readonly string[],
  maxNamed = 3
): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);

  if (cleaned.length === 0) {
    return "";
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  if (cleaned.length <= maxNamed) {
    const last = cleaned[cleaned.length - 1];
    const rest = cleaned.slice(0, -1);
    return `${rest.join(", ")} & ${last}`;
  }

  const named = cleaned.slice(0, maxNamed);
  const remaining = cleaned.length - maxNamed;
  return `${named.join(", ")} & ${remaining} more`;
}

/**
 * The accessible label for a stack of pet avatars, which is otherwise a row of
 * decorative images a screen reader would announce as nothing useful.
 */
export function describeMomentSubjects(names: readonly string[]): string {
  const formatted = formatMomentSubjects(names, names.length);
  return formatted ? `In this Moment: ${formatted}` : "";
}

/**
 * Which of the owner's pets a new Moment can be about.
 *
 * Both composers — Community's Share a Moment and a pet's own Add Moment —
 * read this, so the same household sees the same choice from either door. The
 * input is always the signed-in owner's own pets: another household's pets,
 * followed or not, are never candidates, and the server refuses them anyway
 * (`pet_not_owned`).
 *
 * An archived pet is left out because the server will not start a Moment for
 * one ("restore it first"); offering it would only lead to that refusal. A
 * memorial pet stays: remembering a pet is exactly what a Moment is for.
 */
export function momentPrimaryPetOptions<T extends { id: string } & PetLifecycleLike>(
  ownPets: readonly T[]
): T[] {
  return ownPets.filter((pet) => !isArchivedPet(pet));
}

/**
 * Which of the owner's other pets can be added to a Moment alongside its
 * primary pet.
 *
 * The same rule as the primary choice, less the primary itself — with one
 * addition for editing: a pet already in this Moment stays listed, and ticked,
 * even if it has since been archived. Hiding it would not remove it (the saved
 * list is sent back unchanged); it would only make it impossible to see or to
 * untick.
 */
export function momentAdditionalPetOptions<T extends { id: string } & PetLifecycleLike>(
  ownPets: readonly T[],
  primaryPetId: string | null | undefined,
  currentAdditionalPetIds: readonly string[] = []
): T[] {
  return ownPets.filter(
    (pet) =>
      pet.id !== primaryPetId &&
      (!isArchivedPet(pet) || currentAdditionalPetIds.includes(pet.id))
  );
}
