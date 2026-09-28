// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A pet's Share Profile Moments when the household is not in Community.
 *
 * Only `apiRequest` is replaced; the tab, the listing hook, the service and its
 * normalisation are the real ones. The API answers as it does for a household
 * outside Community: the Moment is listed (the Share Profile never depends on
 * Community) with `inCommunity: false`, no household, no pets named and no
 * Community counts. The tab used to show "couldn't load" here, because the
 * listing refused every Moment of an owner outside Community.
 */

const api = vi.hoisted(() => ({
  items: [] as unknown[],
  status: 200,
  paths: [] as string[],
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/p/olive-devolive" }));

vi.mock("@/services/apiClient", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiClient")>(
    "@/services/apiClient"
  );
  return {
    ...actual,
    apiRequest: async (path: string) => {
      api.paths.push(path);
      return { data: { items: api.items, nextCursor: null } };
    },
  };
});

// A configured API, as in production. Without one the listing never asks.
vi.mock("@/services/apiConfig", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiConfig")>(
    "@/services/apiConfig"
  );
  return { ...actual, getApiBaseUrl: () => "http://api.test", canUseApi: () => true };
});

vi.mock("@/services/momentLikeService", () => ({
  likeMoment: vi.fn(),
  unlikeMoment: vi.fn(),
}));

import { PetProfileMomentsTab } from "@/components/social/PetProfileMomentsTab";

function apiMoment(overrides: Record<string, unknown>) {
  return {
    id: "moment-park",
    title: "Park run",
    momentDate: null,
    publishedAt: "2026-09-20T00:00:00Z",
    type: "Other",
    caption: "Zoomies.",
    author: null,
    subjects: [],
    media: [],
    likeCount: 0,
    commentCount: 0,
    collaborations: [],
    viewerHasLiked: false,
    inCommunity: false,
    ...overrides,
  };
}

beforeEach(() => {
  api.items = [];
  api.paths = [];
});

afterEach(() => {
  cleanup();
});

describe("Share Profile Moments from a household outside Community", () => {
  it("shows the Moment instead of a load error", async () => {
    api.items = [apiMoment({})];

    render(<PetProfileMomentsTab petName="Olive" publicSlug="olive-devolive" />);

    const card = await screen.findByTestId("social-moment-card");
    expect(api.paths).toEqual(["/api/v1/public/pets/olive-devolive/moments"]);
    expect(card.textContent).toContain("Park run");
    expect(card.textContent).toContain("Zoomies.");
    expect(screen.queryByText(/couldn.t load/i)).toBeNull();
  });

  it("offers nothing that belongs to Community: no Moment page, likes or Comments", async () => {
    api.items = [
      apiMoment({}),
      apiMoment({
        id: "moment-sofa",
        title: "Sofa",
        caption: null,
        media: [
          {
            id: "media-1",
            type: "image",
            url: "https://media.test/sofa.jpg",
            caption: null,
            altText: "Olive on the sofa",
            sortOrder: 0,
          },
        ],
      }),
    ];

    render(<PetProfileMomentsTab petName="Olive" publicSlug="olive-devolive" />);

    const cards = await screen.findAllByTestId("social-moment-card");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelector('a[href^="/moments/"]')).toBeNull();
      expect(card.querySelector('[data-testid^="like-button"]')).toBeNull();
      expect(within(card).queryByTestId("moment-comment-action")).toBeNull();
      expect(card.getAttribute("data-in-community")).toBe("false");
    }
    expect(cards[1].textContent).toContain("Sofa");
  });

  it("keeps every Community action on a Moment that is in Community", async () => {
    api.items = [
      apiMoment({
        inCommunity: true,
        author: { handle: "tanfamily", displayName: "The Tan Family", avatarUrl: null, avatarThumbnailUrl: null },
        likeCount: 3,
      }),
    ];

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="mochi-pubmochi" />);

    const card = await screen.findByTestId("social-moment-card");
    expect(card.querySelector('a[href^="/moments/moment-park"]')).not.toBeNull();
    expect(card.querySelector('[data-testid^="like-button"]')).not.toBeNull();
    expect(within(card).getByTestId("moment-comment-action")).toBeTruthy();
    expect(card.getAttribute("data-in-community")).toBeNull();
  });

  it("treats an older response without the flag as Community, which is all it listed", async () => {
    const legacy = apiMoment({});
    delete (legacy as Record<string, unknown>).inCommunity;
    api.items = [legacy];

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="mochi-pubmochi" />);

    const card = await screen.findByTestId("social-moment-card");
    expect(card.querySelector('a[href^="/moments/"]')).not.toBeNull();
  });

  it("keeps the existing empty state for a pet with no public Moments", async () => {
    render(<PetProfileMomentsTab petName="Olive" publicSlug="olive-devolive" />);

    expect(await screen.findByText("Olive’s shared Moments will appear here.")).toBeTruthy();
    expect(screen.queryByText(/couldn.t load/i)).toBeNull();
  });
});
