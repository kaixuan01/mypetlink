"use client";

import { LikeButton } from "@/components/social/LikeButton";
import type { AnalyticsSocialSource } from "@/lib/analytics";
import {
  MomentByline,
  MomentMedia,
  MomentSubjects,
} from "@/components/social/SocialMomentParts";
import type { PublicMomentListItem } from "@/services/publicSocialService";

export type MomentLikeChange = {
  likeCount: number;
  viewerHasLiked: boolean;
};

type SocialMomentCardProps = {
  moment: PublicMomentListItem;
  signedIn: boolean | null;
  onLikeChange: (momentId: string, state: MomentLikeChange) => void;
  /** Captured once when the list loaded, so relative ages stay pure. */
  now?: number;
  /** False on a household's own profile, where the byline would repeat the page. */
  showAuthor?: boolean;
  /** Which screen this card is on, for engagement measurement. */
  analyticsSource?: AnalyticsSocialSource;
  className?: string;
};

/**
 * A Moment at full width — the feed, and a pet's own Moments.
 *
 * Pet-led by construction: the subjects sit at the top in the reader's eye
 * line, the household's byline underneath them in smaller, quieter type, and
 * the media below both. Inverting that into a person's post with a pet in it
 * would be a different product.
 *
 * There is no comment control. Comments do not exist yet, and a card must not
 * imply an affordance it does not have.
 */
export function SocialMomentCard({
  moment,
  signedIn,
  onLikeChange,
  now,
  showAuthor = true,
  analyticsSource = "direct",
  className = "",
}: SocialMomentCardProps) {
  return (
    <article
      className={`brand-card overflow-hidden rounded-[1.5rem] p-0 ${className}`}
      data-testid="social-moment-card"
    >
      <header className="flex flex-col gap-1.5 p-3 pb-2">
        <MomentSubjects subjects={moment.subjects} />
        {showAuthor && moment.author ? (
          <MomentByline
            author={moment.author}
            now={now}
            publishedAt={moment.publishedAt}
          />
        ) : null}
      </header>

      <MomentMedia moment={moment} aspect="auto" />

      <div className="p-3">
        <div className="-ml-2">
          <LikeButton
            analyticsSource={analyticsSource}
            likeCount={moment.likeCount}
            momentId={moment.id}
            momentTitle={moment.title}
            onChange={(state) => onLikeChange(moment.id, state)}
            signedIn={signedIn}
            viewerHasLiked={moment.viewerHasLiked}
          />
        </div>

        {moment.media.length > 0 ? (
          // A Moment with no media already shows its title in the frame above.
          <h3
            className="mt-1 text-sm font-black text-pet-ink"
            data-testid="moment-title"
          >
            {moment.title}
          </h3>
        ) : null}
        {moment.caption ? (
          <p className="mt-0.5 whitespace-pre-line text-sm font-semibold leading-6 text-pet-ink">
            {moment.caption}
          </p>
        ) : null}
      </div>
    </article>
  );
}

type SocialMomentTileProps = SocialMomentCardProps;

/**
 * The compact form, for grids: a household's profile and Explore.
 *
 * Same content model, same like control, less of it — a grid is for scanning,
 * so the caption stays out and the pets stay in.
 */
export function SocialMomentTile({
  moment,
  signedIn,
  onLikeChange,
  showAuthor = false,
  analyticsSource = "direct",
}: SocialMomentTileProps) {
  return (
    <figure
      className="brand-card m-0 overflow-hidden rounded-[1.25rem] p-0"
      data-testid="social-moment-tile"
    >
      <MomentMedia moment={moment} placeholder="quiet" />

      <figcaption className="p-3">
        <span
          className="line-clamp-2 block text-sm font-black text-pet-ink"
          data-testid="moment-title"
        >
          {moment.title}
        </span>

        <div className="mt-1.5">
          <MomentSubjects size="sm" subjects={moment.subjects} />
        </div>

        {showAuthor && moment.author ? (
          <div className="mt-1.5">
            <MomentByline author={moment.author} compact publishedAt={null} />
          </div>
        ) : null}

        <div className="mt-1 -ml-2">
          <LikeButton
            analyticsSource={analyticsSource}
            likeCount={moment.likeCount}
            momentId={moment.id}
            momentTitle={moment.title}
            onChange={(state) => onLikeChange(moment.id, state)}
            signedIn={signedIn}
            viewerHasLiked={moment.viewerHasLiked}
          />
        </div>
      </figcaption>
    </figure>
  );
}
