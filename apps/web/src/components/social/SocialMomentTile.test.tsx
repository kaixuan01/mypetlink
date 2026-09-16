// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialMomentTile } from "@/components/social/SocialMomentCard";
import type { PublicMomentListItem } from "@/services/publicSocialService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * A grid tile: one Moment among many, at a couple of hundred pixels wide.
 *
 * Two things were wrong with it. It was inert — a photo, a title, and a badge
 * announcing three more photos nobody could reach. And it was whatever height
 * its title happened to make it, so a row of tiles looked like a mistake.
 *
 * jsdom has no layout engine, so nothing here measures a rendered pixel. What it
 * checks is the instruction: the clamp, the floor, the fixed frame, the
 * truncation. The rendered result is confirmed in a real browser at the widths
 * that matter and recorded separately.
 */

const momentId = "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9";

function moment(
  overrides: Partial<PublicMomentListItem> = {}
): PublicMomentListItem {
  return {
    id: momentId,
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
    subjects: [
      {
        name: "Mochi",
        publicSlug: "mochi-pubmochi",
        photoUrl: null,
        isPrimarySubject: true,
        lostModeEnabled: false,
      },
    ],
    media: [
      {
        id: "media-0",
        type: "image",
        url: "https://media.test/photo-0.jpg",
        caption: null,
        altText: "A dog on sand",
        sortOrder: 0,
      },
    ],
    likeCount: 2,
    viewerHasLiked: false,
    ...overrides,
  };
}

function renderTile(overrides: Partial<PublicMomentListItem> = {}, showAuthor = true) {
  return render(
    <SocialMomentTile
      moment={moment(overrides)}
      onLikeChange={vi.fn()}
      showAuthor={showAuthor}
      signedIn
    />
  );
}

afterEach(cleanup);

describe("opening a Moment from the grid", () => {
  it("makes the whole tile lead to the Moment", () => {
    renderTile();

    const link = screen.getByRole("link", { name: "Beach day" });

    expect(link.getAttribute("href")).toBe(`/moments/${momentId}`);

    // Stretched across the card rather than wrapping it: the tap target is the
    // tile, while the accessible name stays the Moment's own title.
    expect(link.className).toContain("after:absolute");
    expect(link.className).toContain("after:inset-0");
    expect(screen.getByTestId("social-moment-tile").className).toContain("relative");
  });

  it("is reachable from the keyboard", () => {
    renderTile();

    const link = screen.getByRole("link", { name: "Beach day" });
    link.focus();

    expect(document.activeElement).toBe(link);
  });

  it("keeps the controls that belong to somebody else working", () => {
    renderTile();

    const tile = screen.getByTestId("social-moment-tile");

    // A heart and a household link are not "open this Moment", so they sit
    // above the stretched link rather than under it.
    const like = within(tile).getByRole("button", { name: /like/i });
    const byline = within(tile).getByTestId("moment-byline");

    expect(like.closest(".z-10")).toBeTruthy();
    expect(byline.closest(".z-10")).toBeTruthy();
  });

  it("never nests one interactive element inside another", () => {
    renderTile();

    const tile = screen.getByTestId("social-moment-tile");

    for (const link of Array.from(tile.querySelectorAll("a"))) {
      expect(link.querySelector("a, button")).toBeNull();
    }

    for (const button of Array.from(tile.querySelectorAll("button"))) {
      expect(button.querySelector("a, button")).toBeNull();
    }
  });
});

describe("tiles that line up", () => {
  const longTitle =
    "The extremely long story of the afternoon Mochi discovered the garden hose and refused, for forty minutes, to come back inside";

  it("gives every tile the same media frame", () => {
    const { container } = renderTile();
    const frame = container.querySelector(".aspect-\\[4\\/5\\]");

    // A fixed portrait frame, filled by covering rather than fitting: pets are
    // taller than they are wide, and letterboxing one tile and not the next is
    // what makes a grid look broken.
    expect(frame).toBeTruthy();
    expect(container.querySelector("img")?.className).toContain("object-cover");
  });

  it("clamps a title to two lines and floors it at two", () => {
    renderTile({ title: longTitle });

    const link = screen.getByRole("link", { name: longTitle });

    // The clamp stops a long title from towering; the floor stops a short one
    // from leaving its neighbour's heart hanging a line lower.
    expect(link.className).toContain("line-clamp-2");
    expect(link.className).toContain("min-h-[2.5rem]");

    // And nothing may sit beside the clamp that also sets `display`. The clamp
    // works by setting `-webkit-box`; a `block` or `flex` next to it wins in the
    // cascade, the clamp silently stops applying, and the class list still reads
    // correctly — which is how this shipped once and was only caught in a real
    // browser, measuring a 180px title in a 40px slot.
    for (const competing of ["block", "flex", "inline-block", "grid"]) {
      expect(link.className.split(/\s+/)).not.toContain(competing);
    }
  });

  it("keeps the whole tile a fixed-height column whatever the title does", () => {
    renderTile({ title: longTitle });

    const tile = screen.getByTestId("social-moment-tile");

    expect(tile.className).toContain("h-full");
    expect(tile.className).toContain("flex-col");

    // The heart is pushed to the bottom rather than floating under whatever
    // the title left behind, so it lands in the same place on every tile.
    const like = within(tile).getByRole("button", { name: /like/i });
    expect(like.closest("div")?.className).toContain("mt-auto");
  });

  it("does not let a long handle widen the tile", () => {
    renderTile({
      author: {
        handle: "a-very-long-household-handle-indeed",
        displayName: "A Household With A Very Long Name Indeed",
        avatarUrl: null,
        avatarThumbnailUrl: null,
      },
    });

    const byline = screen.getByTestId("moment-byline");

    // Truncated inside a shrinkable box. Without the min-width reset, a flex
    // item refuses to go below its content and pushes the column wider.
    expect(byline.className).toContain("min-w-0");
    expect(byline.querySelector(".truncate")).toBeTruthy();
  });
});

describe("what a tile says about media it is not showing", () => {
  it("counts extra photos", () => {
    renderTile({
      media: [0, 1, 2, 3].map((index) => ({
        id: `media-${index}`,
        type: "image" as const,
        url: `https://media.test/photo-${index}.jpg`,
        caption: null,
        altText: null,
        sortOrder: index,
      })),
    });

    expect(screen.getByTestId("moment-extra-photos").textContent).toBe("+3 photos");
  });

  it("shows a video as a video, with no player in the grid", () => {
    renderTile({
      media: [
        {
          id: "media-0",
          type: "video",
          url: "https://media.test/clip-0.mp4",
          caption: null,
          altText: null,
          sortOrder: 0,
        },
      ],
    });

    const video = document.querySelector("video");

    expect(video?.getAttribute("src")).toBe("https://media.test/clip-0.mp4");
    expect(video?.hasAttribute("controls")).toBe(false);
    expect(video?.hasAttribute("autoplay")).toBe(false);
    expect(screen.getByLabelText("Video")).toBeTruthy();

    // The tile still opens the Moment; the video is not competing for the tap.
    expect(
      screen.getByRole("link", { name: "Beach day" }).getAttribute("href")
    ).toBe(`/moments/${momentId}`);
  });
});
