// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SocialPetCard as SocialPetCardModel,
  SocialSpeciesOption,
} from "@/services/socialDiscoveryService";

const mocks = vi.hoisted(() => ({
  getSuggestedPets: vi.fn(),
  getExploreMoments: vi.fn(),
  getSocialSpecies: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/explore",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");

  return {
    ...actual,
    getSuggestedPets: (...a: unknown[]) => mocks.getSuggestedPets(...a),
    getExploreMoments: (...a: unknown[]) => mocks.getExploreMoments(...a),
    getSocialSpecies: (...a: unknown[]) => mocks.getSocialSpecies(...a),
  };
});

const { SocialExploreView } = await import(
  "@/components/social/SocialExploreView"
);

/**
 * How Explore is composed, at every width.
 *
 * The page used to cap itself at a 768px reading measure inside a canvas of
 * 1230, which left a 248px suggestion tile standing in a field of empty and put
 * the heading on one vertical line and the Moments on another. The fix is not a
 * wider page: it is three decisions — a browsing-width container, suggestions
 * that count columns against the room they actually have, and a reading column
 * for the Moments alone.
 *
 * jsdom has no layout, so nothing here claims a pixel. These assert the rules;
 * the widths they produce were measured in a real browser.
 */

const web = join(__dirname, "..", "..", "..");
const read = (relative: string) => readFileSync(join(web, "src", relative), "utf8");

const species: SocialSpeciesOption[] = [
  { species: "Cat", label: "Cats", petCount: 2 },
];

function pet(name: string, handle: string): SocialPetCardModel {
  return {
    name,
    species: "Cat",
    customSpecies: null,
    breed: "British Shorthair",
    publicSlug: `${name.toLowerCase()}-pub${name.toLowerCase()}`,
    photoThumbnailUrl: null,
    lostModeEnabled: false,
    owner: {
      handle,
      displayName: `The ${handle} Family`,
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    viewerFollowsOwner: false,
  };
}

beforeEach(() => {
  mocks.getSocialSpecies.mockResolvedValue(species);
  mocks.getSuggestedPets.mockResolvedValue([
    pet("Mochi", "tanfamily"),
    pet("Biscuit", "teohfamily"),
    pet("Coco", "rahmanpets"),
  ]);
  mocks.getExploreMoments.mockResolvedValue({ items: [], nextCursor: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const view = () => read("components/social/SocialExploreView.tsx");

describe("the page container", () => {
  it("is a browsing width on desktop, not a reading width", () => {
    // max-w-3xl is 768: a measure for prose, and the reason a 1230px canvas
    // showed 460px of nothing down the sides.
    expect(view()).toContain('className="mx-auto w-full max-w-5xl pt-6"');
    // The old cap is named in the comment above it, so this looks for the class.
    expect(view()).not.toContain('max-w-3xl pt-6');
  });

  it("keeps the toolbar, the suggestions and the heading on one left edge", async () => {
    render(<SocialExploreView />);
    await screen.findByTestId("explore-pets");

    // All three are direct children of the one container, so nothing can drift
    // onto a second vertical line the way the old centred Moments column did.
    const container = screen
      .getByRole("heading", { name: "Explore pets" })
      .closest("div.max-w-5xl") as HTMLElement;

    expect(container).toBeTruthy();
    expect(within(container).getByTestId("explore-pets")).toBeTruthy();
    expect(within(container).getByTestId("species-filter-trigger")).toBeTruthy();
  });
});

describe("the toolbar", () => {
  it("holds the title and both controls in one row", async () => {
    render(<SocialExploreView />);
    await screen.findByTestId("explore-pets");

    const header = screen
      .getByRole("heading", { name: "Explore pets" })
      .closest("header") as HTMLElement;

    // The filter used to sit in its own block underneath, which read as three
    // stacked left-aligned rows rather than one set of controls.
    expect(within(header).getByTestId("species-filter-trigger")).toBeTruthy();
    expect(within(header).getByTestId("explore-search-trigger")).toBeTruthy();
  });

  it("lets the controls drop to their own row on a phone", () => {
    // A species name and a Search button will not share 358px without one of
    // them truncating, so the controls wrap as a pair instead.
    expect(view()).toContain("order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto");
  });

  it("keeps Search visually secondary to the title", async () => {
    render(<SocialExploreView />);

    const search = await screen.findByTestId("explore-search-trigger");

    // A bordered white pill, not a filled primary button competing with the H1.
    expect(search.className).toContain("border-pet-border");
    expect(search.className).toContain("bg-white");
    expect(search.className).not.toContain("bg-pet-teal");
  });
});

describe("suggested pets", () => {
  it("counts columns against its own width, not the window's", () => {
    // The two shells do not offer the same canvas: at a 1024px window an
    // anonymous visitor has ~960px here and a signed-in owner ~670 once the
    // sidebar is out. A viewport rule would put three columns into both.
    expect(view()).toContain("@container");
    expect(view()).toContain("@2xl:grid-cols-2");
    expect(view()).toContain("@4xl:grid-cols-3");
    expect(view()).not.toContain("sm:grid-cols-3");
  });

  it("gives a lone suggestion the row to itself, with a measure", async () => {
    mocks.getSuggestedPets.mockResolvedValue([pet("Mochi", "tanfamily")]);
    render(<SocialExploreView />);

    const list = await screen.findByTestId("explore-pets");

    // One card in a three-column grid is a 333px tile with 690px of nothing
    // beside it, which reads as a page that failed rather than a page with one
    // thing to say. The measure stops it becoming a banner instead.
    expect(list.className).toContain("max-w-xl");
    expect(list.className).toContain("grid-cols-1");
    expect(list.className).not.toContain("grid-cols-2");
    expect(within(list).getAllByTestId("social-pet-card")).toHaveLength(1);
  });

  it("uses the responsive grid once there is more than one", async () => {
    render(<SocialExploreView />);

    const list = await screen.findByTestId("explore-pets");

    expect(within(list).getAllByTestId("social-pet-card")).toHaveLength(3);
    expect(list.className).toContain("@2xl:grid-cols-2");
    expect(list.className).toContain("@4xl:grid-cols-3");
    expect(list.className).not.toContain("max-w-xl");
  });

  it("says so plainly when there are none", async () => {
    mocks.getSuggestedPets.mockResolvedValue([]);
    render(<SocialExploreView />);

    expect(await screen.findByTestId("explore-pets-empty")).toBeTruthy();
    expect(screen.queryByTestId("explore-pets")).toBeNull();
  });
});

describe("the suggestion card", () => {
  const card = () => read("components/social/SocialPetCard.tsx");

  it("takes its shape from the space it is given", () => {
    // A row where there is width, a column where there is not — decided by the
    // card's own container, because the feed's 184px shelf and Explore's 333px
    // grid are both "desktop" and need opposite answers.
    expect(card()).toContain("@container");
    expect(card()).toContain("@max-[15rem]:flex-col");

    // No viewport breakpoints left to disagree with the container.
    expect(card()).not.toMatch(/\bsm:/);
  });

  it("still leads with the pet and names the household", async () => {
    render(<SocialExploreView />);

    const first = (await screen.findAllByTestId("social-pet-card"))[0];

    expect(within(first).getByText("Mochi")).toBeTruthy();
    expect(first.textContent).toContain("@tanfamily");
    expect(within(first).getByTestId("follow-button-signin")).toBeTruthy();
  });
});

describe("latest moments", () => {
  it("keeps a reading column inside the wider page", () => {
    // The page is for browsing; the Moments are the one thing here that is
    // actually read, so they alone keep the feed measure.
    expect(view()).toContain('className="mx-auto mt-10 w-full max-w-xl"');
  });

  it("matches the home feed's column exactly", () => {
    // Same card, same width, so a Moment is the same object on both surfaces.
    expect(read("components/social/SocialFeedView.tsx")).toContain("max-w-xl");
  });

  it("keeps the heading with the column it belongs to", async () => {
    render(<SocialExploreView />);

    const heading = await screen.findByRole("heading", {
      name: "Latest Moments",
    });
    const section = heading.closest("section") as HTMLElement;

    // Heading and cards share one centred column, rather than a full-width
    // heading sitting above an offset card.
    expect(section.className).toContain("max-w-xl");
    expect(section.className).toContain("mx-auto");
  });

  it("still renders the shared full card, not a catalogue tile", () => {
    expect(view()).toContain("SocialMomentStream");
    expect(view()).not.toContain("PublicMomentGrid");
    expect(read("components/social/SocialMomentStream.tsx")).toContain(
      "SocialMomentCard"
    );
  });
});

describe("what this layout must not disturb", () => {
  it("leaves paging and its sentinel alone", async () => {
    render(<SocialExploreView />);
    await screen.findByTestId("explore-pets");

    // Width is not a paging input: the same hook, the same cursor call.
    expect(view()).toContain("useMomentPages");
    await waitFor(() =>
      expect(mocks.getExploreMoments).toHaveBeenCalledWith("all", undefined)
    );
    expect(view()).not.toMatch(/pageSize|limit\s*[:=]/);
  });

  it("keeps one species selector and no chip row", async () => {
    render(<SocialExploreView />);

    expect(await screen.findByTestId("species-filter-trigger")).toBeTruthy();
    expect(screen.queryByTestId("explore-species")).toBeNull();
    expect(view()).not.toContain("SpeciesChip");
  });
});
