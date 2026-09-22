// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialPetCard } from "@/components/social/SocialPetCard";
import { publicBrandLogoClass } from "@/components/brand/PublicBrandLink";
import type { SocialPetCard as SocialPetCardModel } from "@/services/socialDiscoveryService";

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
}));

/**
 * The public face of Community: its brand, and the cards a stranger meets.
 *
 * Both problems here were the same kind of problem — a shared thing that only
 * looked shared. The logo was one component with the sizing written separately
 * at every call site, so the one caller that forgot rendered it at full size.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

function pet(overrides: Partial<SocialPetCardModel> = {}): SocialPetCardModel {
  return {
    name: "Linko",
    species: "Cat",
    customSpecies: null,
    breed: "Domestic Shorthair",
    publicSlug: "linko-pub1",
    photoThumbnailUrl: null,
    lostModeEnabled: false,
    owner: {
      handle: "mypetlink",
      displayName: "MyPetLink",
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    viewerFollowsOwner: false,
    ...overrides,
  };
}

afterEach(cleanup);

describe("the public brand", () => {
  it("is one primitive, not a size written out at every call site", () => {
    const social = read("components/layouts/SocialLayout.tsx");
    const landing = read("components/layouts/PublicLayout.tsx");

    for (const source of [social, landing]) {
      expect(source).toContain("PublicBrandLink");
    }

    // The Community header had no constraint at all, which is why it rendered
    // the wordmark at its intrinsic 540x140 — a hero, above a page heading.
    expect(social).not.toMatch(/<BrandLogo\s*\/>/);
  });

  it("caps the wordmark rather than letting it run to its natural size", () => {
    for (const compact of [true, false]) {
      const className = publicBrandLogoClass(compact);

      expect(className).toContain("w-auto");
      expect(className).toMatch(/\bh-1[014]\b/);
      expect(className).toContain("max-w-[");
    }
  });

  it("gives landing and Community the same scale", () => {
    // Same helper, same arguments where the headers are alike: a visitor
    // crossing from the marketing site into Community should not see the brand
    // change size under them.
    expect(publicBrandLogoClass(true)).toContain("lg:h-14");
    expect(publicBrandLogoClass(false)).toContain("h-14");
    expect(read("components/layouts/PublicLayout.tsx")).toContain(
      "<PublicBrandLink compact={compactHeader} priority />"
    );
  });

  it("keeps the Community header's own destinations", () => {
    const social = read("components/layouts/SocialLayout.tsx");

    // Shared brand, different navigation: what the two headers are FOR differs,
    // and that is allowed to.
    expect(social).toContain("socialRoutes.explore");
    expect(social).toContain("socialRoutes.search");
    expect(social).toContain("Sign in");
    // The shared profile-creation control rather than its own wording.
    expect(social).toContain("CreateProfileCTA");
  });

  it("does not hand the anonymous header to a signed-in owner", () => {
    const social = read("components/layouts/SocialLayout.tsx");

    // An owner keeps the app shell, with the sidebar and the mode switch. The
    // brand matches; the responsibilities do not.
    expect(social).toContain("AppLayout");
    expect(social).toContain("PublicSocialHeader");
  });

  it("names the brand link for somebody who cannot see it", () => {
    expect(read("components/brand/PublicBrandLink.tsx")).toContain(
      'aria-label="MyPetLink home"'
    );
  });
});

describe("a suggested pet", () => {
  it("leads with the pet, then the household", () => {
    render(<SocialPetCard onFollowChange={vi.fn()} pet={pet()} />);

    const card = screen.getByTestId("social-pet-card");

    // Pet name heaviest, then what it is, then who shares it.
    expect(within(card).getByText("Linko").className).toContain("font-black");
    expect(card.textContent).toContain("Domestic Shorthair");
    expect(card.textContent).toContain("@mypetlink");
  });

  it("labels the handle without competing with it", () => {
    render(<SocialPetCard onFollowChange={vi.fn()} pet={pet()} />);

    const label = screen.getByText("Shared by");

    // "Shared by" says what the handle is; it is not itself the information,
    // and it used to carry the same weight as the identity it labels.
    expect(label.className).toContain("text-pet-muted");
    expect(label.className).not.toContain("font-bold");
  });

  it("offers Follow without letting it own the card", () => {
    render(<SocialPetCard onFollowChange={vi.fn()} pet={pet()} />);

    const follow = screen.getByTestId("follow-button-signin");

    // Outlined, not solid: still the brand blue and still a 40px target, but
    // no longer the loudest thing beside a pet's name.
    expect(follow.className).toContain("border-pet-teal");
    expect(follow.className).toContain("text-pet-teal");
    expect(follow.className).not.toContain("bg-pet-teal");
    expect(follow.className).toContain("min-h-10");
    expect(follow.getAttribute("aria-label")).toContain("follow");
  });

  it("keeps the solid control where Follow is the point", () => {
    // Default emphasis is unchanged, so a profile's Follow still leads.
    const button = read("components/social/FollowButton.tsx");

    expect(button).toContain('emphasis = "solid"');
    expect(button).toContain("bg-pet-teal text-white");
  });

  it("survives a long name, breed and handle without breaking out", () => {
    render(
      <SocialPetCard
        onFollowChange={vi.fn()}
        pet={pet({
          name: "Bartholomew Maximilian Fluffington III",
          breed: "Domestic Longhair Shorthair Crossbreed Extraordinaire",
          owner: {
            handle: "averyveryverylonghandleindeedhere",
            displayName: "A Very Long Household Name Indeed",
            avatarUrl: null,
            avatarThumbnailUrl: null,
          },
        })}
      />
    );

    const card = screen.getByTestId("social-pet-card");

    // Every line that can outgrow the card truncates rather than pushing it.
    for (const text of [
      "Bartholomew Maximilian Fluffington III",
      "Cat - Domestic Longhair Shorthair Crossbreed Extraordinaire",
    ]) {
      const node = within(card).queryByText(text);
      if (node) expect(node.className).toContain("truncate");
    }

    expect(card.querySelector('a[href="/u/averyveryverylonghandleindeedhere"]')?.className)
      .toContain("truncate");
    expect(screen.getByTestId("follow-button-signin")).toBeTruthy();
  });

  it("is still the compact row, not the old vertical tile", () => {
    const card = read("components/social/SocialPetCard.tsx");

    // The tile shape survives only for containers too narrow for a row — the
    // feed's shelf. Nothing here reintroduces it as the default.
    expect(card).toContain("@container");
    expect(card).toContain("@max-[15rem]:flex-col");
    expect(card).toContain("h-20 w-20");
    expect(card).not.toMatch(/\bsm:flex-col\b/);
  });

  it("keeps the photo as identity rather than as the card", () => {
    const { container } = render(
      <SocialPetCard onFollowChange={vi.fn()} pet={pet()} />
    );

    const frame = container.querySelector("span.relative");

    expect(frame?.className).toContain("h-20");
    expect(frame?.className).toContain("w-20");
    expect(frame?.className).toContain("shrink-0");
  });
});
