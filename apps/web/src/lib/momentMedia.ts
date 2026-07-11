import type { MomentMedia, PetMoment } from "@/types";

// Stable client id for a media item before it receives a persisted media id.
export function createMediaId() {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sortedMedia(media: MomentMedia[] = []) {
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function reindexMedia(media: MomentMedia[] = []) {
  return media.map((item, index) => ({ ...item, sortOrder: index }));
}

export function moveMedia(
  media: MomentMedia[] = [],
  itemId: string,
  offset: -1 | 1
) {
  const ordered = sortedMedia(media);
  const currentIndex = ordered.findIndex((item) => item.id === itemId);
  const nextIndex = currentIndex + offset;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= ordered.length) {
    return reindexMedia(ordered);
  }

  const next = [...ordered];
  [next[currentIndex], next[nextIndex]] = [next[nextIndex], next[currentIndex]];
  return reindexMedia(next);
}

export function makeCoverMedia(media: MomentMedia[] = [], itemId: string) {
  const ordered = sortedMedia(media);
  const selected = ordered.find((item) => item.id === itemId);

  if (!selected) {
    return reindexMedia(ordered);
  }

  return reindexMedia([
    selected,
    ...ordered.filter((item) => item.id !== itemId),
  ]);
}

export function mediaIdsInSortOrder(media: MomentMedia[] = []) {
  return sortedMedia(media)
    .map((item) => item.id)
    .filter(Boolean);
}

export function getPublicProfileMoments(
  moments: PetMoment[] = [],
  sectionEnabled = true
) {
  if (!sectionEnabled) {
    return [];
  }

  return moments.filter(
    (moment) =>
      moment.visibility === "Public" && moment.showOnPublicProfile
  );
}

export function formatMediaDuration(durationSeconds?: number) {
  if (
    durationSeconds === undefined ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 0
  ) {
    return null;
  }

  const totalSeconds = Math.floor(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// The cover is the explicitly chosen item, or the first item by sort order.
export function getCoverMedia(
  moment: Pick<PetMoment, "media" | "coverMediaId">
): MomentMedia | null {
  const items = sortedMedia(moment.media ?? []);

  if (!items.length) {
    return null;
  }

  return items.find((item) => item.id === moment.coverMediaId) ?? items[0];
}

// "3 photos", "2 photos · 1 video", "1 video" — null when there is no media.
export function mediaCountLabel(media: MomentMedia[] = []): string | null {
  if (!media.length) {
    return null;
  }

  const photos = media.filter((item) => item.type === "image").length;
  const videos = media.filter((item) => item.type === "video").length;
  const parts: string[] = [];

  if (photos) {
    parts.push(`${photos} photo${photos > 1 ? "s" : ""}`);
  }

  if (videos) {
    parts.push(`${videos} video${videos > 1 ? "s" : ""}`);
  }

  return parts.join(" · ") || null;
}
