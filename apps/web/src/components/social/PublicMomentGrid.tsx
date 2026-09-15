"use client";

import { LinkoMascot } from "@/components/brand/LinkoMascot";
import {
  SocialMomentTile,
  type MomentLikeChange,
} from "@/components/social/SocialMomentCard";
import { CTAButton } from "@/components/ui/CTAButton";
import type { AnalyticsSocialSource } from "@/lib/analytics";
import type { PublicMomentListItem } from "@/services/publicSocialService";

type PublicMomentGridProps = {
  moments: PublicMomentListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyMessage: string;
  /** Null until the signed-in check has run; the heart stays inert until then. */
  signedIn: boolean | null;
  /** Applied to the one Moment that changed, after the server confirms. */
  onLikeChange: (momentId: string, state: MomentLikeChange) => void;
  /** True where the grid mixes households — Explore — and false on one's own profile. */
  showAuthor?: boolean;
  analyticsSource?: AnalyticsSocialSource;
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
 * **A button, not infinite scroll.** It is keyboard reachable, it is announced,
 * and it does not trap someone trying to get to the footer. The cursor is opaque
 * and held by the caller.
 */
export function PublicMomentGrid({
  moments,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyMessage,
  signedIn,
  onLikeChange,
  showAuthor = false,
  analyticsSource = "direct",
}: PublicMomentGridProps) {
  if (moments.length === 0) {
    return (
      <div className="mt-4 rounded-[1.75rem] border border-pet-border bg-white p-8 text-center">
        <LinkoMascot alt="Linko the MyPetLink mascot waving" className="mx-auto" pose="wave" size={80} />
        <p className="mt-3 text-sm font-bold text-pet-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
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

      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <CTAButton
            disabled={loadingMore}
            onClick={onLoadMore}
            type="button"
            variant="secondary"
          >
            {loadingMore ? "Loading…" : "Show more Moments"}
          </CTAButton>
        </div>
      ) : null}
    </>
  );
}
