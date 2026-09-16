// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowButton } from "@/components/social/FollowButton";
import { PetSocialAttribution } from "@/components/social/PetSocialAttribution";
import type { OwnerRelationship } from "@/services/socialGraphService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/p/mochi-pubmochi",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * "Shared by" on a pet's public page.
 *
 * On a phone this card collapsed into a column of single characters — "SHARED /
 * BY / M / @" — beside a button reading "Follow @mypetlink" that had taken most
 * of the width. The cause was arithmetic, not overflow: the identity was
 * `flex-1`, meaning basis zero and free to shrink below its own content, while
 * the button was `shrink-0` and refused to give anything up. Hiding the overflow
 * would have hidden the symptom.
 *
 * jsdom does not lay anything out, so these hold the structure that makes the
 * collapse impossible rather than measuring that it no longer happens; the
 * rendered card is checked in a real browser at 320px and recorded separately.
 */

const sharedBy = {
  handle: "mypetlink",
  displayName: "MyPetLink",
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

function renderCard(handle = sharedBy.handle) {
  return render(
    <PetSocialAttribution
      action={
        <FollowButton
          displayName={sharedBy.displayName}
          handle={handle}
          onChange={vi.fn()}
          relationship={relationship()}
          signedIn
        />
      }
      sharedBy={{ ...sharedBy, handle }}
    />
  );
}

afterEach(cleanup);

describe("the identity stays readable", () => {
  it("keeps the label on one line", () => {
    renderCard();

    const label = screen.getByText("Shared by");

    // Two words breaking into a column is the symptom that made this card look
    // broken; nothing is allowed to wrap it.
    expect(label.className).toContain("whitespace-nowrap");
  });

  it("gives the identity column room to shrink without disappearing", () => {
    renderCard();

    const card = screen.getByTestId("pet-social-attribution");
    const label = screen.getByText("Shared by");
    const column = label.parentElement;

    // min-w-0 lets long text truncate instead of forcing the row wider; the
    // column is also the flexible one, so the button cannot take its space.
    expect(column?.className).toContain("min-w-0");
    expect(column?.className).toContain("flex-1");
    expect(card.className).toContain("min-w-0");
  });

  it("never hides the problem behind clipped overflow", () => {
    const card = renderCard().container.querySelector(
      '[data-testid="pet-social-attribution"]'
    );

    // The avatar clips its own image, which is a crop. The card itself must not
    // clip anything: concealing the collapse is not the same as fixing it.
    expect(card?.className).not.toContain("overflow-hidden");
    expect(card?.className).not.toContain("overflow-x-hidden");
  });

  it("stacks the action under the identity on a phone and sits it alongside later", () => {
    renderCard();

    const card = screen.getByTestId("pet-social-attribution");

    // A grid of one column on a phone; a row from `sm` up. Neither competes.
    expect(card.className).toContain("grid");
    expect(card.className).toContain("sm:flex");
    expect(card.className).toContain("sm:items-center");
  });

  it("keeps the avatar at its own size", () => {
    const { container } = renderCard();
    const avatar = container.querySelector(".h-11.w-11");

    expect(avatar?.className).toContain("shrink-0");
  });

  it("survives a long handle", () => {
    renderCard("averylonghouseholdhandle");

    const label = screen.getByText("Shared by");
    // The handle in the identity column, not the copy inside the button.
    const handle = label.parentElement?.lastElementChild;

    expect(handle?.textContent).toBe("@averylonghouseholdhandle");

    // Truncated inside its own column rather than pushing the card wider or
    // squeezing the label into a stack.
    expect(handle?.className).toContain("truncate");
    expect(label.className).toContain("whitespace-nowrap");
  });
});

describe("the Follow control", () => {
  it("says Follow, because the handle is already printed above it", () => {
    renderCard();

    const button = screen.getByTestId("follow-button");

    // At no width does the label repeat the handle. It did on wide screens, and
    // a 264px button beside a capped card is what crushed the identity to one
    // character per line on a 1440px desktop.
    expect(button.textContent?.trim()).toBe("Follow");
    expect(button.textContent).not.toContain("@");
  });

  it("names the household it acts on, at every width", () => {
    renderCard();

    expect(
      screen.getByTestId("follow-button").getAttribute("aria-label")
    ).toBe("Follow MyPetLink (@mypetlink)");
  });

  it("drops the handle once somebody is following", () => {
    render(
      <FollowButton
        displayName={sharedBy.displayName}
        handle={sharedBy.handle}
        onChange={vi.fn()}
        relationship={relationship({ isFollowing: true })}
        signedIn
      />
    );

    const button = screen.getByTestId("follow-button");

    expect(button.textContent?.trim()).toBe("Following");
    expect(button.textContent).not.toContain("@");
  });

  it("offers a signed-out visitor the same label", () => {
    render(
      <FollowButton
        displayName={sharedBy.displayName}
        handle={sharedBy.handle}
        onChange={vi.fn()}
        relationship={relationship()}
        signedIn={false}
      />
    );

    const link = screen.getByTestId("follow-button-signin");

    expect(link.textContent?.trim()).toBe("Follow");
    expect(link.textContent).not.toContain("@");
  });
});

describe("sharing a pet profile", () => {
  it("uses a share mark, not a heart", () => {
    const controls = readFileSync(
      join(__dirname, "..", "marketing", "PublicProfileOwnerControls.tsx"),
      "utf8"
    );

    // A heart means "like" everywhere else in Community. Using it for Share made
    // the two gestures read as the same one.
    expect(controls).toContain('<Icon name="share" className="h-4 w-4" />\n                  Share profile');
  });

  it("copies a link with a link mark, not a QR mark", () => {
    const share = readFileSync(
      join(__dirname, "..", "share", "ShareProfileLink.tsx"),
      "utf8"
    );

    expect(share).not.toContain('name="qr"');
    expect(share).toContain('name="link"');
  });

  it("reaches the share sheet through the one shared helper", () => {
    const moment = readFileSync(
      join(__dirname, "MomentShareButton.tsx"),
      "utf8"
    );

    expect(moment).toContain('from "@/lib/nativeShare"');
    expect(moment).not.toContain("navigator.share(");
  });
});
