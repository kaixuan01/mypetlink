"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { VideoPoster } from "@/components/moments/VideoPoster";
import { formatMomentSubjects } from "@/lib/momentSubjects";
import {
  getMomentCover,
  isVideoMedia,
  resolveMomentMediaAlt,
  summariseMomentMedia,
} from "@/lib/socialMomentMedia";
import { ownerSocialProfilePath } from "@/lib/routes";
import type {
  PublicMomentListItem,
  PublicMomentSubject,
  PublicOwnerAttribution,
} from "@/services/publicSocialService";

/**
 * The pieces every social Moment is made of.
 *
 * The owner profile, a pet's profile, the home feed and Explore each select
 * different Moments — that is their whole difference — so they compose these
 * parts rather than each drawing a Moment their own way. Four drifting cards is
 * how one surface quietly starts showing something the others decided not to.
 *
 * The order is deliberate everywhere: the PETS lead and the household follows.
 * That is the product, not a layout preference.
 */

/** The pets a Moment is about, stacked and named. The primary pet reads first. */
export function MomentSubjects({
  subjects,
  size = "md",
}: {
  subjects: PublicMomentSubject[];
  size?: "sm" | "md";
}) {
  if (subjects.length === 0) {
    return null;
  }

  const label = formatMomentSubjects(subjects.map((subject) => subject.name));
  const avatar = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const missing = subjects.filter((subject) => subject.lostModeEnabled);

  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="moment-subjects">
      <span className="flex shrink-0 -space-x-2">
        {subjects.slice(0, 3).map((subject) => (
          <span
            className={`${avatar} grid place-items-center overflow-hidden rounded-full border-2 border-white bg-pet-apricot`}
            key={subject.publicSlug ?? subject.name}
          >
            {subject.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                src={subject.photoUrl}
              />
            ) : (
              <span className="text-[11px] font-black text-pet-ink">
                {subject.name.slice(0, 1)}
              </span>
            )}
          </span>
        ))}
      </span>

      <span className="min-w-0">
        <span
          className={`block truncate font-black text-pet-ink ${
            size === "sm" ? "text-xs" : "text-sm"
          }`}
        >
          {label}
        </span>
        {missing.length > 0 ? (
          // One quiet word. The pet's name is already on the line above, and
          // "BISCUIT IS MISSING" shouted on every tile is amplification —
          // which is precisely what Lost Mode is not allowed to become here.
          <span
            className="block text-[11px] font-black uppercase tracking-wide text-pet-coral"
            data-testid="moment-subject-missing"
          >
            Missing
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** "The Tan Family · @tanfamily" — attribution, deliberately quieter than the pets. */
export function MomentByline({
  author,
  publishedAt,
  now,
  compact = false,
}: {
  author: PublicOwnerAttribution;
  publishedAt: string | null;
  /**
   * On a grid tile there is room for one identifier, not two. The handle wins:
   * it is shorter, it is unique, and it is what a Follow acts on. Showing both
   * on a 180px tile truncated each of them.
   */
  compact?: boolean;
  /**
   * The moment the list was loaded, captured once by the caller. Reading the
   * clock during render is impure, and a card that silently re-times itself on
   * every re-render is worse than one that says "2h" until the page reloads.
   */
  now?: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-pet-muted transition hover:text-pet-ink"
        data-testid="moment-byline"
        href={ownerSocialProfilePath(author.handle)}
      >
        <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full border border-pet-border bg-pet-cream">
          {author.avatarThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              src={author.avatarThumbnailUrl}
            />
          ) : (
            <Icon className="h-3 w-3 text-pet-muted" name="users" />
          )}
        </span>
        {compact ? null : (
          <span className="truncate">{author.displayName}</span>
        )}
        <span className={compact ? "truncate" : "truncate opacity-70"}>
          @{author.handle}
        </span>
      </Link>

      {publishedAt && now !== undefined ? (
        <span
          className="ml-auto shrink-0 text-xs font-semibold text-pet-muted"
          data-testid="moment-age"
        >
          {formatMomentAge(publishedAt, now)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A Moment's cover — whatever kind of thing that cover turns out to be.
 *
 * This draws a Moment's cover wherever the surface is a preview: a grid tile,
 * or the placeholder a Moment with no media gets. It used to reach for `<img>`
 * unconditionally, which was correct right up until somebody shared a video: the
 * browser was handed an `.mp4`, failed to decode it as a picture, and painted
 * the alt text, so Explore showed the file name where the pet should have been.
 * The kind is not guessed from the URL — the API states it, and this reads what
 * the API said.
 *
 * Lists and grids always load the derivative the API resolved for an image;
 * there is no path here that asks for a full-size original. A video has no image
 * derivative and is loaded as a video, metadata first.
 */
export function MomentMedia({
  moment,
  aspect = "4/5",
  placeholder = "title",
}: {
  moment: PublicMomentListItem;
  aspect?: "4/5" | "auto";
  /**
   * What fills the frame when a Moment has no media. "title" where the title is
   * not written again below, "quiet" where it is — the same words twice on one
   * card reads as a rendering fault.
   */
  placeholder?: "title" | "quiet";
}) {
  const cover = getMomentCover(moment);
  const summary = summariseMomentMedia(moment.media);
  const shape = aspect === "auto" ? "aspect-[4/3]" : "aspect-[4/5]";
  const alt = resolveMomentMediaAlt(cover, moment.title);

  return (
    <div className={`relative ${shape} w-full max-w-full bg-pet-apricot`}>
      {cover?.url ? (
        isVideoMedia(cover) ? (
          // A preview, never a player. It shows the video's own first frame and
          // a small mark, loads metadata only, and plays nothing — the whole
          // tile is a link to the Moment, and that is where a video belongs to
          // be watched. Native controls at 180px wide would cover the picture
          // they exist to control. Playing a Moment's video is the carousel's
          // job, on the surfaces that have room for it.
          <VideoPoster alt={alt} compact url={cover.url} />
        ) : (
          <MomentCoverImage alt={alt} url={cover.url} />
        )
      ) : placeholder === "title" ? (
        <span className="grid h-full w-full place-items-center px-4 text-center text-sm font-black text-pet-ink">
          {moment.title}
        </span>
      ) : (
        <span className="grid h-full w-full place-items-center text-pet-ink/40">
          <Icon aria-hidden="true" className="h-8 w-8" name="paw" />
        </span>
      )}

      {summary ? (
        // "+3 photos", not "1/4". Community shows the first item and does not
        // swipe, so a counter in carousel form promised a gesture that does not
        // exist — people swiped and nothing happened. This says the same true
        // thing (there are more) without implying how to reach them, and it
        // counts videos as videos.
        <span
          aria-label={summary.accessibleLabel}
          className="absolute right-2 top-2 z-30 rounded-full bg-pet-ink/70 px-2 py-0.5 text-[11px] font-black text-white"
          data-testid="moment-extra-photos"
        >
          {summary.label}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One Moment's cover photo, and what stands in for it when it will not load.
 *
 * A browser's own answer to a failed image is the alt text in a broken frame,
 * which on a 180px tile is a box of grey with a sentence squeezed into it. Worse,
 * alt text is often whatever the file was called, so a failure used to put an
 * upload's file name on a public page. This shows the same quiet mark an empty
 * Moment shows, and says what happened once, in words.
 */
function MomentCoverImage({ alt, url }: { alt: string; url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="grid h-full w-full place-items-center gap-1 bg-pet-apricot px-3 text-center"
        data-testid="moment-image-unavailable"
      >
        <Icon aria-hidden="true" className="h-7 w-7 text-pet-ink/40" name="paw" />
        <span className="text-[11px] font-bold text-pet-ink/60">
          Photo unavailable
        </span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className="h-full w-full object-cover"
      key={url}
      loading="lazy"
      onError={() => setFailed(true)}
      src={url}
    />
  );
}

/**
 * Relative age, in the shortest form that is still honest.
 *
 * Deliberately coarse: "2h" and "3d" are all a reader needs, and a precise
 * timestamp on every card only invites comparing who posted when.
 */
export function formatMomentAge(publishedAt: string, now: number): string {
  const published = Date.parse(publishedAt);

  if (!Number.isFinite(published)) {
    return "";
  }

  const seconds = Math.max(0, Math.round((now - published) / 1000));

  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 604_800)}w`;

  return new Date(published).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
