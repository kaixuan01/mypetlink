// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialMomentCard } from "@/components/social/SocialMomentCard";
import type { PublicMomentListItem } from "@/services/publicSocialService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/**
 * A full-width Moment card: the feed, Explore's Latest Moments, a pet's page.
 *
 * It used to open the Moment from its title alone. The photo opened a
 * full-screen viewer and the caption did nothing, so the natural tap — on the
 * picture, or on the words — never reached the Moment's page.
 *
 * The rule now: the parts that ARE the Moment open the Moment; the parts that
 * belong to something else keep doing only that. jsdom cannot hit-test, so the
 * geometry (the stretched title link covering the caption) is asserted as the
 * instruction here and confirmed in a real browser separately.
 */

const momentId = "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9";
const momentHref = `/moments/${momentId}`;

function moment(overrides: Partial<PublicMomentListItem> = {}): PublicMomentListItem {
  return {
    id: momentId,
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
    subjects: [
      {
        name: "Mochi",
        publicSlug: "mochi-pubmochi",
        photoUrl: null,
        isPrimarySubject: true,
        lostModeEnabled: false,
      },
    ],
    media: [0, 1, 2].map((index) => ({
      id: `media-${index}`,
      type: "image" as const,
      url: `https://media.test/photo-${index}.jpg`,
      caption: null,
      altText: `Mochi on the sand ${index + 1}`,
      sortOrder: index,
    })),
    likeCount: 2,
    commentCount: 5,
    viewerHasLiked: false,
    ...overrides,
  };
}

function renderCard(overrides: Partial<PublicMomentListItem> = {}) {
  return render(
    <SocialMomentCard
      moment={moment(overrides)}
      onLikeChange={vi.fn()}
      signedIn
    />
  );
}

afterEach(() => {
  cleanup();
});

describe("Moment card navigation", () => {
  it("opens the Moment from its title", () => {
    renderCard();

    const title = within(screen.getByTestId("moment-title")).getByRole("link", {
      name: "Beach day",
    });

    expect(title.getAttribute("href")).toBe(momentHref);
  });

  it("opens the Moment from its caption too, through the title's own link", () => {
    renderCard();

    const body = screen.getByTestId("moment-card-body");
    const title = within(body).getByRole("link", { name: "Beach day" });

    // The title's link is stretched over this block and only this block.
    expect(body.className).toContain("relative");
    expect(title.className).toContain("after:absolute");
    expect(title.className).toContain("after:inset-0");
    expect(within(body).getByText("A bright afternoon by the water.")).toBeTruthy();
  });

  it("opens the Moment from the photo", () => {
    renderCard();

    const photo = screen.getByTestId("moment-media-open");

    expect(photo.tagName).toBe("A");
    expect(photo.getAttribute("href")).toBe(momentHref);
    // It still describes the photo to anyone who reaches it.
    expect(photo.getAttribute("aria-label")).toContain("Mochi on the sand 1");
  });

  it("keeps full screen on its own control", () => {
    renderCard();

    const expand = screen.getByRole("button", { name: "Expand image 1 of 3" });

    expect(expand.closest("a")).toBeNull();
    fireEvent.click(expand);
    expect(screen.getByRole("dialog", { name: /media viewer/ })).toBeTruthy();
  });

  it("keeps the carousel controls on the carousel", () => {
    renderCard();

    const next = screen.getByRole("button", { name: "Next media" });
    const dot = screen.getByRole("button", { name: "Show image 3 of 3" });

    expect(next.closest("a")).toBeNull();
    expect(dot.closest("a")).toBeNull();

    fireEvent.click(next);

    expect(screen.getByText("Showing image 2 of 3")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open the Moment at the end of a swipe", () => {
    renderCard();

    const carousel = screen.getByRole("region", { name: /media carousel/ });
    fireEvent.pointerDown(carousel, { clientX: 220, clientY: 150 });
    fireEvent.pointerUp(carousel, { clientX: 100, clientY: 154 });

    // The click a touch swipe produces must be swallowed, not followed.
    const followed = fireEvent.click(screen.getByTestId("moment-media-open"));

    expect(followed).toBe(false);
    expect(screen.getByText("Showing image 2 of 3")).toBeTruthy();
  });

  it("keeps Like on Like", () => {
    renderCard();

    const like = screen.getByTestId("like-button");

    expect(like.closest("a")).toBeNull();
    // Outside the block the title's link is stretched across.
    expect(screen.getByTestId("moment-card-body").contains(like)).toBe(false);
  });

  it("opens Comments without changing the card's other navigation", () => {
    renderCard();

    const comments = screen.getByTestId("moment-comment-action");
    expect(comments.getAttribute("href")).toBe(`${momentHref}#comments`);
    expect(comments.getAttribute("aria-label")).toBe(
      "Comments on Beach day. 5 comments."
    );
    expect(comments.textContent).toBe("5");
    expect(screen.getByTestId("moment-card-body").contains(comments)).toBe(false);
  });

  it("sends the household's name to the household, not the Moment", () => {
    renderCard();

    const household = screen.getByRole("link", { name: /The Tan Family/ });

    expect(household.getAttribute("href")).toBe("/u/tanfamily");
    expect(screen.getByTestId("moment-card-body").contains(household)).toBe(false);
  });

  it("gives the keyboard exactly one stop for the Moment", () => {
    renderCard();

    const card = screen.getByTestId("social-moment-card");
    const tabbableToMoment = [...card.querySelectorAll("a")].filter(
      (link) =>
        link.getAttribute("href") === momentHref &&
        link.getAttribute("tabindex") !== "-1"
    );

    expect(tabbableToMoment).toHaveLength(1);
    expect(tabbableToMoment[0].textContent).toBe("Beach day");
  });

  it("never nests one interactive element inside another", () => {
    renderCard();

    const card = screen.getByTestId("social-moment-card");
    const interactive = card.querySelectorAll("a, button");

    for (const element of interactive) {
      expect(element.parentElement?.closest("a, button")).toBeNull();
    }
  });

  it("opens a text-only Moment from its frame and its caption", () => {
    renderCard({ media: [] });

    const links = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === momentHref);
    const cover = screen.getByTestId("moment-card-body-open");

    // One real link (the frame, named by the title) plus a pointer-only cover
    // over the caption that adds no second name or Tab stop.
    expect(links).toHaveLength(1);
    expect(cover.getAttribute("href")).toBe(momentHref);
    expect(cover.getAttribute("aria-hidden")).toBe("true");
    expect(cover.getAttribute("tabindex")).toBe("-1");
    expect(cover.textContent).toBe("");
  });

  it("leaves a video's surface to the video", () => {
    renderCard({
      media: [
        {
          id: "video-0",
          type: "video",
          url: "https://media.test/clip.mp4",
          caption: null,
          altText: "Mochi running",
          sortOrder: 0,
        },
      ],
    });

    expect(screen.queryByTestId("moment-media-open")).toBeNull();
    const surface = screen.getByRole("button", { name: /Play Mochi running|Pause Mochi running/ });
    expect(surface.closest("a")).toBeNull();
  });
});
