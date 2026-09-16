"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { ownerSocialProfilePath } from "@/lib/routes";

type SharedByAuthor = {
  handle: string;
  displayName: string;
  avatarThumbnailUrl?: string | null;
};

/**
 * "Shared by / The Tan Family / @tanfamily", stacked.
 *
 * A household has two names that both want to be read — the one they typed and
 * the handle that identifies them — and side by side on a phone they compete
 * and both lose. Stacked, each gets the full width of the column and truncates
 * only when it genuinely cannot fit.
 *
 * Used by a pet's public page, where the household is attribution for the pet,
 * and by a Moment's own page, where it is attribution for the Moment. Same
 * question, same answer, one implementation: the two surfaces looked different
 * for no reason other than having been built at different times.
 *
 * The label never wraps. Two words breaking into a column is what made the pet
 * page's version read as broken.
 */
export function SharedByIdentity({
  author,
  className = "",
}: {
  author: SharedByAuthor;
  className?: string;
}) {
  return (
    <Link
      className={`flex min-w-0 items-center gap-3 ${className}`}
      data-testid="shared-by-identity"
      href={ownerSocialProfilePath(author.handle)}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
        {author.avatarThumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-full w-full object-cover"
            src={author.avatarThumbnailUrl}
          />
        ) : (
          <Icon className="h-5 w-5 text-pet-muted" name="users" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap text-[11px] font-bold uppercase tracking-wide text-pet-muted">
          Shared by
        </span>
        <span className="block truncate text-sm font-black text-pet-ink">
          {author.displayName}
        </span>
        <span className="block truncate text-xs font-bold text-pet-muted">
          @{author.handle}
        </span>
      </span>
    </Link>
  );
}
