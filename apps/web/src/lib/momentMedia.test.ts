import { describe, expect, it } from "vitest";
import {
  formatMediaDuration,
  getCoverMedia,
  getPublicProfileMoments,
  makeCoverMedia,
  mediaCountLabel,
  mediaIdsInSortOrder,
  moveMedia,
  sortedMedia,
} from "./momentMedia";
import type { MomentMedia, PetMoment } from "@/types";

const mixedMedia: MomentMedia[] = [
  {
    id: "photo-1",
    type: "image",
    url: "https://media.mypetlink.com.my/moments/photo.jpg",
    sortOrder: 1,
  },
  {
    id: "video-1",
    type: "video",
    url: "https://media.mypetlink.com.my/moments/video.mp4",
    sortOrder: 0,
  },
  {
    id: "photo-2",
    type: "image",
    url: "https://media.mypetlink.com.my/moments/photo-two.jpg",
    sortOrder: 2,
  },
];

function makeMoment(
  id: string,
  visibility: PetMoment["visibility"],
  showOnPublicProfile: boolean
): PetMoment {
  return {
    id,
    petId: "pet-1",
    title: id,
    date: "11 Jul 2026",
    type: "Memory",
    caption: "",
    media: mixedMedia,
    coverMediaId: "video-1",
    visibility,
    showOnPublicProfile,
    showInLifeTimeline: false,
  };
}

describe("moment media presentation helpers", () => {
  it("keeps mixed photos and videos in MediaFileLinks.SortOrder", () => {
    expect(sortedMedia(mixedMedia).map((item) => item.id)).toEqual([
      "video-1",
      "photo-1",
      "photo-2",
    ]);
    expect(mediaIdsInSortOrder(mixedMedia)).toEqual([
      "video-1",
      "photo-1",
      "photo-2",
    ]);
  });

  it("moves media and reindexes the saved order", () => {
    const moved = moveMedia(mixedMedia, "photo-2", -1);
    expect(moved.map((item) => [item.id, item.sortOrder])).toEqual([
      ["video-1", 0],
      ["photo-2", 1],
      ["photo-1", 2],
    ]);
  });

  it("makes selected cover media first so cover and canonical order agree", () => {
    const next = makeCoverMedia(mixedMedia, "photo-2");
    expect(next.map((item) => item.id)).toEqual([
      "photo-2",
      "video-1",
      "photo-1",
    ]);
    expect(next.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
  });

  it("uses the explicitly selected cover without removing other media", () => {
    const moment = {
      media: mixedMedia,
      coverMediaId: "photo-1",
    } as Pick<PetMoment, "media" | "coverMediaId">;

    expect(getCoverMedia(moment)?.id).toBe("photo-1");
    expect(sortedMedia(moment.media)).toHaveLength(3);
  });

  it("describes photo-only, video-only, and mixed galleries accurately", () => {
    expect(mediaCountLabel([mixedMedia[0]])).toBe("1 photo");
    expect(mediaCountLabel([mixedMedia[1]])).toBe("1 video");
    expect(mediaCountLabel(mixedMedia)).toBe("2 photos · 1 video");
  });

  it("formats video duration for compact poster labels", () => {
    expect(formatMediaDuration(11.9)).toBe("0:11");
    expect(formatMediaDuration(65)).toBe("1:05");
    expect(formatMediaDuration(Number.NaN)).toBeNull();
  });

  it("excludes private and unshared moments from the public profile", () => {
    const moments = [
      makeMoment("public", "Public", true),
      makeMoment("private", "Private", true),
      makeMoment("not-shared", "Public", false),
    ];

    expect(getPublicProfileMoments(moments).map((moment) => moment.id)).toEqual([
      "public",
    ]);
    expect(getPublicProfileMoments(moments, false)).toEqual([]);
  });
});
