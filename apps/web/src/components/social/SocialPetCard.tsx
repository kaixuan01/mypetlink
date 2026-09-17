"use client";

import Link from "next/link";
import { FollowButton } from "@/components/social/FollowButton";
import { Icon } from "@/components/ui/Icon";
import type { AnalyticsSocialSource } from "@/lib/analytics";
import { useSignedIn } from "@/lib/useSignedIn";
import { formatPetSummaryLabel } from "@/lib/petDisplay";
import {
  noRelationship,
  type OwnerRelationship,
} from "@/services/socialGraphService";
import type { SocialPetCard as SocialPetCardModel } from "@/services/socialDiscoveryService";

type SocialPetCardProps = {
  pet: SocialPetCardModel;
  onFollowChange: (handle: string, isFollowing: boolean) => void;
  analyticsSource?: AnalyticsSocialSource;
};

/**
 * A pet, as Explore and search show it.
 *
 * The pet leads: photo, name, breed. The household is underneath, and the
 * Follow button says whose handle it acts on — because it does not follow the
 * pet, and a card that leaves that ambiguous teaches people the wrong model of
 * the product on their very first contact with it.
 *
 * Two shapes, one card. On a phone it is a row: a small square photo with the
 * identity beside it, using the whole content width. As a narrow vertical tile
 * two to a row it had a great deal of empty space and no room for the things
 * that matter — the breed truncated, the handle truncated, and Follow took up
 * half the card. From `sm` up there is room for the tile again, three to a row.
 *
 * The photo is deliberately small on a phone. This is discovery metadata, not
 * the content surface: a suggestion the size of a Moment competes with the
 * Moments underneath it.
 *
 * No follower count. Pets are the subject of content, not actors in the graph.
 */
export function SocialPetCard({
  pet,
  onFollowChange,
  analyticsSource = "explore",
}: SocialPetCardProps) {
  const signedIn = useSignedIn();
  const relationship: OwnerRelationship = {
    ...noRelationship,
    isFollowing: pet.viewerFollowsOwner,
    // A listing does not carry each household's follow settings; the API has
    // the final word and a refusal rolls the button back with its own message.
    canFollow: true,
    allowsFollowers: true,
  };

  return (
    /*
      The card follows the width it is given, not the width of the window.

      It has two shapes: a row, photo beside the identity, and a column with a
      tall photo above it. Which one is right depends entirely on how much room
      this card has — and two callers give it very different amounts. The feed's
      suggestion shelf is three cards inside a 576px column, about 184px each,
      where a row cannot fit a photo and a handle side by side. Explore's
      discovery grid is three cards across a thousand, about 330px each, where
      the column shape stretches a 4:5 photo to 400px tall and turns a
      suggestion into a poster.

      Keyed to the viewport, those two cases are indistinguishable — both are
      "desktop" — which is why Explore ended up with 248x456 tiles standing in a
      1232px canvas. Keyed to the container, each one simply gets the shape that
      fits.
    */
    <div className="@container">
      <article
        className="brand-card flex min-w-0 gap-3 overflow-hidden rounded-[1.5rem] p-3 @max-[15rem]:flex-col @max-[15rem]:gap-0 @max-[15rem]:p-0"
        data-testid="social-pet-card"
      >
      <Link className="block shrink-0 @max-[15rem]:w-full" href={`/p/${pet.publicSlug}`}>
        <span className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-[1rem] bg-pet-apricot @max-[15rem]:aspect-[4/5] @max-[15rem]:h-auto @max-[15rem]:w-full @max-[15rem]:rounded-none">
          {pet.photoThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`${pet.name}`}
              className="h-full w-full object-cover"
              loading="lazy"
              src={pet.photoThumbnailUrl}
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-pet-ink/40">
              <Icon aria-hidden="true" className="h-8 w-8 @max-[15rem]:h-10 @max-[15rem]:w-10" name="paw" />
            </span>
          )}

          {pet.lostModeEnabled ? (
            <span className="absolute left-1 top-1 rounded-full bg-pet-coral px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white @max-[15rem]:left-2 @max-[15rem]:top-2 @max-[15rem]:px-2 @max-[15rem]:text-[11px]">
              Missing
            </span>
          ) : null}
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col @max-[15rem]:p-3">
        <Link className="min-w-0" href={`/p/${pet.publicSlug}`}>
          <span className="block truncate text-base font-black text-pet-ink">
            {pet.name}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-pet-muted">
            {formatPetSummaryLabel({
              species:
                pet.species === "Other" && pet.customSpecies
                  ? pet.customSpecies
                  : pet.species,
              breed: pet.breed,
            })}
          </span>
        </Link>

        {/* The handle is what the Follow button acts on, so it is stated in
            full and given room to be read. Beside a small photo on a phone
            there is width for it; in the narrow tile there never was. The link
            carries vertical padding so its hit area clears the 24px minimum
            without changing how it looks. */}
        <p className="mt-1 min-w-0 text-xs font-bold text-pet-muted @max-[15rem]:mt-2">
          <Link
            className="block truncate py-1 transition hover:text-pet-ink"
            href={`/u/${pet.owner.handle.toLowerCase()}`}
          >
            <span className="font-semibold">Shared by </span>@{pet.owner.handle}
          </Link>
        </p>

        {/* The button reads "Follow" rather than "Follow @handle": the handle
            is stated in full directly above it, and the pairing is what makes
            the target unambiguous, not the label alone. It sits at the end of
            the row on a phone so it never competes with the identity for the
            width that identity needs. */}
        <div className="mt-2 flex justify-end @max-[15rem]:mt-2 @max-[15rem]:justify-start">
          <FollowButton
            analyticsSource={analyticsSource}
            displayName={pet.owner.displayName}
            handle={pet.owner.handle}
            onChange={(next) =>
              onFollowChange(pet.owner.handle, next.isFollowing)
            }
            relationship={relationship}
            signedIn={signedIn}
          />
        </div>
        </div>
      </article>
    </div>
  );
}
