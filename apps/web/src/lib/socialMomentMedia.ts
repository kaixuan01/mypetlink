import type {
  PublicMomentListItem,
  PublicMomentMedia,
} from "@/services/publicSocialService";
import type { MomentMedia } from "@/types";

/**
 * What a Community card is being asked to show, decided once.
 *
 * Five surfaces render a Moment's media — the feed, Explore, a pet's profile, a
 * household's profile, and an owner's own profile inside Community. Each of them
 * needs the same three answers: which item is the cover, what kind of thing it
 * is, and what to say about the ones that are not on screen. When each surface
 * worked that out for itself the answers drifted, and the version that decided
 * "it is an image" by simply never asking is what put a broken picture of a
 * `.mp4` on Explore.
 *
 * The API already states the kind of every item. Nothing here sniffs a file
 * extension or a MIME string; the extension of a URL is not evidence of
 * anything, and treating it as evidence is how the wrong renderer gets picked.
 */

/** Sorted, because a card must not depend on the order a list happened to arrive in. */
function orderedMedia(media: PublicMomentMedia[]): PublicMomentMedia[] {
  return [...media].sort((left, right) => left.sortOrder - right.sortOrder);
}

/** The item a card puts in its frame, or null when the Moment has no media. */
export function getMomentCover(
  moment: Pick<PublicMomentListItem, "media">
): PublicMomentMedia | null {
  return orderedMedia(moment.media ?? [])[0] ?? null;
}

export function isVideoMedia(item: PublicMomentMedia | null): boolean {
  return item?.type === "video";
}

/**
 * A file name is not alternative text.
 *
 * Uploads seed a media link's alt text from the file the owner chose, so plenty
 * of stored rows read `KyCatVideo1.mp4`. A browser paints alt text whenever the
 * image behind it fails to load, which means that string is one failed request
 * away from being on screen — and it tells a reader who cannot see the picture
 * nothing at all. Anything shaped like a file name or an object key is dropped
 * in favour of the Moment's own title, which at least describes the Moment.
 */
const fileNameShaped = /^\S+\.[a-z0-9]{2,5}$/i;

export function resolveMomentMediaAlt(
  item: PublicMomentMedia | null,
  momentTitle: string
): string {
  const supplied = item?.altText?.trim() ?? "";

  if (supplied && !supplied.includes("/") && !fileNameShaped.test(supplied)) {
    return supplied;
  }

  return momentTitle;
}

export type MomentMediaSummary = {
  /** The badge, e.g. "+3 photos". Short enough for a 180px tile. */
  label: string;
  /** The whole set, for a reader who cannot see the badge. */
  accessibleLabel: string;
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * "There are more, and here is honestly what they are."
 *
 * Community shows one item per Moment and nothing swipes, so this says how many
 * are behind it without implying a gesture. It counts by kind because "+1
 * photos" over a Moment whose second item is a video is simply untrue, and a
 * card that misdescribes its own contents is the same class of fault as one that
 * renders a video as a picture.
 *
 * Returns null for a Moment with one item or none — there is nothing to add.
 */
export function summariseMomentMedia(
  media: PublicMomentMedia[]
): MomentMediaSummary | null {
  const ordered = orderedMedia(media ?? []);

  if (ordered.length <= 1) {
    return null;
  }

  const countVideos = (items: PublicMomentMedia[]) =>
    items.filter((item) => item.type === "video").length;

  const hidden = ordered.slice(1);
  const hiddenVideos = countVideos(hidden);
  const hiddenPhotos = hidden.length - hiddenVideos;

  // Mixed sets say "more" rather than stacking two counts: "+2 photos · +1
  // video" does not fit a grid tile, and truncating it would misstate it.
  const label =
    hiddenPhotos > 0 && hiddenVideos > 0
      ? `+${hidden.length} more`
      : hiddenVideos > 0
        ? `+${plural(hiddenVideos, "video")}`
        : `+${plural(hiddenPhotos, "photo")}`;

  const totalVideos = countVideos(ordered);
  const totalPhotos = ordered.length - totalVideos;
  const parts = [
    totalPhotos > 0 ? plural(totalPhotos, "photo") : "",
    totalVideos > 0 ? plural(totalVideos, "video") : "",
  ].filter(Boolean);

  return {
    label,
    accessibleLabel: `${parts.join(" and ")} in this Moment`,
  };
}

/**
 * A Community Moment's media, in the shape the shared viewer speaks.
 *
 * The owner's own record of a Moment and the public card the community sees are
 * different shapes for good reasons, and the carousel and lightbox were built
 * against the first. Rather than fork them — two implementations of swipe, of
 * keyboard order, of which video is allowed to be playing — the public shape is
 * translated once, here.
 *
 * Alternative text is resolved on the way through, so a file name stored on a
 * media link years ago cannot surface inside the viewer either.
 */
export function toViewerMedia(
  media: PublicMomentMedia[],
  momentTitle: string
): MomentMedia[] {
  return orderedMedia(media ?? []).map((item, index) => ({
    id: item.id,
    type: item.type,
    url: item.url ?? undefined,
    caption: item.caption?.trim() || undefined,
    altText: resolveMomentMediaAlt(item, momentTitle),
    sortOrder: item.sortOrder ?? index,
  }));
}
