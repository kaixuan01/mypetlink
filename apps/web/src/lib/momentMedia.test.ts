import { describe, expect, it } from "vitest";
import { getCoverMedia, mediaCountLabel, sortedMedia } from "./momentMedia";
import type { MomentMedia, PetMoment } from "@/types";

const mixedMedia: MomentMedia[] = [
  {
    id: "video-1",
    type: "video",
    url: "https://media.mypetlink.com.my/pets/pet/moments/memory/video.mp4",
    sortOrder: 1,
  },
  {
    id: "photo-1",
    type: "image",
    url: "https://media.mypetlink.com.my/pets/pet/moments/memory/photo.jpg",
    sortOrder: 0,
  },
];

describe("moment media presentation helpers", () => {
  it("keeps photos and videos in their saved order", () => {
    expect(sortedMedia(mixedMedia).map((item) => item.id)).toEqual([
      "photo-1",
      "video-1",
    ]);
  });

  it("uses the explicitly selected cover without removing other media", () => {
    const moment = {
      media: mixedMedia,
      coverMediaId: "video-1",
    } as Pick<PetMoment, "media" | "coverMediaId">;

    expect(getCoverMedia(moment)?.id).toBe("video-1");
    expect(sortedMedia(moment.media)).toHaveLength(2);
  });

  it("describes a mixed gallery accurately", () => {
    expect(mediaCountLabel(mixedMedia)).toBe("1 photo · 1 video");
  });

  it("pluralizes photo-only and video-only galleries", () => {
    expect(mediaCountLabel([mixedMedia[1], { ...mixedMedia[1], id: "photo-2" }])).toBe(
      "2 photos"
    );
    expect(mediaCountLabel([mixedMedia[0], { ...mixedMedia[0], id: "video-2" }])).toBe(
      "2 videos"
    );
  });
});
