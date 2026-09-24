import type {
  PublicMomentListItem,
  PublicMomentSubject,
  PublicOwnerAttribution,
} from "@/services/publicSocialService";

/**
 * How a collaborated Moment is described.
 *
 * The author always stays primary: collaborators are "with", never "by".
 * Pets read as one line — the author's first, then each collaborating
 * household's in the order it joined — while detail views keep the household
 * grouping so a pet is never mistaken for the author's.
 */

/** The author's pets followed by every collaborating household's pets. */
export function allMomentPets(moment: PublicMomentListItem): PublicMomentSubject[] {
  return [
    ...moment.subjects,
    ...(moment.collaborations ?? []).flatMap((collaboration) => collaboration.pets),
  ];
}

export function collaboratorHouseholds(moment: PublicMomentListItem): PublicOwnerAttribution[] {
  return (moment.collaborations ?? []).map((collaboration) => collaboration.household);
}

/** "The Lee Family", "The Lee Family and 1 other", "The Lee Family and 2 others". */
export function formatCollaborators(households: readonly PublicOwnerAttribution[]) {
  if (households.length === 0) return "";
  const others = households.length - 1;
  return others === 0
    ? households[0].displayName
    : `${households[0].displayName} and ${others} ${others === 1 ? "other" : "others"}`;
}

/**
 * Whether this pet is in the Moment as another household's collaborator
 * rather than as one of the author's own pets. Pages may name a pet by its
 * full slug or only its public code, so either form matches.
 */
export function isCollaboratorPet(moment: PublicMomentListItem, petSlugOrCode: string) {
  const wanted = petSlugOrCode.trim().toLowerCase();
  if (!wanted) return false;

  return (moment.collaborations ?? []).some((collaboration) =>
    collaboration.pets.some((pet) => {
      const slug = (pet.publicSlug ?? "").toLowerCase();
      return slug === wanted || slug.endsWith(`-${wanted}`) || wanted.endsWith(`-${slug.split("-").pop()}`);
    })
  );
}
