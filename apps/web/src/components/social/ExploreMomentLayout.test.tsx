// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicMomentGrid } from "@/components/social/PublicMomentGrid";
import { SocialMomentStream } from "@/components/social/SocialMomentStream";
import type { PublicMomentListItem } from "@/services/publicSocialService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * The same Moment, wherever it is found.
 *
 * Home drew a Moment as social content — the pets, the household, when it was
 * published, a swipeable media viewer, a like, a title, a caption. Explore drew
 * the same Moment as a catalogue tile: a cropped square, a two-line title, no
 * timestamp at all. One object, two unrelated kinds of thing, depending on which
 * tab you happened to find it in.
 *
 * They now share one card. What still differs is the only thing that should: the
 * query behind them. A profile's Moments stay a grid of tiles, because a gallery
 * of one household's work is a different job from reading a stream.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

function moment(index: number): PublicMomentListItem {
  return {
    id: `1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f${index}`,
    title: "Beach day",
    momentDate: null,
    publishedAt: "2026-09-01T00:00:00Z",
    type: "Memory",
    caption: "A bright afternoon by the water.",
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

afterEach(cleanup);

describe("Home and Explore", () => {
  it("both render the stream of full cards", () => {
    const explore = read("components/social/SocialExploreView.tsx");
    const feed = read("components/social/SocialFeedView.tsx");

    for (const view of [explore, feed]) {
      expect(view).toContain("SocialMomentStream");
    }

    // And neither keeps a list of its own to drift from the other.
    expect(feed).not.toContain("<SocialMomentCard");
    expect(explore).not.toContain("<SocialMomentCard");
  });

  it("no longer sends Explore through the tile grid", () => {
    const explore = read("components/social/SocialExploreView.tsx");

    // The narrow card is the thing being replaced; Explore must not reach it.
    expect(explore).not.toContain("PublicMomentGrid");
    expect(explore).not.toContain("SocialMomentTile");
  });

  it("puts one card per row, with the page's own margins", () => {
    render(
      <SocialMomentStream
        analyticsSource="explore"
        hasMore={false}
        loadingMore={false}
        moments={[moment(1), moment(2)]}
        now={Date.parse("2026-09-01T03:00:00Z")}
        onLikeChange={vi.fn()}
        onLoadMore={vi.fn()}
        signedIn={false}
      />
    );

    const stream = screen.getByTestId("social-moment-stream");

    // A column at every width. Two 250px cards side by side is the catalogue
    // layout this replaces, and readability beats filling the horizontal space.
    expect(stream.className).toContain("grid");
    expect(stream.className).not.toMatch(/grid-cols-\d/);
    expect(screen.getAllByTestId("social-moment-card")).toHaveLength(2);
  });

  it("opens the Moment whether or not it has media", () => {
    // The tile Explore used to draw stretched a link across itself, so every
    // Moment was openable. The full card links from its title — and a Moment
    // with no media draws its title inside the media frame instead, so the card
    // had no link to the Moment at all. Unifying the two surfaces would have
    // spread that from Home to Explore rather than fixing it.
    const withMedia = moment(1);
    const withoutMedia = { ...moment(2), media: [] };

    render(
      <SocialMomentStream
        analyticsSource="explore"
        hasMore={false}
        loadingMore={false}
        moments={[withMedia, withoutMedia]}
        now={Date.parse("2026-09-01T03:00:00Z")}
        onLikeChange={vi.fn()}
        onLoadMore={vi.fn()}
        signedIn={false}
      />
    );

    for (const item of [withMedia, withoutMedia]) {
      expect(
        document.querySelector(`a[href="/moments/${item.id}"]`)
      ).toBeTruthy();
    }
  });

  it("gives both surfaces the same card, header and like control", () => {
    render(
      <SocialMomentStream
        analyticsSource="explore"
        hasMore={false}
        loadingMore={false}
        moments={[moment(1)]}
        now={Date.parse("2026-09-01T03:00:00Z")}
        onLikeChange={vi.fn()}
        onLoadMore={vi.fn()}
        signedIn={false}
      />
    );

    // The pieces Explore used to do differently or not at all.
    expect(screen.getByTestId("moment-byline")).toBeTruthy();
    expect(screen.getByTestId("moment-age")).toBeTruthy();
    expect(screen.getByTestId("moment-title")).toBeTruthy();
    expect(screen.getByText("A bright afternoon by the water.")).toBeTruthy();
    expect(screen.getByTestId("like-button-signin")).toBeTruthy();
  });
});

describe("a profile's Moments", () => {
  it("stay a compact grid", () => {
    render(
      <PublicMomentGrid
        emptyMessage="Nothing yet."
        hasMore={false}
        loadingMore={false}
        moments={[moment(1), moment(2), moment(3)]}
        onLikeChange={vi.fn()}
        onLoadMore={vi.fn()}
        signedIn={false}
      />
    );

    const grid = screen.getByRole("list");

    // A gallery, not a feed: one household's body of work at a glance.
    expect(grid.className).toContain("grid-cols-2");
    expect(grid.className).toContain("sm:grid-cols-3");
    expect(screen.getAllByTestId("social-moment-tile")).toHaveLength(3);
  });

  it("is what the profile surfaces still use", () => {
    for (const view of [
      "components/social/OwnerSocialProfileView.tsx",
      "components/social/PublicMomentGrid.tsx",
    ]) {
      expect(read(view)).toMatch(/PublicMomentGrid|SocialMomentTile/);
    }
  });
});

describe("Explore keeps its own data and its own telemetry", () => {
  const explore = read("components/social/SocialExploreView.tsx");

  it("still asks the discovery query, not the feed", () => {
    expect(explore).toContain("getExploreMoments");
    expect(explore).not.toContain("getSocialFeed");
  });

  it("changes no paging behaviour by changing its cards", () => {
    expect(explore).toContain("useMomentPages");
    expect(explore).not.toMatch(/limit\s*[:=]/);
    expect(explore).not.toContain("pageSize");
  });

  it("does not report itself as the feed", () => {
    // Shared presentation must not become shared, wrong telemetry.
    expect(explore).toContain("social_explore_viewed");
    expect(explore).not.toContain("social_feed_viewed");
    expect(read("components/social/SocialMomentStream.tsx")).not.toContain(
      "trackEvent"
    );
  });

  it("reads a Moment at the same measure on both surfaces", () => {
    // The card was shared before its column was: Explore's page is wider than
    // the feed's, because three suggested pets sit above it, and the Moments
    // underneath inherited that width and came out 768px against the feed's
    // 576px. Same card, two sizes, which is the defect one step along.
    expect(explore).toContain('className="mx-auto mt-10 w-full max-w-xl"');
    expect(read("components/social/SocialFeedView.tsx")).toContain("max-w-xl");

    // The pets above keep the wider page: a row of three is a different job,
    // and that page has since widened again to a browsing measure so the
    // suggestions stop standing in a field of empty.
    expect(explore).toContain('className="mx-auto w-full max-w-5xl pt-6"');
  });

  it("does not fetch a whole page of Moments' media at once", () => {
    // Explore's tiles were lazy. The full card draws its media through the
    // carousel, which was written for one Moment on its own page and loaded
    // eagerly — fine for one, fifteen immediate image requests for a stream.
    const carousel = read("components/moments/MomentMediaCarousel.tsx");
    const carouselImages = carousel.split("<img").slice(1);

    expect(carouselImages.length).toBeGreaterThan(0);
    for (const image of carouselImages) {
      expect(image.slice(0, image.indexOf("/>"))).toContain('loading="lazy"');
    }

    // And only the item being looked at is rendered, so a four-photo Moment
    // still costs one request until somebody swipes.
    expect(carousel).toContain("activeItem");
    expect(carousel.includes("media.map")).toBe(true);
    expect(carousel.split("media.map")[1].slice(0, 200)).not.toContain("<img");
  });

  it("holds a placeholder shaped like the cards that follow it", () => {
    // The placeholder used to be two bare `bg-white` rectangles on a cream
    // page, which is a screen of apparently blank document rather than a
    // loading state. It is now the Moment card's own skeleton.
    expect(explore).toContain("<MomentStreamSkeleton");
    expect(explore).not.toContain('animate-pulse rounded-[1.5rem] bg-white');
  });
});
