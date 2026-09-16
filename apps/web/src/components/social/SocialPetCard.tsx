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
    <article
      className="brand-card flex min-w-0 gap-3 overflow-hidden rounded-[1.5rem] p-3 sm:flex-col sm:gap-0 sm:p-0"
      data-testid="social-pet-card"
    >
      <Link className="block shrink-0 sm:w-full" href={`/p/${pet.publicSlug}`}>
        <span className="relative block h-20 w-20 overflow-hidden rounded-[1rem] bg-pet-apricot sm:aspect-[4/5] sm:h-auto sm:w-full sm:rounded-none">
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
              <Icon aria-hidden="true" className="h-8 w-8 sm:h-10 sm:w-10" name="paw" />
            </span>
          )}

          {pet.lostModeEnabled ? (
            <span className="absolute left-1 top-1 rounded-full bg-pet-coral px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white sm:left-2 sm:top-2 sm:px-2 sm:text-[11px]">
              Missing
            </span>
          ) : null}
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col sm:p-3">
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
        <p className="mt-1 min-w-0 text-xs font-bold text-pet-muted sm:mt-2">
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
        <div className="mt-1 flex justify-end sm:mt-2 sm:justify-start">
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
  );
}
