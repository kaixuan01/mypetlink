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
 * The identity and the Follow control share one row at every width that can
 * hold them: the household on the left, Follow on the right, centred against
 * the three lines of the byline. Follow belongs to the household, and sitting
 * on the household's row is what says so; parked underneath, it read as a
 * second call to action for the pet and competed with Share profile.
 *
 * A shared row is what once broke this card, and the arithmetic is worth
 * keeping. The identity was `flex-1` — basis zero, free to shrink below its own
 * content — while the button refused to shrink at all, so on a narrow screen
 * the byline was left a column a few pixels wide ("SHARED / BY / M / @"). The
 * row is safe now because the identity has a floor (`min-w-[9rem]`) and the
 * row wraps: when the floor and the button no longer fit side by side, the
 * button drops to its own line instead of the byline being crushed. That only
 * happens around 320px, or while a failed follow shows its message.
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
      className="mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[1.5rem] border border-pet-border bg-white p-3"
      data-testid="pet-social-attribution"
    >
      <SharedByIdentity author={sharedBy} className="min-w-[9rem] flex-1" />

      {action ? (
        <div
          className="ml-auto flex min-w-0 max-w-full shrink-0 justify-end"
          data-testid="pet-social-attribution-action"
        >
          {action}
        </div>
      ) : null}
    </div>
  );
}
