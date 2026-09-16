// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MomentMedia } from "@/components/social/SocialMomentParts";
import type { PublicMomentListItem } from "@/services/publicSocialService";

/**
 * What a Moment card actually downloads, and what it promises.
 *
 * Community shows one image per Moment. There is no carousel and nothing
 * swipes, which is the whole reason the counter had to change: "1/4" is the
 * shape of a control, and people tried to use it as one.
 *
 * jsdom does not fetch images, so none of this proves bytes were or were not
 * transferred. What it proves is the instruction given to the browser — one
 * `<img>`, marked lazy — which is the part the component controls. The
 * transferred-bytes side is checked in a real browser and recorded separately.
 */

function moment(mediaCount: number): PublicMomentListItem {
  return {
    id: "moment-1",
    title: "Beach day",
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
    media: Array.from({ length: mediaCount }, (_, index) => ({
      id: `media-${index}`,
      type: "image" as const,
      url: `https://media.test/photo-${index}.jpg`,
      caption: null,
      altText: `Photo ${index}`,
      sortOrder: index,
    })),
    likeCount: 0,
    viewerHasLiked: false,
  } as PublicMomentListItem;
}

afterEach(cleanup);

describe("MomentMedia", () => {
  it("requests one image however many the Moment holds", () => {
    render(<MomentMedia moment={moment(5)} />);

    // Five photos exist; one is asked for. A card that fetched all five to
    // show one would cost a reader four downloads per Moment they scroll past.
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe("https://media.test/photo-0.jpg");
  });

  it("marks the image lazy, so cards below the fold cost nothing to scroll past", () => {
    render(<MomentMedia moment={moment(3)} />);

    expect(screen.getByRole("img").getAttribute("loading")).toBe("lazy");
  });

  it("says how many more photos there are without implying a swipe", () => {
    render(<MomentMedia moment={moment(4)} />);

    const badge = screen.getByTestId("moment-extra-photos");

    // "+3 photos", not "1/4". The second is the shape of a carousel control
    // and promises a gesture this surface does not have.
    expect(badge.textContent).toBe("+3 photos");
    expect(badge.textContent).not.toMatch(/^\d+\s*\/\s*\d+$/);
  });

  it("names the whole set for assistive technology", () => {
    render(<MomentMedia moment={moment(4)} />);

    expect(
      screen.getByTestId("moment-extra-photos").getAttribute("aria-label")
    ).toBe("4 photos in this Moment");
  });

  it("shows no photo count for a single-image Moment", () => {
    render(<MomentMedia moment={moment(1)} />);

    expect(screen.queryByTestId("moment-extra-photos")).toBeNull();
  });

  it("falls back to the title rather than an empty frame", () => {
    render(<MomentMedia moment={moment(0)} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Beach day")).toBeTruthy();
  });
});
