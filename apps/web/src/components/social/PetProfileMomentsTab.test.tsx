// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicMomentPage } from "@/services/publicSocialService";

const mocks = vi.hoisted(() => ({
  getPublicPetMoments: vi.fn(),
  likeMoment: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/p/mochi-pubmochi",
}));

vi.mock("@/services/publicSocialService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/publicSocialService")
  >("@/services/publicSocialService");

  return {
    ...actual,
    getPublicPetMoments: (...args: unknown[]) =>
      mocks.getPublicPetMoments(...args),
  };
});

vi.mock("@/services/momentLikeService", () => ({
  likeMoment: (...args: unknown[]) => mocks.likeMoment(...args),
  unlikeMoment: vi.fn(),
}));

import { PetProfileMomentsTab } from "@/components/social/PetProfileMomentsTab";

function page(
  titles: string[],
  nextCursor: string | null = null
): PublicMomentPage {
  return {
    items: titles.map((title, index) => ({
      id: `moment-${title}`,
      title,
      momentDate: null,
      publishedAt: `2026-09-0${index + 1}T00:00:00Z`,
      type: "Memory",
      caption: null,
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
          id: `media-${title}`,
          type: "image" as const,
          url: "https://media.test/thumb.jpg",
          caption: null,
          altText: "Mochi on the sofa",
          sortOrder: 0,
        },
      ],
      likeCount: 2,
      viewerHasLiked: false,
    })),
    nextCursor,
  };
}

function signIn() {
  window.localStorage.setItem(
    "mypetlink_api_auth_session",
    JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      user: { id: "viewer", email: "viewer@example.com" },
    })
  );
}

beforeEach(() => {
  mocks.getPublicPetMoments.mockResolvedValue(page(["Beach day"]));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("PetProfileMomentsTab", () => {
  it("reads the social listing for this pet", async () => {
    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    await screen.findByText("Beach day");

    expect(mocks.getPublicPetMoments).toHaveBeenCalledWith("pubmochi", undefined);
  });

  it("carries like state, the way every other social surface does", async () => {
    signIn();

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    const card = await screen.findByTestId("social-moment-card");

    expect(within(card).getByTestId("like-count").textContent).toBe("2");
  });

  it("lets a signed-in viewer like a Moment from the pet's page", async () => {
    signIn();
    mocks.likeMoment.mockResolvedValue({
      momentId: "moment-Beach day",
      likeCount: 3,
      viewerHasLiked: true,
    });

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    fireEvent.click(await screen.findByTestId("like-button"));

    await waitFor(() =>
      expect(screen.getByTestId("like-count").textContent).toBe("3")
    );
  });

  it("shows a signed-out visitor the count without a way to change it", async () => {
    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    await screen.findByTestId("social-moment-card");

    expect(screen.getByTestId("like-button-signin")).toBeTruthy();
    expect(screen.queryByTestId("like-button")).toBeNull();
  });

  it("does not repeat the household on every card of its own pet's page", async () => {
    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    await screen.findByTestId("social-moment-card");

    expect(screen.queryByTestId("moment-byline")).toBeNull();
  });

  it("pages with the cursor the server gave it", async () => {
    mocks.getPublicPetMoments
      .mockResolvedValueOnce(page(["Beach day"], "cursor-2"))
      .mockResolvedValueOnce(page(["Nap time"]));

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    fireEvent.click(await screen.findByRole("button", { name: /show more/i }));

    await waitFor(() =>
      expect(mocks.getPublicPetMoments).toHaveBeenLastCalledWith(
        "pubmochi",
        "cursor-2"
      )
    );
    expect(await screen.findByText("Nap time")).toBeTruthy();
    expect(screen.getByText("Beach day")).toBeTruthy();
  });

  it("keeps the Moments on screen when a further page fails", async () => {
    mocks.getPublicPetMoments
      .mockResolvedValueOnce(page(["Beach day"], "cursor-2"))
      .mockRejectedValueOnce(new Error("network"));

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    fireEvent.click(await screen.findByRole("button", { name: /show more/i }));

    await waitFor(() =>
      expect(mocks.getPublicPetMoments).toHaveBeenCalledTimes(2)
    );
    expect(screen.getByText("Beach day")).toBeTruthy();
  });

  it("offers a retry rather than an empty tab when the first page fails", async () => {
    mocks.getPublicPetMoments.mockRejectedValueOnce(new Error("network"));

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Beach day")).toBeTruthy();
  });

  it("says plainly when a pet has shared nothing yet", async () => {
    mocks.getPublicPetMoments.mockResolvedValue({ items: [], nextCursor: null });

    render(<PetProfileMomentsTab petName="Mochi" publicSlug="pubmochi" />);

    expect(
      await screen.findByText(/Mochi’s shared Moments will appear here\./)
    ).toBeTruthy();
  });
});
