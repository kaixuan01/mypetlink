import type { MomentVisibility } from "@/types";

/** The two audiences an owner chooses between. "Family Only" is legacy data. */
export type MomentAudience = Exclude<MomentVisibility, "Family Only">;

export function normalizeMomentVisibility(
  visibility: MomentVisibility
): MomentAudience {
  return visibility === "Public" ? "Public" : "Private";
}

/**
 * The product's words for a Moment's audience — one vocabulary, used by the
 * editor, every badge, the Moments summary and the Community composer.
 *
 * "Shared publicly" names the widest audience on purpose. A Public Moment
 * appears on the pet's Share Profile, on the household's Community Profile, on
 * its own page, in followers' Home feeds and — when the household and the pet
 * are discoverable — in Explore. "Anyone with the link" used to stand here and
 * was read as unlisted; a bare "Shared" on a badge left the reader to guess
 * with whom. `showOnPublicProfile` is derived from this one choice.
 *
 * Care records have their own "Only me" / "Shared" wording for a different
 * setting and deliberately do not use this.
 */
export const momentAudienceLabels: Record<MomentAudience, string> = {
  Private: "Only me",
  Public: "Shared publicly",
};

export const momentAudienceOptions: ReadonlyArray<{
  value: MomentAudience;
  label: string;
  description: string;
}> = [
  {
    value: "Private",
    label: momentAudienceLabels.Private,
    description: "Keep this Moment private to your owner account.",
  },
  {
    value: "Public",
    label: momentAudienceLabels.Public,
    description:
      "Appears on your pet's Share Profile. If you're in Community, it also appears on your Community Profile, and may appear in Community feeds or Explore when your profile and pet are discoverable.",
  },
];

export function momentAudienceLabel(visibility: MomentVisibility): string {
  return momentAudienceLabels[normalizeMomentVisibility(visibility)];
}
