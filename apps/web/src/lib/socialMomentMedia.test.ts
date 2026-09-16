import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMomentCover,
  isVideoMedia,
  resolveMomentMediaAlt,
  summariseMomentMedia,
} from "@/lib/socialMomentMedia";
import type { PublicMomentMedia } from "@/services/publicSocialService";

function item(
  overrides: Partial<PublicMomentMedia> & { type: "image" | "video" }
): PublicMomentMedia {
  return {
    id: "m",
    url: "https://media.test/thing",
    caption: null,
    altText: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("choosing the cover", () => {
  it("takes the first item by sort order, not by arrival order", () => {
    const cover = getMomentCover({
      media: [
        item({ type: "image", id: "second", sortOrder: 1 }),
        item({ type: "video", id: "first", sortOrder: 0 }),
      ],
    });

    // A list that arrives out of order must not change which item is the cover.
    expect(cover?.id).toBe("first");
  });

  it("is null for a Moment with no media", () => {
    expect(getMomentCover({ media: [] })).toBeNull();
  });

  it("reads the kind the API stated, never the file extension", () => {
    // A ".mp4" in the URL is a naming convention. The type field is the fact.
    expect(isVideoMedia(item({ type: "video", url: "https://x/a.jpg" }))).toBe(true);
    expect(isVideoMedia(item({ type: "image", url: "https://x/a.mp4" }))).toBe(false);
    expect(isVideoMedia(null)).toBe(false);
  });
});

describe("alternative text", () => {
  it("drops a stored file name", () => {
    expect(
      resolveMomentMediaAlt(item({ type: "video", altText: "KyCatVideo1.mp4" }), "Ky swims")
    ).toBe("Ky swims");
  });

  it("drops anything shaped like an object key", () => {
    expect(
      resolveMomentMediaAlt(
        item({ type: "image", altText: "pets/abc/moments/xyz.jpg" }),
        "Beach day"
      )
    ).toBe("Beach day");
  });

  it("keeps a sentence that merely ends in a full stop", () => {
    const written = "Mochi asleep in a sunbeam.";

    // The rule is "looks like a file name", not "contains a dot".
    expect(resolveMomentMediaAlt(item({ type: "image", altText: written }), "x")).toBe(
      written
    );
  });

  it("keeps a single written word", () => {
    expect(resolveMomentMediaAlt(item({ type: "image", altText: "Sunbeam" }), "x")).toBe(
      "Sunbeam"
    );
  });

  it("falls back to the title when nothing was written", () => {
    expect(resolveMomentMediaAlt(item({ type: "image" }), "Beach day")).toBe("Beach day");
    expect(resolveMomentMediaAlt(null, "Beach day")).toBe("Beach day");
  });
});

describe("summarising the rest of the set", () => {
  const photo = (order: number) => item({ type: "image", id: `p${order}`, sortOrder: order });
  const clip = (order: number) => item({ type: "video", id: `v${order}`, sortOrder: order });

  it("says nothing when there is nothing behind the cover", () => {
    expect(summariseMomentMedia([])).toBeNull();
    expect(summariseMomentMedia([photo(0)])).toBeNull();
  });

  it("counts hidden photos", () => {
    expect(summariseMomentMedia([photo(0), photo(1), photo(2)])?.label).toBe("+2 photos");
  });

  it("counts a single hidden photo in the singular", () => {
    expect(summariseMomentMedia([photo(0), photo(1)])?.label).toBe("+1 photo");
  });

  it("calls a hidden video a video", () => {
    // The whole point: "+1 photos" over a clip is a false statement about the
    // Moment, in exactly the way rendering that clip as a picture was.
    expect(summariseMomentMedia([photo(0), clip(1)])?.label).toBe("+1 video");
  });

  it("says only how many more when the hidden items are of both kinds", () => {
    // "+2 photos · +1 video" does not fit a grid tile, and a truncated count
    // would misstate it.
    expect(summariseMomentMedia([clip(0), photo(1), photo(2), clip(3)])?.label).toBe(
      "+3 more"
    );
  });

  it("describes the whole Moment for assistive technology", () => {
    expect(summariseMomentMedia([photo(0), photo(1), clip(2)])?.accessibleLabel).toBe(
      "2 photos and 1 video in this Moment"
    );
    expect(summariseMomentMedia([photo(0), photo(1)])?.accessibleLabel).toBe(
      "2 photos in this Moment"
    );
    expect(summariseMomentMedia([clip(0), clip(1)])?.accessibleLabel).toBe(
      "2 videos in this Moment"
    );
  });
});

/**
 * Two renderers, not five.
 *
 * `MomentMedia` draws a preview — a grid tile, or the placeholder a Moment with
 * no media gets — and `MomentMediaCarousel` draws media somebody can move
 * through, on the feed and on a Moment's own page. Every Community surface
 * composes one of those two, so the decision that was wrong is in one place per
 * shape and is now right in both. A surface that grew its own media branch would
 * be free to get it wrong again.
 */
describe("a single media path across Community", () => {
  const web = join(__dirname, "..", "..");
  const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

  const surfaces = [
    "components/social/SocialFeedView.tsx",
    "components/social/SocialExploreView.tsx",
    "components/social/PetProfileMomentsTab.tsx",
    "components/social/OwnerSocialProfileView.tsx",
    "components/social/PublicMomentGrid.tsx",
    "components/social/CommunityMyProfileView.tsx",
  ];

  it("keeps every surface out of the business of deciding media kinds", () => {
    for (const surface of surfaces) {
      const source = read(surface);

      expect(source).not.toContain("video/mp4");
      expect(source).not.toMatch(/\.mp4/);
      expect(source).not.toMatch(/<video/);
      expect(source).not.toMatch(/type === "video"/);
    }
  });

  it("renders a Moment's media only through components the project already had", () => {
    const parts = read("components/social/SocialMomentParts.tsx");
    const carousel = read("components/moments/MomentMediaCarousel.tsx");

    // Reused, not forked. A grid tile previews a video with the existing poster;
    // a surface with room to play one hands it to the existing player. A second
    // implementation of either would be a second set of playback rules.
    expect(parts).toContain("isVideoMedia");
    expect(parts).toContain('from "@/components/moments/VideoPoster"');
    expect(carousel).toContain('from "@/components/moments/MomentVideoPlayer"');

    // And the tile never becomes a player of its own.
    expect(parts).not.toContain("MomentVideoPlayer");
  });
});
