/**
 * How a Moment names the pets it is about.
 *
 * A Moment has one authoritative primary pet (`PetMoment.petId`) plus any number
 * of additional owned pets. For display the primary simply comes first; there is
 * no visual "primary" marker, because to a reader they are all just the pets in
 * the photo.
 */

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
