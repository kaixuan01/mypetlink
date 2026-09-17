// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authed: false }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/services/authService", () => ({
  isOwnerAuthenticated: () => mocks.authed,
}));

// Social on, because that is the configuration this behaviour exists for. The
// off case is covered below by asserting the gate is actually wired: with the
// flag off there is no Community link to find, which is the point of it.
vi.mock("@/lib/features", async () => {
  const actual = await vi.importActual<typeof import("@/lib/features")>(
    "@/lib/features"
  );

  return {
    ...actual,
    socialEnabled: true,
    ownerProductFeatures: { ...actual.ownerProductFeatures, socialEnabled: true },
  };
});

const { PublicLayout } = await import("@/components/layouts/PublicLayout");
const { CommunityTeaser } = await import(
  "@/components/marketing/CommunityTeaser"
);
const { communityPreviewCards } = await import("@/data/communityPreview");

/**
 * Community becoming part of the public website.
 *
 * Two things had to be true at once: a visitor with no account can find and
 * browse Community, and the public site does not turn into a Social product to
 * make that possible. So Community is one navigation item and one bounded
 * landing section, and everything identity-shaped still asks you to sign in.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

function renderLayout() {
  return render(
    <PublicLayout>
      <p>Page content</p>
    </PublicLayout>
  );
}

async function settle() {
  await vi.waitFor(() => {
    expect(screen.getAllByRole("navigation").length).toBeGreaterThan(0);
  });
}

beforeEach(() => {
  mocks.authed = false;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("Community in the public navigation", () => {
  it("is offered to a visitor with no account", async () => {
    renderLayout();
    await settle();

    const community = within(screen.getByRole("banner")).getAllByRole("link", {
      name: "Community",
    });

    expect(community.length).toBeGreaterThan(0);
    expect(community[0].getAttribute("href")).toBe("/explore");
  });

  it("is offered to a signed-in owner too", async () => {
    mocks.authed = true;
    renderLayout();

    await vi.waitFor(() => {
      expect(
        screen.getAllByRole("link", { name: /open dashboard/i }).length
      ).toBeGreaterThan(0);
    });

    // Community is not behind the Dashboard. An owner who lands on the homepage
    // can reach it in one click, the same click a stranger uses.
    const header = within(screen.getByRole("banner"));
    expect(
      header.getAllByRole("link", { name: "Community" })[0].getAttribute("href")
    ).toBe("/explore");
  });

  it("groups the product pages behind one menu", async () => {
    renderLayout();
    await settle();

    const trigger = screen.getByTestId("product-menu-trigger");

    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("product-menu")).toBeNull();

    fireEvent.click(trigger);

    const menu = screen.getByTestId("product-menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent)
    ).toEqual(["Pet Profiles", "Safety Profile", "Smart Tags", "How It Works"]);
  });

  it("opens the product menu by click, not by hover", () => {
    // A hover-only menu cannot be opened from a keyboard and misbehaves on a
    // touch screen, where the first tap is a hover nobody asked for.
    const source = read("components/layouts/PublicProductMenu.tsx");

    expect(source).not.toContain("onMouseEnter");
    expect(source).not.toContain("onMouseOver");
    expect(source).toContain("onClick");
  });

  it("closes the product menu on Escape and gives focus back", async () => {
    renderLayout();
    await settle();

    const trigger = screen.getByTestId("product-menu-trigger");
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId("product-menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("product-menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes the product menu when a pointer lands elsewhere", async () => {
    renderLayout();
    await settle();

    fireEvent.click(screen.getByTestId("product-menu-trigger"));
    expect(screen.getByTestId("product-menu")).toBeTruthy();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByTestId("product-menu")).toBeNull();
  });

  it("keeps Search out of the public navigation entirely", async () => {
    renderLayout();
    await settle();

    const header = within(screen.getByRole("banner"));

    expect(header.queryByRole("link", { name: /^search$/i })).toBeNull();
    expect(
      header.queryAllByRole("link").filter((l) => l.getAttribute("href") === "/search")
    ).toHaveLength(0);
  });
});

describe("the Social kill switch", () => {
  it("decides whether Community is promoted at all", () => {
    // The flag's own job is "whether the product puts Social in front of
    // people", and a permanent header link, a homepage section and a sitemap
    // entry are the three most in-front-of-people places there are. With Social
    // off the routes still work — this only governs promotion.
    const nav = read("components/layouts/PublicNav.tsx");
    const page = read("app/page.tsx");
    const seo = read("lib/seo.ts");
    const layout = read("components/layouts/PublicLayout.tsx");

    for (const source of [nav, page, seo, layout]) {
      expect(source).toContain("socialEnabled");
    }

    expect(nav).toContain("href: socialRoutes.explore, label: \"Community\"");
    expect(page).toContain("{socialEnabled ? <CommunityTeaser /> : null}");
  });
});

describe("the mobile drawer", () => {
  function openDrawer() {
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    return document.querySelector("#public-mobile-nav") as HTMLElement;
  }

  it("collapses the product pages instead of listing everything", async () => {
    renderLayout();
    await settle();
    const drawer = within(openDrawer());

    // Collapsed by default, so the drawer is shorter than the flat list it
    // replaced even though the site gained a destination.
    const toggle = drawer.getByTestId("mobile-product-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("mobile-product-group")).toBeNull();
    expect(drawer.queryByRole("link", { name: "Smart Tags" })).toBeNull();

    fireEvent.click(toggle);

    const group = within(screen.getByTestId("mobile-product-group"));
    expect(group.getByRole("link", { name: "Pet Profiles" })).toBeTruthy();
    expect(group.getByRole("link", { name: "Smart Tags" })).toBeTruthy();
    expect(group.getByRole("link", { name: "How It Works" })).toBeTruthy();
  });

  it("keeps Community one tap away, beside the product group", async () => {
    renderLayout();
    await settle();
    const drawer = within(openDrawer());

    expect(
      drawer.getByRole("link", { name: "Community" }).getAttribute("href")
    ).toBe("/explore");
  });

  it("uses the same words as the desktop menu", async () => {
    renderLayout();
    await settle();
    const drawer = within(openDrawer());

    // No mobile-only vocabulary: "Product" means the same thing on both.
    expect(drawer.getByTestId("mobile-product-toggle").textContent).toContain(
      "Product"
    );
  });
});

describe("the landing Community section", () => {
  it("is bounded to three cards and never grows", () => {
    render(<CommunityTeaser />);

    const cards = within(screen.getByTestId("community-preview-cards")).getAllByRole(
      "listitem"
    );

    expect(cards).toHaveLength(3);
    expect(communityPreviewCards.length).toBeLessThanOrEqual(3);
  });

  it("sends the reader to Community rather than paging in place", () => {
    render(<CommunityTeaser />);

    expect(
      screen.getByRole("link", { name: /explore community/i }).getAttribute("href")
    ).toBe("/explore");

    // No feed on the homepage: nothing here loads more.
    expect(screen.queryByRole("button", { name: /load more|show more/i })).toBeNull();
  });

  it("cannot show a real pet just because its owner made it discoverable", () => {
    // The invariant this section exists to protect. A family switching Social
    // on agreed to appear inside Community — Explore, Search, their own public
    // profile. They did not agree to be the front page of the product.
    //
    // It is enforced structurally rather than by filtering: there is no query
    // here at all, so no flag an owner can toggle has any path to this page.
    const teaser = read("components/marketing/CommunityTeaser.tsx");
    const data = read("data/communityPreview.ts");

    for (const source of [teaser, data]) {
      expect(source).not.toContain("getSuggestedPets");
      expect(source).not.toContain("getExploreMoments");
      expect(source).not.toContain("getSocialFeed");
      expect(source).not.toContain("searchSocial");
      expect(source).not.toContain("IsDiscoverable");
      expect(source).not.toContain("isDiscoverable");
      expect(source).not.toContain("viewerFollowsOwner");
    }
  });

  it("does not hardcode a real pet's identity either", () => {
    // The first card used to be a copy of the configured sample pet — a real
    // name and a real photo URL under a real pet's media path. That content is
    // governed by Pet.IsSampleEligible plus an admin-chosen featured pet, so an
    // admin can withdraw it; a hardcoded copy could not be withdrawn. Marketing
    // that outlives its own approval is the defect, whoever owns the pet.
    const data = read("data/communityPreview.ts");

    // Looks for the import, since the comment above it explains what it no
    // longer uses and why.
    expect(data).not.toMatch(/from "@\/data\/publicSample"/);
    expect(data).not.toMatch(/import[\s\S]{0,80}staticSampleExperiencePet/);
    // No route into real media, and no field to paste one into.
    expect(data).not.toContain("media.mypetlink.com.my");
    expect(data).not.toContain("photoUrl");
    expect(data).not.toMatch(/https?:\/\//);
  });

  it("links no card to a real profile", () => {
    const teaser = read("components/marketing/CommunityTeaser.tsx");

    // The only destination is Explore, where real Community properly begins.
    expect(teaser).toContain("socialRoutes.explore");
    expect(teaser).not.toContain("/p/");
    expect(teaser).not.toContain("/u/");
    expect(teaser).not.toContain("/moments/");
  });

  it("shows only MyPetLink's own sample content, and says so", () => {
    render(<CommunityTeaser />);

    // Discoverability is consent to appear inside Community, not consent to be
    // marketing on the front page. Real households are one click away instead.
    const source = read("components/marketing/CommunityTeaser.tsx");
    expect(source).not.toContain("getSuggestedPets");
    expect(source).not.toContain("getExploreMoments");
    expect(source).not.toContain("useEffect");

    expect(screen.getByText(/sample pets shown to illustrate/i)).toBeTruthy();
  });

  it("invents no people and no engagement", () => {
    render(<CommunityTeaser />);

    const section = screen.getByTestId("community-preview-cards");

    // No handles, because naming a household here would either expose the
    // finder-facing identity or invent someone. No counts, because an empty
    // network that advertises numbers is lying.
    expect(section.textContent).not.toMatch(/@\w+/);
    expect(section.textContent).not.toMatch(/\d+\s*(likes?|followers?|posts?)/i);
    for (const card of communityPreviewCards) {
      expect(card).not.toHaveProperty("likeCount");
      expect(card).not.toHaveProperty("followerCount");
      expect(card).not.toHaveProperty("handle");
    }
  });

  it("cannot delay first paint or break when Community is down", () => {
    // A server component with no fetching: the homepage is the most cached page
    // in the product and must not depend on the least cacheable query in it.
    const source = read("components/marketing/CommunityTeaser.tsx");

    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("apiRequest");
  });

  it("draws its cards from brand art and the app's own avatar", () => {
    const source = read("components/marketing/CommunityTeaser.tsx");

    // Brand mascot art, or the initial avatar the app already draws for a pet
    // with no photo. Neither can reach a real pet's media, which is the point:
    // there is no image source here that an owner's upload could land in.
    expect(source).toContain("LinkoMascot");
    expect(source).toContain("PetAvatar");
    expect(source).not.toContain("SamplePetPhoto");
    expect(source).not.toContain("<img");

    // The mascot is not marked priority here, so it does not compete with the
    // hero for the first paint.
    expect(source).not.toMatch(/LinkoMascot[\s\S]{0,160}priority/);
  });
});

describe("the landing page as a whole", () => {
  const page = read("app/page.tsx");

  it("puts Community between the profiles and the tag", () => {
    const profiles = page.indexOf("<PetProfilesSection");
    const community = page.indexOf("<CommunityTeaser");
    const tag = page.indexOf("<SmartTagShowcase");

    expect(profiles).toBeGreaterThan(-1);
    expect(community).toBeGreaterThan(profiles);
    expect(tag).toBeGreaterThan(community);
  });

  it("did not simply grow another section", () => {
    // The duplicated "Safety, care and memories" block is gone: two of its
    // three columns restated the two profile cards above it, and the third —
    // Care — moved into that section instead.
    expect(page).not.toContain("Safety, care, and memories.");
    expect(page).not.toContain("const pillars");
    expect(read("components/marketing/PetProfilesSection.tsx")).toContain(
      "careDetails"
    );
  });

  it("leaves the hero as one primary and one secondary action", () => {
    const hero = read("components/marketing/LandingHero.tsx");

    expect(hero).not.toContain("Explore Community");
    expect(hero).not.toContain("socialRoutes");
    expect(hero).toContain("See a sample profile");
  });
});
