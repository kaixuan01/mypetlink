"use client";

import Link from "next/link";
import { FollowButton } from "@/components/social/FollowButton";
import { Icon } from "@/components/ui/Icon";
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
};

/**
 * A pet, as Explore and search show it.
 *
 * The pet leads: photo, name, breed. The household is underneath, and the
 * Follow button says whose handle it acts on — because it does not follow the
 * pet, and a card that leaves that ambiguous teaches people the wrong model of
 * the product on their very first contact with it.
 *
 * No follower count. Pets are the subject of content, not actors in the graph.
 */
export function SocialPetCard({ pet, onFollowChange }: SocialPetCardProps) {
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
      className="brand-card flex min-w-0 flex-col overflow-hidden rounded-[1.5rem] p-0"
      data-testid="social-pet-card"
    >
      <Link
        className="block"
        href={`/p/${pet.publicSlug}`}
      >
        <span className="relative block aspect-[4/5] w-full max-w-full bg-pet-apricot">
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
              <Icon aria-hidden="true" className="h-10 w-10" name="paw" />
            </span>
          )}

          {pet.lostModeEnabled ? (
            <span className="absolute left-2 top-2 rounded-full bg-pet-coral px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
              Missing
            </span>
          ) : null}
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col p-3">
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

        <p className="mt-2 truncate text-xs font-bold text-pet-muted">
          Shared by{" "}
          <Link
            className="transition hover:text-pet-ink"
            href={`/u/${pet.owner.handle.toLowerCase()}`}
          >
            @{pet.owner.handle}
          </Link>
        </p>

        <div className="mt-2">
          <FollowButton
            displayName={pet.owner.displayName}
            handle={pet.owner.handle}
            onChange={(next) =>
              onFollowChange(pet.owner.handle, next.isFollowing)
            }
            relationship={relationship}
            signedIn={signedIn}
            surface="attribution"
          />
        </div>
      </div>
    </article>
  );
}
