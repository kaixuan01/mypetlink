import type { MomentMedia, PetMoment } from "@/types";

// Stable-ish client id for a media item (no backend involved).
export function createMediaId() {
  return `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sortedMedia(media: MomentMedia[] = []) {
  return [...media].sort((a, b) => a.sortOrder - b.sortOrder);
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
