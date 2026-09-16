// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicMomentGrid } from "@/components/social/PublicMomentGrid";
import type { PublicMomentListItem } from "@/services/publicSocialService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * How many Moments share a row, and why it depends on what the list is for.
 *
 * Explore is discovery: every card is a household the reader has never met, so
 * it carries a title, the pets, a handle, a like count and a media badge. Two of
 * those to a phone's width stopped being content and started being product
 * tiles — titles wrapping differently card to card, handles truncated to a few
 * characters, badges fighting the play mark for the same corner.
 *
 * A profile's own grid is the opposite: one household, already known, seen at a
 * glance. Dense is right there.
 *
 * jsdom does not do layout, so these assert the instruction — the grid template
 * each list is given — and the rendered column counts are measured in a real
 * browser and recorded separately.
 */

function moment(index: number): PublicMomentListItem {
  return {
    id: `1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f${index}`,
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
    media: [
      {
        id: `media-${index}`,
        type: "image",
        url: "https://media.test/photo.jpg",
        caption: null,
        altText: null,
        sortOrder: 0,
      },
    ],
    likeCount: 0,
    viewerHasLiked: false,
  };
}

function renderGrid(presentation?: "gallery" | "discovery") {
  return render(
    <PublicMomentGrid
      emptyMessage="Nothing yet."
      hasMore={false}
      loadingMore={false}
      moments={[moment(1), moment(2), moment(3)]}
      onLikeChange={vi.fn()}
      onLoadMore={vi.fn()}
      presentation={presentation}
      signedIn={false}
    />
  );
}

function grid() {
  return screen.getByRole("list");
}

afterEach(cleanup);

describe("Explore's Latest Moments", () => {
  it("gives a phone one card per row", () => {
    renderGrid("discovery");

    expect(grid().className).toContain("grid-cols-1");
  });

  it("puts a second card alongside once there is room", () => {
    renderGrid("discovery");

    // 640px, not 768px: every phone this product sees is 430px or narrower, and
    // a single column held to 767px produced a card taller than the screen.
    expect(grid().className).toContain("sm:grid-cols-2");
    expect(grid().className).toContain("xl:grid-cols-3");
  });

  it("never starts a phone at two columns", () => {
    renderGrid("discovery");

    expect(grid().className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/);
  });
});

describe("a profile's own Moments", () => {
  it("stays dense, because it is a gallery rather than a feed", () => {
    renderGrid("gallery");

    expect(grid().className).toContain("grid-cols-2");
    expect(grid().className).toContain("sm:grid-cols-3");
  });

  it("is what a grid renders when nobody says otherwise", () => {
    renderGrid();

    expect(grid().className).toContain("grid-cols-2");
  });
});

describe("Explore asks for the same page of Moments either way", () => {
  it("changes no paging behaviour by changing its columns", async () => {
    const source = (
      await import("node:fs")
    ).readFileSync(
      (await import("node:path")).join(__dirname, "SocialExploreView.tsx"),
      "utf8"
    );

    // A layout change must not become a data change: the cursor, the page size
    // and the load-more control are untouched by how many cards share a row.
    expect(source).toContain("useMomentPages");
    expect(source).not.toMatch(/limit\s*[:=]/);
    expect(source).not.toContain("pageSize");
  });

  it("holds a placeholder in the shape the real cards arrive in", async () => {
    const source = (
      await import("node:fs")
    ).readFileSync(
      (await import("node:path")).join(__dirname, "SocialExploreView.tsx"),
      "utf8"
    );

    // Otherwise the page reflows from two placeholder columns into one column
    // of cards the moment the data lands.
    expect(source).toContain("grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3");
  });
});
