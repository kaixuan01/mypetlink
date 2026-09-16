"use client";

import { SharedByIdentity } from "@/components/social/SharedByIdentity";
import type { PublicPetProfile } from "@/types";

type PetSocialAttributionProps = {
  sharedBy: NonNullable<PublicPetProfile["sharedBy"]>;
  /** The follow control, supplied by the caller so this stays presentational. */
  action?: React.ReactNode;
};

/**
 * "Shared by The Tan Family · @tanfamily".
 *
 * The pet is the subject of this page; the household is attribution. That is the
 * core of the MyPetLink social model and it is expressed in the visual weight
 * here: a small avatar and a byline, deliberately quieter than the pet's name
 * and photo above it.
 *
 * The identity and the Follow control are stacked on a phone and side by side
 * from `sm` up. They used to share one flexible row, and the arithmetic of that
 * row is what broke it: the identity was `flex-1` — basis zero, free to shrink
 * below its own content — while the button refused to shrink at all. On a narrow
 * screen the button took what it wanted and the byline was left with a column a
 * few pixels wide, which is why it rendered as "SHARED / BY / M / @". Giving each
 * its own row removes the competition rather than hiding the result of it.
 *
 * Rendered only when the API returned `sharedBy`, which happens only when both
 * the owner and the pet participate in social. A pet with a shareable link but
 * no social participation shows nothing here at all.
 */
export function PetSocialAttribution({
  sharedBy,
  action,
}: PetSocialAttributionProps) {
  return (
    <div
      className="mt-4 grid min-w-0 gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3 sm:flex sm:items-center"
      data-testid="pet-social-attribution"
    >
      <SharedByIdentity author={sharedBy} className="sm:flex-1" />

      {action ? <div className="min-w-0 sm:shrink-0">{action}</div> : null}
    </div>
  );
}
