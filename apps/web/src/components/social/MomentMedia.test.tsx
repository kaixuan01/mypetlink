// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MomentMedia } from "@/components/social/SocialMomentParts";
import type {
  PublicMomentListItem,
  PublicMomentMedia,
} from "@/services/publicSocialService";

/**
 * What a Moment card draws, and what it promises.
 *
 * Community shows one item per Moment. There is no carousel and nothing swipes,
 * which is the whole reason the counter had to change: "1/4" is the shape of a
 * control, and people tried to use it as one.
 *
 * The other thing a card must get right is what kind of item it is holding. It
 * used to reach for an `<img>` every time, so a Moment whose cover was an `.mp4`
 * arrived as a broken picture with the file name printed across it. The kind
 * comes from the API, and these tests give the component the kinds the API
 * actually sends.
 *
 * jsdom does not fetch media, so none of this proves bytes were or were not
 * transferred. What it proves is the instruction given to the browser — one
 * `<img loading="lazy">`, or one `<video preload="metadata">` — which is the
 * part the component controls. The transferred-bytes side is checked in a real
 * browser and recorded separately.
 */

type Spec = Partial<PublicMomentMedia> & { type: "image" | "video" };

function moment(specs: Spec[], title = "Beach day"): PublicMomentListItem {
  return {
    id: "moment-1",
    title,
    momentDate: null,
    publishedAt: "2026-09-01T00:00:00Z",
    type: "Memory",
    caption: null,
    author: {
      handle: "tanfamily",
      displayName: "The Tan Family",
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    subjects: [],
    media: specs.map((spec, index) => ({
      id: `media-${index}`,
      url:
        spec.type === "video"
          ? `https://media.test/clip-${index}.mp4`
          : `https://media.test/photo-${index}.jpg`,
      caption: null,
      altText: `Photo ${index}`,
      sortOrder: index,
      ...spec,
    })),
    likeCount: 0,
    viewerHasLiked: false,
  } as PublicMomentListItem;
}

const photos = (count: number): Spec[] =>
  Array.from({ length: count }, () => ({ type: "image" as const }));

function video() {
  return document.querySelector("video");
}

afterEach(cleanup);

describe("MomentMedia with photos", () => {
  it("requests one image however many the Moment holds", () => {
    render(<MomentMedia moment={moment(photos(5))} />);

    // Five photos exist; one is asked for. A card that fetched all five to
    // show one would cost a reader four downloads per Moment they scroll past.
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe("https://media.test/photo-0.jpg");
  });

  it("marks the image lazy, so cards below the fold cost nothing to scroll past", () => {
    render(<MomentMedia moment={moment(photos(3))} />);

    expect(screen.getByRole("img").getAttribute("loading")).toBe("lazy");
  });

  it("says how many more photos there are without implying a swipe", () => {
    render(<MomentMedia moment={moment(photos(4))} />);

    const badge = screen.getByTestId("moment-extra-photos");

    // "+3 photos", not "1/4". The second is the shape of a carousel control
    // and promises a gesture this surface does not have.
    expect(badge.textContent).toBe("+3 photos");
    expect(badge.textContent).not.toMatch(/^\d+\s*\/\s*\d+$/);
  });

  it("names the whole set for assistive technology", () => {
    render(<MomentMedia moment={moment(photos(4))} />);

    expect(
      screen.getByTestId("moment-extra-photos").getAttribute("aria-label")
    ).toBe("4 photos in this Moment");
  });

  it("shows no photo count for a single-image Moment", () => {
    render(<MomentMedia moment={moment(photos(1))} />);

    expect(screen.queryByTestId("moment-extra-photos")).toBeNull();
  });

  it("says a photo is unavailable rather than showing a broken frame", () => {
    render(
      <MomentMedia
        moment={moment([{ type: "image", altText: "IMG_4821.jpg" }], "Ky at the vet")}
      />
    );

    fireEvent.error(screen.getByRole("img"));

    const fallback = screen.getByTestId("moment-image-unavailable");

    // A browser's own answer is the alt text in a broken box — which, for an
    // upload that was never given real alt text, is the file name.
    expect(fallback.textContent).toContain("Photo unavailable");
    expect(document.body.textContent).not.toContain("IMG_4821.jpg");
    expect(screen.queryByRole("img", { name: /ky at the vet/i })).toBeNull();
  });

  it("falls back to the title rather than an empty frame", () => {
    render(<MomentMedia moment={moment([])} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Beach day")).toBeTruthy();
  });
});

describe("MomentMedia with a video", () => {
  it("renders an mp4 as a video, never as a picture", () => {
    render(<MomentMedia moment={moment([{ type: "video" }])} />);

    // The reported bug, stated as a test: an .mp4 handed to <img> decodes as
    // nothing and the browser paints the alt text instead.
    expect(video()).toBeTruthy();
    expect(video()?.getAttribute("src")).toBe("https://media.test/clip-0.mp4");
    expect(document.querySelector('img[src$=".mp4"]')).toBeNull();
    expect(
      Array.from(document.querySelectorAll("img")).map((image) => image.src)
    ).not.toContain("https://media.test/clip-0.mp4");
  });

  it("asks for metadata only, so a grid of videos is not a grid of downloads", () => {
    render(<MomentMedia moment={moment([{ type: "video" }])} />);

    expect(video()?.getAttribute("preload")).toBe("metadata");
  });

  it("previews rather than plays", () => {
    render(<MomentMedia moment={moment([{ type: "video" }])} />);

    const element = video();

    // A tile is a preview, and the whole tile is a link to the Moment. Native
    // controls at 180px would cover the picture they exist to control, and a
    // grid where every video started at once would be a different product.
    expect(element?.hasAttribute("controls")).toBe(false);
    expect(element?.hasAttribute("autoplay")).toBe(false);
    expect(element?.muted).toBe(true);
    expect(element?.className).toContain("pointer-events-none");

    // No play button: pressing it would do nothing the card does not do.
    expect(screen.queryByRole("button", { name: /play/i })).toBeNull();
    expect(screen.getByLabelText("Video")).toBeTruthy();
  });

  it("says a video is unavailable instead of showing a broken frame", () => {
    render(<MomentMedia moment={moment([{ type: "video" }])} />);

    fireEvent.error(video()!);

    expect(screen.getByLabelText(/video preview unavailable/i)).toBeTruthy();
    expect(document.body.textContent).not.toContain(".mp4");
  });

  it("counts a video as a video in the badge", () => {
    render(
      <MomentMedia moment={moment([{ type: "image" }, { type: "video" }])} />
    );

    const badge = screen.getByTestId("moment-extra-photos");

    // "+1 photos" over a Moment whose second item is a clip is simply untrue.
    expect(badge.textContent).toBe("+1 video");
    expect(badge.getAttribute("aria-label")).toBe(
      "1 photo and 1 video in this Moment"
    );
  });

  it("says only that there is more when the rest are of both kinds", () => {
    render(
      <MomentMedia
        moment={moment([
          { type: "image" },
          { type: "image" },
          { type: "video" },
        ])}
      />
    );

    expect(screen.getByTestId("moment-extra-photos").textContent).toBe(
      "+2 more"
    );
  });
});

describe("MomentMedia alternative text", () => {
  it("never puts an upload's file name on screen", () => {
    render(
      <MomentMedia
        moment={moment(
          [{ type: "image", altText: "KyCatVideo1.mp4" }],
          "Ky at the vet"
        )}
      />
    );

    // Uploads used to seed alt text from the chosen file, and a browser paints
    // alt text the moment the image behind it fails to load.
    expect(screen.getByRole("img").getAttribute("alt")).toBe("Ky at the vet");
  });

  it("keeps alternative text a person actually wrote", () => {
    render(
      <MomentMedia
        moment={moment([{ type: "image", altText: "Mochi asleep in a sunbeam" }])}
      />
    );

    expect(screen.getByRole("img").getAttribute("alt")).toBe(
      "Mochi asleep in a sunbeam"
    );
  });

  it("names a video for someone who cannot see it", () => {
    render(
      <MomentMedia
        moment={moment([{ type: "video", altText: "clip.mp4" }], "Buddy swims")}
      />
    );

    expect(video()?.getAttribute("aria-label")).toBe("Buddy swims");
  });
});
