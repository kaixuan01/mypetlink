// @vitest-environment jsdom

/**
 * What a Community surface shows while it waits.
 *
 * The defect these guard against was not a missing skeleton — every surface
 * had one. It was a skeleton made of `bg-white` blocks on the shell's cream
 * ground, so "loading" and "a blank broken page" looked identical, most
 * visibly as 896px of nothing on Explore.
 *
 * So the assertions are about the two properties that made it broken: the
 * placeholder must be *tinted* against the card, and it must be *shaped* like
 * the thing that replaces it.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AccountRowSkeleton,
  MomentCardSkeleton,
  MomentStreamSkeleton,
  PetCardSkeleton,
} from "./SocialSkeletons";

afterEach(cleanup);

/** Every fill in a placeholder, so a bare white block cannot slip back in. */
function fills(root: HTMLElement) {
  return [root, ...Array.from(root.querySelectorAll("*"))]
    .map((node) => node.className)
    .filter((name): name is string => typeof name === "string")
    .flatMap((name) => name.split(/\s+/))
    .filter((token) => token.startsWith("bg-"));
}

describe("placeholders are visible against the page", () => {
  it.each([
    ["moment card", <MomentCardSkeleton key="m" />, "moment-card-skeleton"],
    ["pet card", <PetCardSkeleton key="p" />, "pet-card-skeleton"],
    ["account row", <AccountRowSkeleton key="a" />, "account-row-skeleton"],
  ])("%s uses tinted fills, never bare white", (_label, element, testId) => {
    render(element);
    const used = fills(screen.getByTestId(testId));

    // The bug, precisely: #ffffff pulsing on #fff8f2 reads as blank paper.
    expect(used).not.toContain("bg-white");
    expect(used.length).toBeGreaterThan(0);
    expect(
      used.every((token) =>
        ["bg-pet-cream", "bg-pet-border", "bg-pet-apricot"].includes(token)
      )
    ).toBe(true);
  });
});

describe("placeholders are shaped like what replaces them", () => {
  it("gives a Moment its frame, media box and action row", () => {
    render(<MomentCardSkeleton />);
    const card = screen.getByTestId("moment-card-skeleton");

    // The card's own frame, so it reads as a card rather than a hole.
    expect(card.className).toContain("brand-card");
    // The media box carries the ratio the real card resolves to; without it
    // the page still jumps when the card arrives. Measured against a running
    // card: a 256px media box at 343px wide, which is 4:3.
    expect(card.querySelector(".aspect-\\[4\\/3\\]")).not.toBeNull();
    // Header, media and footer: three bands, like the real card.
    expect(card.children.length).toBe(3);
  });

  it("gives a pet suggestion its photo and its Follow control", () => {
    render(<PetCardSkeleton />);
    const card = screen.getByTestId("pet-card-skeleton");

    expect(card.className).toContain("brand-card");
    expect(card.querySelector(".h-20.w-20")).not.toBeNull();
  });

  it("animates, but only subtly", () => {
    render(<MomentCardSkeleton />);

    const card = screen.getByTestId("moment-card-skeleton");
    expect(card.className).toContain("animate-pulse");
    // One pulse on the card, not one per bar: a placeholder that shimmers in
    // eleven places is noise, not a hint.
    expect(
      Array.from(card.querySelectorAll(".animate-pulse")).length
    ).toBe(0);
  });
});

describe("the stream placeholder", () => {
  it("announces itself as busy once, not per card", () => {
    render(<MomentStreamSkeleton />);
    const stream = screen.getByTestId("moment-stream-skeleton");

    expect(stream.getAttribute("aria-busy")).toBe("true");
    // Each card is hidden from the reader; the region says "busy" for them.
    for (const card of within(stream).getAllByTestId("moment-card-skeleton")) {
      expect(card.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("shows two cards by default and honours a count", () => {
    const { rerender } = render(<MomentStreamSkeleton />);
    expect(screen.getAllByTestId("moment-card-skeleton")).toHaveLength(2);

    rerender(<MomentStreamSkeleton count={3} />);
    expect(screen.getAllByTestId("moment-card-skeleton")).toHaveLength(3);
  });
});
