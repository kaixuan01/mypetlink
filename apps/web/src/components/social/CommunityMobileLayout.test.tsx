// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import type { SocialPetCard as SocialPetCardModel } from "@/services/socialDiscoveryService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * Community on a phone: who owns the page gutter, and what a suggestion looks
 * like when it has the whole width instead of half of it.
 *
 * jsdom measures nothing, so these hold the two things that produced the wasted
 * space — a second helping of horizontal padding, and a grid that kept two
 * columns on a 375px screen — and the structure of the card that replaced the
 * narrow tile. The widths themselves are measured in a real browser and
 * recorded separately.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

function pet(overrides: Partial<SocialPetCardModel> = {}): SocialPetCardModel {
  return {
    name: "Topu",
    species: "Cat",
    customSpecies: null,
    breed: "Domestic Shorthair",
    publicSlug: "topu-pubtopu",
    photoThumbnailUrl: null,
    lostModeEnabled: false,
    owner: {
      handle: "gbbsoftwaresolutions",
      displayName: "GBB Software Solutions",
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    viewerFollowsOwner: false,
    ...overrides,
  } as SocialPetCardModel;
}

function renderPet(overrides: Partial<SocialPetCardModel> = {}) {
  return render(
    <SocialPetCard onFollowChange={vi.fn()} pet={pet(overrides)} />
  );
}

afterEach(cleanup);

/**
 * The page gutter has one owner per screen.
 *
 * A Community view rendered inside the signed-in shell was getting the shell's
 * `px-4` and then adding its own, so 32px of a 375px phone went to padding
 * nobody asked for and the Moment card sat 16px inside the heading above it.
 * The shell pads; the view sets its width and its vertical rhythm.
 */
describe("the page gutter", () => {
  const views = [
    "components/social/SocialExploreView.tsx",
    "components/social/SocialSearchView.tsx",
    "components/social/OwnerSocialProfileView.tsx",
    "components/social/CommunityMyProfileView.tsx",
    "components/social/OwnerConnectionsView.tsx",
    "components/social/MomentDetailView.tsx",
  ];

  it("is never applied twice by a Community view", () => {
    for (const view of views) {
      const source = read(view);
      const roots = source.match(/className="mx-auto w-full max-w-[^"]*"/g) ?? [];

      expect(roots.length).toBeGreaterThan(0);

      for (const root of roots) {
        expect(root).not.toMatch(/\bpx-\d/);
        expect(root).not.toMatch(/\bpx-\[/);
      }
    }
  });

  it("is supplied by the two shells, and by nothing else", () => {
    expect(read("components/layouts/AppLayout.tsx")).toMatch(/<main[^>]*px-4/);
    expect(read("components/layouts/SocialLayout.tsx")).toMatch(/<main[^>]*px-4/);
  });

  it("reaches a public profile through a shell rather than a bare main", () => {
    // These pages used to render their own `<main>` and their own gutter, which
    // is also why they had no navigation. One shell now decides both.
    for (const page of [
      "app/u/[handle]/page.tsx",
      "app/u/[handle]/followers/page.tsx",
      "app/u/[handle]/following/page.tsx",
    ]) {
      const source = read(page);

      expect(source).toContain("SocialLayout");
      expect(source).not.toContain("<main");
    }
  });

  it("does the same in the runtime fallback, which serves those routes in production", () => {
    const fallback = read("components/runtime/RuntimeRouteFallback.tsx");
    const community = fallback.slice(fallback.indexOf('status === "social-profile"'));

    // A real handle never appears in the build-time params list, so in
    // production every one of them arrives through this branch.
    expect(community).toContain("<SocialLayout>");
    expect(community).not.toMatch(/<main className="min-h-screen bg-pet-cream px-4/);
  });

  it("does not reserve bottom space a shell has already reserved", () => {
    // AppLayout pads for the floating bar and SocialLayout pads for itself. A
    // view adding pb-16 on top of either is padding nobody sees.
    for (const view of views) {
      const source = read(view);
      const roots = source.match(/className="mx-auto w-full max-w-[^"]*"/g) ?? [];

      for (const root of roots) {
        expect(root).not.toContain("pb-16");
      }
    }
  });
});

describe("Explore's own lists", () => {
  const explore = read("components/social/SocialExploreView.tsx");

  it("stacks suggestions one per row on a phone", () => {
    // Columns are counted against the section's own width now, not the
    // window's, because the signed-in shell takes 288px of the window for its
    // sidebar and a viewport rule cannot tell the two canvases apart. A phone
    // is below every threshold either way, so it stays one per row.
    expect(explore).toContain("grid-cols-1 @2xl:grid-cols-2 @4xl:grid-cols-3");
  });

  it("holds placeholders in the shape the real cards arrive in", () => {
    // A two-column placeholder collapsing into one column of rows is a visible
    // reflow the moment the data lands.
    expect(explore).toContain(
      'className="mt-4 grid grid-cols-1 gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3"'
    );
    expect(explore).toContain('aria-busy="true"');
  });

  it("explains what following does without claiming the pet is followed", () => {
    expect(explore).toContain(
      "Follow a pet&rsquo;s family to see their Moments in your feed."
    );
    expect(explore).not.toContain("Following a pet follows the family");
  });
});

describe("a suggested pet", () => {
  it("is a row where there is width and a tile where there is not", () => {
    renderPet();

    const card = screen.getByTestId("social-pet-card");

    // Keyed to the card's own container rather than the window. The feed's
    // shelf gives it about 184px, where a row cannot hold a photo and a handle
    // side by side; Explore's grid gives it about 333px, where the tile shape
    // stretches a 4:5 photo into a poster. Both are "desktop" to a viewport
    // rule, which is how Explore ended up with 248x456 tiles.
    expect(card.parentElement?.className).toContain("@container");
    expect(card.className).toContain("flex");
    expect(card.className).toContain("@max-[15rem]:flex-col");
    // Padding moves from the card to the text column when it becomes a tile.
    expect(card.className).toContain("p-3");
    expect(card.className).toContain("@max-[15rem]:p-0");
  });

  it("keeps its photo small enough to stay metadata", () => {
    const { container } = renderPet();
    const frame = container.querySelector("span.relative");

    // A fixed 80px square in the row; the 4:5 crop only in the narrow tile.
    expect(frame?.className).toContain("h-20");
    expect(frame?.className).toContain("w-20");
    expect(frame?.className).toContain("@max-[15rem]:aspect-[4/5]");
    // And it never gives that square up to the identity beside it.
    expect(frame?.className).toContain("shrink-0");
  });

  it("gives the handle the width to be read", () => {
    renderPet();

    const handle = screen.getByTestId("social-pet-card")
      .querySelector('a[href="/u/gbbsoftwaresolutions"]');

    expect(handle?.textContent).toBe("Shared by @gbbsoftwaresolutions");

    // In the old tile this wrapped mid-handle because there was nowhere to put
    // it. Beside a small photo there is room, and it truncates only at the end.
    expect(handle?.className).toContain("truncate");
    expect(handle?.closest("p")?.className).toContain("min-w-0");
  });

  it("does not let Follow take the identity's width", () => {
    renderPet();

    const follow = screen.getByTestId("follow-button-signin");

    expect(follow.textContent?.trim()).toBe("Follow");
    // No handle inside the control: it is printed in full directly above it.
    expect(follow.textContent).not.toContain("@");
    // Pushed to the end of the row so the identity keeps the width it needs.
    expect(follow.closest("div")?.className).toContain("justify-end");
    expect(follow.closest("div")?.className).toContain(
      "@max-[15rem]:justify-start"
    );
  });

  it("still names the household the control acts on", () => {
    renderPet();

    expect(
      screen.getByTestId("follow-button-signin").getAttribute("aria-label")
    ).toBe("Sign in to follow GBB Software Solutions");
  });

  it("survives a long handle and a long breed", () => {
    renderPet({
      breed: "Domestic Shorthair Longhair Crossbreed",
      owner: {
        handle: "anextremelylonghouseholdhandle",
        displayName: "An Extremely Long Household Name",
        avatarUrl: null,
        avatarThumbnailUrl: null,
      },
    });

    const card = screen.getByTestId("social-pet-card");

    // Everything that can outgrow the column truncates inside it; nothing is
    // allowed to widen the card.
    expect(card.className).toContain("min-w-0");
    for (const line of card.querySelectorAll("span.truncate, a.truncate")) {
      expect(line.className).toContain("truncate");
    }
    expect(
      card.querySelector('a[href="/u/anextremelylonghouseholdhandle"]')?.textContent
    ).toBe("Shared by @anextremelylonghouseholdhandle");
  });
});
