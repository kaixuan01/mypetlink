"use client";

import type { ReactNode } from "react";
import { LinkoMascot } from "@/components/brand/LinkoMascot";
import { MomentPagesFooter } from "@/components/social/MomentPagesFooter";
import {
  SocialMomentTile,
  type MomentLikeChange,
} from "@/components/social/SocialMomentCard";
import type { AnalyticsSocialSource } from "@/lib/analytics";
import type { PublicMomentListItem } from "@/services/publicSocialService";

type PublicMomentGridProps = {
  moments: PublicMomentListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  /** The last further page failed, so nothing loads again until asked. */
  loadMoreFailed?: boolean;
  onLoadMore: () => void;
  emptyMessage: string;
  /**
   * Shown under the empty message. Only ever supplied on somebody's own
   * profile — a visitor has nothing to do about an empty grid, and offering
   * them a Share button would be offering someone else's action.
   */
  emptyAction?: ReactNode;
  /** Null until the signed-in check has run; the heart stays inert until then. */
  signedIn: boolean | null;
  /** Applied to the one Moment that changed, after the server confirms. */
  onLikeChange: (momentId: string, state: MomentLikeChange) => void;
  /** True where the grid mixes households — Explore — and false on one's own profile. */
  showAuthor?: boolean;
  /**
   * What this list is for.
   *
   * A **gallery** is somebody's body of work seen at a glance — a profile's own
   * Moments — and reads best dense. **Discovery** is Explore, where each card is
   * a household you have never met: a title, the pets, a handle, a like count and
   * a media badge, which at half a phone's width stop being content and start
   * being a product tile. Discovery therefore gives a phone one card per row.
   */
  presentation?: "gallery" | "discovery";
  analyticsSource?: AnalyticsSocialSource;
};

const gridColumns: Record<"gallery" | "discovery", string> = {
  gallery: "grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3",
  // The second column arrives at 640px rather than 768px. Every phone this
  // product sees is 430px or narrower, so one column still covers the case the
  // change was made for — while a single column held all the way to 767px
  // produced a 687px card with 859px of media in it, which is taller than the
  // screen showing it. One card per row is right for a phone, not for a slab.
  discovery: "grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
};

/**
 * A grid of public Moments with explicit "load more" paging.
 *
 * Two deliberate choices.
 *
 * **4:5 portrait, not square.** Pets are taller than they are wide, and a square
 * crop decapitates dogs. The tile keeps the portrait shape and lets the image
 * cover it.
 *
 * **Column count follows the job, not the component.** See `presentation`: the
 * same tile is dense on a profile and one-per-row on a phone in Explore.
 *
 * **A button, not infinite scroll.** It is keyboard reachable, it is announced,
 * and it does not trap someone trying to get to the footer. The cursor is opaque
 * and held by the caller.
 */
export function PublicMomentGrid({
  moments,
  hasMore,
  loadingMore,
  loadMoreFailed,
  onLoadMore,
  emptyMessage,
  emptyAction,
  signedIn,
  onLikeChange,
  showAuthor = false,
  presentation = "gallery",
  analyticsSource = "direct",
}: PublicMomentGridProps) {
  if (moments.length === 0) {
    // Compact on purpose. A full-height card here dominated a profile that is
    // mostly about the household and its pets, and made "no Moments yet" the
    // loudest thing on the page.
    return (
      <div
        className="mt-4 rounded-[1.75rem] border border-pet-border bg-white p-6 text-center"
        data-testid="moments-empty"
      >
        <LinkoMascot alt="Linko the MyPetLink mascot waving" className="mx-auto" pose="wave" size={56} />
        <p className="mt-2 text-sm font-bold text-pet-ink">{emptyMessage}</p>
        {emptyAction ? <div className="mt-4">{emptyAction}</div> : null}
      </div>
    );
  }

  return (
    <>
      <ul className={`mt-4 grid ${gridColumns[presentation]}`}>
        {moments.map((moment) => (
          <li key={moment.id}>
            <SocialMomentTile
              analyticsSource={analyticsSource}
              moment={moment}
              onLikeChange={onLikeChange}
              showAuthor={showAuthor}
              signedIn={signedIn}
            />
          </li>
        ))}
      </ul>

      <MomentPagesFooter
        failed={loadMoreFailed ?? false}
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </>
  );
}
