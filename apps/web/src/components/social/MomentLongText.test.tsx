// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SocialMomentCard,
  SocialMomentTile,
} from "@/components/social/SocialMomentCard";
import type { PublicMomentListItem } from "@/services/publicSocialService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/**
 * Long unbroken text in a Moment.
 *
 * A pasted link ("https://www.instagram.com/p/C9xYz…") or a title written as
 * one long word ran past the card's edge. The card clips its overflow, so the
 * end of the text was not scrollable — it was simply gone. Every surface that
 * prints a Moment's words now lets a long word break, the way Comments already
 * did (`MomentComments`, `break-words`).
 *
 * jsdom does not lay text out, so these hold the instruction; the rendered
 * wrapping is checked in a real browser at 320–1440px.
 */

const longUrl =
  "https://www.instagram.com/p/C9xYzAbCdEfGhIjKlMnOpQrStUvWxYz0123456789/?igsh=MTRsbGZ6dW5vY2Fxbw==";
const longTitle = "Linko_at_the_vet_for_her_annual_checkup_and_vaccination_2026";

function moment(overrides: Partial<PublicMomentListItem> = {}): PublicMomentListItem {
  return {
    id: "1f2e3d4c-5b6a-4978-8695-a4b3c2d1e0f9",
    title: longTitle,
    momentDate: null,
    publishedAt: "2026-09-01T00:00:00Z",
    type: "Memory",
    caption: `Booked through ${longUrl}`,
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
        type: "image" as const,
        url: "https://media.test/photo-0.jpg",
        caption: null,
        altText: "Mochi at the vet",
        sortOrder: 0,
      },
    ],
    likeCount: 0,
    commentCount: 0,
    viewerHasLiked: false,
    inCommunity: true,
    ...overrides,
  };
}

afterEach(cleanup);

describe("a Moment card with long unbroken text", () => {
  it("lets the title break inside a long word", () => {
    render(<SocialMomentCard moment={moment()} onLikeChange={vi.fn()} signedIn />);

    const title = screen.getByTestId("moment-title");

    expect(title.className).toContain("break-words");
    expect(title.textContent).toBe(longTitle);
  });

  it("lets the caption break inside a long link, keeping its line breaks", () => {
    render(<SocialMomentCard moment={moment()} onLikeChange={vi.fn()} signedIn />);

    const caption = screen.getByText(`Booked through ${longUrl}`);

    expect(caption.className).toContain("break-words");
    expect(caption.className).toContain("whitespace-pre-line");
  });

  it("lets a text-only Moment's title break inside its frame", () => {
    render(
      <SocialMomentCard
        moment={moment({ media: [] })}
        onLikeChange={vi.fn()}
        signedIn
      />
    );

    const title = screen.getByTestId("moment-media-title");

    // The frame is a grid, and a grid item will not shrink below its longest
    // word unless it is allowed to.
    expect(title.className).toContain("break-words");
    expect(title.className).toContain("min-w-0");
    expect(title.textContent).toBe(longTitle);
  });

  it("never swaps the clipping for a scroll bar", () => {
    const { container } = render(
      <SocialMomentCard moment={moment()} onLikeChange={vi.fn()} signedIn />
    );

    expect(container.innerHTML).not.toContain("overflow-x-auto");
    expect(container.innerHTML).not.toContain("overflow-x-scroll");
  });
});

describe("a Moment tile with long unbroken text", () => {
  it("lets the title break and keeps its two-line clamp", () => {
    render(<SocialMomentTile moment={moment()} onLikeChange={vi.fn()} signedIn />);

    const tile = screen.getByTestId("social-moment-tile");
    const title = within(tile).getByTestId("moment-title");
    const heading = title.closest("h3");

    // Breaking is inherited from the heading, so the clamped link breaks too.
    expect(heading?.className).toContain("break-words");
    // The clamp is what keeps every tile the same height; it stays.
    expect(title.className).toContain("line-clamp-2");
  });
});
