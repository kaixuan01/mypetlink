// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PublicMomentPage,
  PublicOwnerProfile,
} from "@/services/publicSocialService";

const mocks = vi.hoisted(() => ({
  getPublicOwnerProfile: vi.fn(),
  getPublicOwnerMoments: vi.fn(),
  smartTagsEnabled: true,
}));

vi.mock("@/services/publicSocialService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/publicSocialService")
  >("@/services/publicSocialService");

  return {
    ...actual,
    getPublicOwnerProfile: (...args: unknown[]) => mocks.getPublicOwnerProfile(...args),
    getPublicOwnerMoments: (...args: unknown[]) => mocks.getPublicOwnerMoments(...args),
  };
});

vi.mock("@/lib/features", () => ({
  get smartTagsEnabled() {
    return mocks.smartTagsEnabled;
  },
  smartTagOrderingEnabled: false,
  publicProfilesEnabled: true,
  safetyProfilesOwnerUiEnabled: false,
  tagOrdersEnabled: false,
  ownerProductFeatures: {},
}));

import { OwnerSocialProfileView } from "@/components/social/OwnerSocialProfileView";
import { PublicProfileUnavailableError } from "@/services/publicSocialService";

const profile: PublicOwnerProfile = {
  handle: "tanfamily",
  displayName: "The Tan Family",
  bio: "Two cats, one very patient sofa.",
  avatarUrl: "https://media.test/avatar.jpg",
  avatarThumbnailUrl: "https://media.test/avatar_thumb.jpg",
  generalArea: "Petaling Jaya",
  allowFollowers: true,
  pets: [
    {
      name: "Mochi",
      species: "Cat",
      customSpecies: null,
      breed: "British Shorthair",
      publicSlug: "mochi-pubmochi",
      photoUrl: null,
      photoThumbnailUrl: null,
      hasSmartTagProtection: true,
      lostModeEnabled: false,
    },
    {
      name: "Coco",
      species: "Cat",
      customSpecies: null,
      breed: "Ragdoll",
      publicSlug: "coco-pubcoco",
      photoUrl: null,
      photoThumbnailUrl: null,
      hasSmartTagProtection: false,
      lostModeEnabled: true,
    },
  ],
};

function page(count: number, nextCursor: string | null): PublicMomentPage {
  return {
    items: Array.from({ length: count }, (_, index) => ({
      id: `m${nextCursor ?? "last"}${index}`,
      title: `Moment ${index}`,
      momentDate: null,
      publishedAt: "2026-01-01T00:00:00Z",
      type: "Memory",
      caption: null,
      subjects: [{ name: "Mochi", publicSlug: "mochi-pubmochi", photoUrl: null }],
      media: [],
    })),
    nextCursor,
  };
}

describe("OwnerSocialProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.smartTagsEnabled = true;
    mocks.getPublicOwnerProfile.mockResolvedValue(profile);
    mocks.getPublicOwnerMoments.mockResolvedValue(page(2, null));
  });

  afterEach(cleanup);

  it("shows the social identity, not an account identity", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByText("The Tan Family")).toBeTruthy());

    expect(screen.getByText("@tanfamily")).toBeTruthy();
    expect(screen.getByText(/one very patient sofa/i)).toBeTruthy();
    expect(screen.getByText("Petaling Jaya")).toBeTruthy();
  });

  it("gives the avatar an accessible name", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() =>
      expect(
        screen.getByAltText("The Tan Family profile picture")
      ).toBeTruthy()
    );
  });

  it("lists the pets the API returned and links to each pet profile", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByTestId("owner-pets-list")).toBeTruthy());

    const pets = within(screen.getByTestId("owner-pets-list"));
    expect(pets.getByRole("link", { name: /mochi/i }).getAttribute("href")).toBe(
      "/p/mochi-pubmochi"
    );
    expect(pets.getByRole("link", { name: /coco/i }).getAttribute("href")).toBe(
      "/p/coco-pubcoco"
    );
  });

  it("marks a lost pet without publishing any contact detail", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByTestId("owner-pets-list")).toBeTruthy());
    expect(screen.getByText("Missing")).toBeTruthy();

    // The status is a signal; contact stays behind the Safety Profile.
    expect(screen.queryByText(/whatsapp/i)).toBeNull();
    expect(screen.queryByText(/\+60/)).toBeNull();
  });

  it("shows the Smart Tag badge only for a protected pet", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByTestId("owner-pets-list")).toBeTruthy());

    // Mochi is protected, Coco is not.
    expect(screen.getAllByTestId("smart-tag-protected-badge")).toHaveLength(1);
  });

  it("hides the Smart Tag badge while Smart Tags are switched off", async () => {
    mocks.smartTagsEnabled = false;

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByTestId("owner-pets-list")).toBeTruthy());

    expect(screen.queryByTestId("smart-tag-protected-badge")).toBeNull();
  });

  it("loads another page of Moments on demand", async () => {
    mocks.getPublicOwnerMoments
      .mockResolvedValueOnce(page(2, "cursor-1"))
      .mockResolvedValueOnce(page(1, null));

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /show more moments/i })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: /show more moments/i }));

    await waitFor(() =>
      expect(mocks.getPublicOwnerMoments).toHaveBeenCalledWith("tanfamily", "cursor-1")
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /show more moments/i })).toBeNull()
    );
  });

  it("keeps the Moments already on screen when a further page fails", async () => {
    mocks.getPublicOwnerMoments
      .mockResolvedValueOnce(page(2, "cursor-1"))
      .mockRejectedValueOnce(new Error("network"));

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /show more moments/i })).toBeTruthy()
    );

    fireEvent.click(screen.getByRole("button", { name: /show more moments/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /show more moments/i })).toBeTruthy()
    );
    expect(screen.getAllByTestId("moment-title")).toHaveLength(2);
  });

  it("shows an empty state rather than a blank page", async () => {
    mocks.getPublicOwnerMoments.mockResolvedValue({ items: [], nextCursor: null });

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() =>
      expect(
        screen.getByText(/the tan family hasn't shared a moment yet/i)
      ).toBeTruthy()
    );
  });

  it("explains an unavailable profile without implying it ever existed", async () => {
    mocks.getPublicOwnerProfile.mockRejectedValue(
      new PublicProfileUnavailableError("not-found")
    );

    render(<OwnerSocialProfileView handle="nobody" />);

    await waitFor(() =>
      expect(screen.getByText(/this profile isn't available/i)).toBeTruthy()
    );
  });

  it("distinguishes a transport failure from an absent profile", async () => {
    mocks.getPublicOwnerProfile.mockRejectedValue(new Error("network"));

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() =>
      expect(screen.getByText(/we couldn't load this profile/i)).toBeTruthy()
    );
  });
});
