"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
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
      className="mt-4 flex min-w-0 flex-wrap items-center gap-3 rounded-[1.5rem] border border-pet-border bg-white p-3"
      data-testid="pet-social-attribution"
    >
      <Link
        className="flex min-w-0 flex-1 items-center gap-3"
        href={`/u/${sharedBy.handle.toLowerCase()}`}
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
          {sharedBy.avatarThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover"
              src={sharedBy.avatarThumbnailUrl}
            />
          ) : (
            <Icon name="users" className="h-5 w-5 text-pet-muted" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-pet-muted">
            Shared by
          </span>
          <span className="block truncate text-sm font-black text-pet-ink">
            {sharedBy.displayName}
          </span>
          <span className="block truncate text-xs font-bold text-pet-muted">
            @{sharedBy.handle}
          </span>
        </span>
      </Link>

      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
