// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowButton } from "@/components/social/FollowButton";
import { PetSocialAttribution } from "@/components/social/PetSocialAttribution";
import type { OwnerRelationship } from "@/services/socialGraphService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/p/topu-pubtopu",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * The Pet Public Profile on a screen with room to spare.
 *
 * The defect: on a 1440px desktop the household's identity rendered as one
 * character per line — "S… / G… / @…" — while the browser had over a thousand
 * pixels going unused. Three things compounded, and the arithmetic is worth
 * keeping because none of them is visible from the markup alone.
 *
 * The attribution sat inside a `max-w-sm` wrapper: 384px, a width chosen for the
 * stacked phone layout and never released when the card became a horizontal row
 * at `sm`. Inside it the Follow button read "Follow @gbbsoftwaresolutions" —
 * 264px of intrinsic width that refused to shrink. The identity was `flex-1`,
 * which means a basis of zero and permission to shrink below its own content, so
 * it absorbed the entire shortfall: 384 − 24 padding − 264 button − 12 gap left
 * 84px for an avatar, a gap and three lines of text.
 *
 * jsdom measures none of that. What it can hold is the three decisions that
 * produced it, so none of them comes back.
 */

const sharedBy = {
  handle: "gbbsoftwaresolutions",
  displayName: "GBB Software Solutions",
  avatarUrl: null,
  avatarThumbnailUrl: null,
};

function relationship(overrides: Partial<OwnerRelationship> = {}): OwnerRelationship {
  return {
    isFollowing: false,
    isSelf: false,
    canFollow: true,
    allowsFollowers: true,
    followerCount: 0,
    ...overrides,
  } as OwnerRelationship;
}

function renderCard(overrides: Partial<typeof sharedBy> = {}) {
  const author = { ...sharedBy, ...overrides };

  return render(
    <PetSocialAttribution
      action={
        <FollowButton
          displayName={author.displayName}
          handle={author.handle}
          onChange={vi.fn()}
          relationship={relationship()}
          signedIn
        />
      }
      sharedBy={author}
    />
  );
}

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");
const profile = read("components/marketing/PublicSharePetProfile.tsx");

afterEach(cleanup);

describe("the attribution card's width", () => {
  it("is capped for the stacked phone layout and released for the row", () => {
    // The cap is what made a 1440px desktop behave like a 384px one. It stays
    // where it helps — a narrow column reads well on a phone — and goes where
    // it was never meant to apply.
    expect(profile).toContain('className="mx-auto mt-4 max-w-sm text-left sm:max-w-none"');
  });

  it("lets the identity column grow rather than only shrink", () => {
    renderCard();

    const label = screen.getByText("Shared by");
    const column = label.parentElement;

    // flex-1 gives it a basis of zero, so it may shrink below its content; the
    // min-w-0 lets it truncate instead of forcing the row wider. Together they
    // are only safe when nothing beside them is oversized — which is why the
    // button's width is pinned down separately below.
    expect(column?.className).toContain("flex-1");
    expect(column?.className).toContain("min-w-0");
  });

  it("stacks on a phone and sits in a row from sm up", () => {
    renderCard();

    const card = screen.getByTestId("pet-social-attribution");

    // The mobile layout is the one that was already good; it is preserved here
    // rather than replaced by the desktop arrangement.
    expect(card.className).toContain("grid");
    expect(card.className).toContain("sm:flex");
    expect(card.className).toContain("sm:items-center");
  });

  it("keeps the avatar at a fixed size whatever the identity does", () => {
    const { container } = renderCard();

    expect(container.querySelector(".h-11.w-11")?.className).toContain("shrink-0");
  });

  it("never conceals the collapse with clipped overflow", () => {
    const card = renderCard().container.querySelector(
      '[data-testid="pet-social-attribution"]'
    );

    expect(card?.className).not.toContain("overflow-hidden");
    expect(card?.className).not.toContain("overflow-x-hidden");
  });
});

describe("the Follow action", () => {
  it("says Follow, at every width", () => {
    renderCard();

    const button = screen.getByTestId("follow-button");

    // 264px of button beside a 384px card is what left 26px for the text. The
    // handle is printed directly above it, so the label buys nothing.
    expect(button.textContent?.trim()).toBe("Follow");
    expect(button.textContent).not.toContain("@");
  });

  it("still names the household it acts on", () => {
    renderCard();

    // The thing that stops anyone thinking they followed the pet is the
    // accessible name and the byline, not a second copy of the handle.
    expect(screen.getByTestId("follow-button").getAttribute("aria-label")).toBe(
      "Follow GBB Software Solutions (@gbbsoftwaresolutions)"
    );
  });

  it("says Follow to a signed-out visitor too", () => {
    render(
      <FollowButton
        displayName={sharedBy.displayName}
        handle={sharedBy.handle}
        onChange={vi.fn()}
        relationship={relationship()}
        signedIn={false}
      />
    );

    expect(screen.getByTestId("follow-button-signin").textContent?.trim()).toBe(
      "Follow"
    );
  });

  it("has no surface that can reintroduce the handle", () => {
    const source = read("components/social/FollowButton.tsx");

    // The label used to vary by surface. One label means one width, and one
    // width means the identity beside it cannot be squeezed by a prop.
    expect(source).not.toContain("attribution");
    expect(source).not.toContain('surface');
  });
});

describe("long identities", () => {
  it("keeps a long display name and a long handle in their own column", () => {
    renderCard({
      displayName: "The Extraordinarily Long Pet Family Name",
      handle: "theextraordinarilylonghandle",
    });

    const label = screen.getByText("Shared by");
    const [, name, handle] = [...(label.parentElement?.children ?? [])];

    // Each truncates at the end of its own line. None wraps, and none stacks
    // into a column of characters.
    expect(label.className).toContain("whitespace-nowrap");
    expect(name.className).toContain("truncate");
    expect(handle.className).toContain("truncate");
    expect(handle.textContent).toBe("@theextraordinarilylonghandle");
  });
});

describe("the page's own width", () => {
  it("grows past its phone measurement on a wider screen", () => {
    // 576px is a phone width. Kept below `sm`, where the viewport is narrower
    // than either value and nothing changes; widened above it, where a pet page
    // at 576px looked marooned on a desktop.
    expect(profile).toContain(
      'className="mx-auto max-w-xl px-4 pb-16 pt-6 sm:max-w-2xl sm:pt-8"'
    );
  });

  it("is one container, so the hero, the actions and the tabs share a width", () => {
    const container = profile.indexOf('max-w-xl px-4 pb-16 pt-6 sm:max-w-2xl');
    const rest = profile.slice(container);

    // Everything below the hero lives inside the same element. Several widths
    // stacked vertically is what made the page read as unrelated pieces.
    expect(rest).toContain("PublicProfileOwnerControls");
    expect(rest).toContain("AboutTab");
    expect(rest).toContain("PetProfileMomentsTab");
  });
});
