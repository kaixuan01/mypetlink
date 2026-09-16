"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MomentMediaCarousel } from "@/components/moments/MomentMediaCarousel";
import { LikeButton } from "@/components/social/LikeButton";
import type { AnalyticsSocialSource } from "@/lib/analytics";
import {
  MomentByline,
  MomentMedia,
  MomentSubjects,
} from "@/components/social/SocialMomentParts";
import { momentPath } from "@/lib/routes";
import { toViewerMedia } from "@/lib/socialMomentMedia";
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
 * The media is the shared carousel, so a Moment with four photos can be swiped
 * through where it sits. That is also why this surface may show "2 / 4" while a
 * grid tile may not: here the counter describes a gesture that works.
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
  const media = useMemo(
    () => toViewerMedia(moment.media, moment.title),
    [moment.media, moment.title]
  );

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

      {media.length > 0 ? (
        <MomentMediaCarousel
          autoplayVideoWhenVisible
          caption={moment.caption ?? undefined}
          media={media}
          title={moment.title}
        />
      ) : (
        // A Moment with no media still has to be openable. The title is drawn
        // inside this frame rather than under it, so without a link here the
        // card had nothing at all pointing at the Moment's own page — which is
        // what a grid tile, whose title always carried one, never suffered.
        <Link
          className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pet-teal"
          href={momentPath(moment.id)}
        >
          <MomentMedia aspect="auto" moment={moment} />
        </Link>
      )}

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
          <h3 className="mt-1 text-sm font-black" data-testid="moment-title">
            <Link
              className="text-pet-ink transition hover:text-pet-teal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
              href={momentPath(moment.id)}
            >
              {moment.title}
            </Link>
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
 * The compact form, for grids: Explore, a household's profile, a pet's page.
 *
 * Three things make a grid a grid.
 *
 * **The whole tile opens the Moment.** It used to be inert — a photo, a title,
 * a badge saying "+3 photos", and no way to reach them. The title carries a link
 * that is stretched across the card, so the tap target is the card while the
 * accessible name stays the Moment's own title, and the two controls that belong
 * to somebody else's actions — the household's byline and the heart — sit above
 * it and keep working. No button inside a link, no link inside a link.
 *
 * **Every tile is the same height.** A fixed 4:5 frame, a title clamped to two
 * lines and floored at two lines' worth of space, one row each for the pets and
 * the household, and the heart pinned to the bottom. A long title used to make
 * one tile tower over its neighbour.
 *
 * **Media here is a preview, not a player.** A video shows its own first frame
 * with a small play mark; it does not play in the grid and does not carry
 * controls. Tapping it opens the Moment, like tapping anything else on the tile.
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
      className="brand-card relative m-0 flex h-full flex-col overflow-hidden rounded-[1.25rem] p-0"
      data-testid="social-moment-tile"
    >
      <MomentMedia moment={moment} placeholder="quiet" />

      <figcaption className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="text-sm font-black">
          <Link
            // No display utility beside line-clamp-2. The clamp works by setting
            // `display: -webkit-box`, so a `block` next to it silently wins in
            // the cascade and the title grows to whatever length it likes — which
            // is exactly the uneven-tile problem this is here to solve.
            className="line-clamp-2 min-h-[2.5rem] text-pet-ink after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pet-teal"
            data-testid="moment-title"
            href={momentPath(moment.id)}
          >
            {moment.title}
          </Link>
        </h3>

        <div className="relative z-10 min-h-8">
          <MomentSubjects size="sm" subjects={moment.subjects} />
        </div>

        {showAuthor && moment.author ? (
          <div className="relative z-10">
            <MomentByline author={moment.author} compact publishedAt={null} />
          </div>
        ) : null}

        <div className="relative z-10 -ml-2 mt-auto pt-1">
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
