"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import { ownerSocialProfilePath } from "@/lib/routes";
import type { PublicMomentCollaboration } from "@/services/publicSocialService";

/**
 * On a Moment's own page, each collaborating household with the pets it
 * brought — grouped, so nobody reads another household's pet as the author's.
 * Deliberately below "Shared by": these households joined the Moment; they did
 * not share it and cannot change it.
 */
export function MomentCollaborators({
  collaborations,
}: {
  collaborations: PublicMomentCollaboration[];
}) {
  if (collaborations.length === 0) {
    return null;
  }

  return (
    <section aria-label="Households in this Moment" data-testid="moment-collaborations">
      <p className="text-[11px] font-bold uppercase tracking-wide text-pet-muted">With</p>
      <ul className="mt-1 grid gap-1">
        {collaborations.map((collaboration) => (
          <li className="min-w-0" key={collaboration.household.handle}>
            <Link
              className="flex min-h-11 min-w-0 items-center gap-2 text-sm"
              href={ownerSocialProfilePath(collaboration.household.handle)}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
                {collaboration.household.avatarThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="h-full w-full object-cover"
                    src={collaboration.household.avatarThumbnailUrl}
                  />
                ) : (
                  <Icon aria-hidden="true" className="h-4 w-4 text-pet-muted" name="users" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-black text-pet-ink">
                  {collaboration.household.displayName}
                </span>
                <span className="block truncate text-xs font-bold text-pet-muted">
                  {formatMomentSubjects(collaboration.pets.map((pet) => pet.name))}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
