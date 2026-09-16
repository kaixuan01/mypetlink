"use client";

import { MomentPagesFooter } from "@/components/social/MomentPagesFooter";
import {
  SocialMomentCard,
  type MomentLikeChange,
} from "@/components/social/SocialMomentCard";
import type { AnalyticsSocialSource } from "@/lib/analytics";
import type { PublicMomentListItem } from "@/services/publicSocialService";

type SocialMomentStreamProps = {
  moments: PublicMomentListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  /** The last further page failed, so nothing loads again until asked. */
  loadMoreFailed?: boolean;
  onLoadMore: () => void;
  onLikeChange: (momentId: string, state: MomentLikeChange) => void;
  /** Null until the signed-in check has run; the heart stays inert until then. */
  signedIn: boolean | null;
  /** Captured once when the list loaded, so relative ages stay pure. */
  now?: number;
  /** True where the stream mixes households. Both of ours do. */
  showAuthor?: boolean;
  /** Which screen this is, for engagement measurement. Never a view event. */
  analyticsSource: AnalyticsSocialSource;
  /** Shown once there is nothing further, where the surface wants to say so. */
  endText?: string;
};

/**
 * A column of Moments, read one at a time.
 *
 * Home and Explore differ in which Moments they select — one asks "whom do I
 * follow", the other "whom might I like to meet" — and that is the whole of
 * their difference. They used to differ in how a Moment *looked* as well: Home
 * drew a full card with the pets, the household, a timestamp, a swipeable media
 * viewer, a like, a title and a caption, while Explore drew a 150px tile with a
 * clamped title and no time at all. The same Moment read as two unrelated kinds
 * of thing depending on which tab you found it in.
 *
 * A profile's own Moments stay a grid of tiles, which is a different job: one
 * household's body of work, seen at a glance, and dense is right there.
 */
export function SocialMomentStream({
  moments,
  hasMore,
  loadingMore,
  loadMoreFailed,
  onLoadMore,
  onLikeChange,
  signedIn,
  now,
  showAuthor = true,
  analyticsSource,
  endText,
}: SocialMomentStreamProps) {
  return (
    <>
      <div className="mt-5 grid gap-4" data-testid="social-moment-stream">
        {moments.map((moment) => (
          <SocialMomentCard
            analyticsSource={analyticsSource}
            key={moment.id}
            moment={moment}
            now={now}
            onLikeChange={onLikeChange}
            showAuthor={showAuthor}
            signedIn={signedIn}
          />
        ))}
      </div>

      <MomentPagesFooter
        endText={endText}
        failed={loadMoreFailed ?? false}
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={onLoadMore}
      />
    </>
  );
}
