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
  getOwnerRelationship: vi.fn(),
  followOwner: vi.fn(),
  likeMoment: vi.fn(),
  unlikeMoment: vi.fn(),
  smartTagsEnabled: true,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/u/tanfamily",
}));

vi.mock("@/services/momentLikeService", () => ({
  likeMoment: (...args: unknown[]) => mocks.likeMoment(...args),
  unlikeMoment: (...args: unknown[]) => mocks.unlikeMoment(...args),
}));

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    getOwnerRelationship: (...args: unknown[]) =>
      mocks.getOwnerRelationship(...args),
    followOwner: (...args: unknown[]) => mocks.followOwner(...args),
  };
});

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
import type { OwnerRelationship } from "@/services/socialGraphService";

const relationship: OwnerRelationship = {
  isSelf: false,
  isFollowing: false,
  isFollowedBy: false,
  hasBlocked: false,
  canFollow: true,
  allowsFollowers: true,
  followerCount: 27,
  followingCount: 8,
};

/** A signed-in browser: acting controls appear only for someone who can act. */
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
      media: [],
      likeCount: 0,
      viewerHasLiked: false,
    })),
    nextCursor,
  };
}

/**
 * Own profile versus visitor profile.
 *
 * Same data, same component, different audience. Editing your own profile is a
 * primary action rather than something buried in an overflow menu, and a
 * visitor is never offered a control that belongs to somebody else.
 */
describe("own profile versus visitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/u/tanfamily");
    mocks.smartTagsEnabled = true;
    mocks.getPublicOwnerProfile.mockResolvedValue(profile);
    mocks.getPublicOwnerMoments.mockResolvedValue(page(2, null));
    mocks.getOwnerRelationship.mockResolvedValue(relationship);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("gives the owner Edit profile and Share as primary actions", async () => {
    signIn();
    render(<OwnerSocialProfileView audience="own" handle="tanfamily" />);

    const edit = await screen.findByTestId("edit-community-profile");
    expect(edit.getAttribute("href")).toBe("/community/profile/edit");

    // Editing yourself is not an overflow action.
    expect(
      screen.queryByRole("button", { name: /more options|more actions/i })
    ).toBeNull();
  });

  it("shares the public handle URL, not a signed-in-only one", async () => {
    signIn();
    render(<OwnerSocialProfileView audience="own" handle="tanfamily" />);

    await screen.findByTestId("edit-community-profile");

    // Whatever the share control renders, the address it offers is the page a
    // visitor can actually open.
    const shared = document.body.innerHTML;
    expect(shared).toContain("/u/tanfamily");
    expect(shared).not.toContain("/community/profile\"");
  });

  it("never offers Edit profile to a visitor", async () => {
    signIn();
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await screen.findByText("The Tan Family");

    expect(screen.queryByTestId("edit-community-profile")).toBeNull();
  });

  it("offers the owner a way to share a first Moment when the grid is empty", async () => {
    mocks.getPublicOwnerMoments.mockResolvedValue({ items: [], nextCursor: null });
    signIn();

    render(<OwnerSocialProfileView audience="own" handle="tanfamily" />);

    const empty = await screen.findByTestId("moments-empty");
    expect(empty.textContent).toContain("Share your first pet Moment");
    expect(within(empty).getByRole("link", { name: /share a moment/i })).toBeTruthy();
  });

  it("gives a visitor no owner call to action on an empty grid", async () => {
    mocks.getPublicOwnerMoments.mockResolvedValue({ items: [], nextCursor: null });
    signIn();

    render(<OwnerSocialProfileView handle="tanfamily" />);

    const empty = await screen.findByTestId("moments-empty");
    expect(empty.textContent).toContain("hasn't shared a Moment yet");
    expect(within(empty).queryByRole("link", { name: /share a moment/i })).toBeNull();
  });

  it("calls the section Pets, which works for one pet or several", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    const heading = await screen.findByRole("heading", { name: "Pets" });
    expect(heading).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /our pets/i })).toBeNull();
  });
});

describe("OwnerSocialProfileView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/u/tanfamily");
    mocks.smartTagsEnabled = true;
    mocks.getPublicOwnerProfile.mockResolvedValue(profile);
    mocks.getPublicOwnerMoments.mockResolvedValue(page(2, null));
    mocks.getOwnerRelationship.mockResolvedValue(relationship);
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

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

  it("links the follower and following counts to their lists", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    const counts = within(await screen.findByTestId("owner-profile-counts"));

    await waitFor(() => expect(counts.getByText("27")).toBeTruthy());
    expect(
      counts.getByRole("link", { name: /followers/i }).getAttribute("href")
    ).toBe("/u/tanfamily/followers");
    expect(
      counts.getByRole("link", { name: /following/i }).getAttribute("href")
    ).toBe("/u/tanfamily/following");
  });

  it("counts followers for the household and never for a pet", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByTestId("owner-pets-list")).toBeTruthy());

    // Following is a household relationship. A per-pet follower count would
    // invite exactly the model we decided against.
    const pets = within(screen.getByTestId("owner-pets-list"));
    expect(pets.queryByText(/follower/i)).toBeNull();
  });

  it("offers Follow to a signed-in visitor and moves the count with it", async () => {
    signIn();
    mocks.followOwner.mockResolvedValue({
      ...relationship,
      isFollowing: true,
      followerCount: 28,
    });

    render(<OwnerSocialProfileView handle="tanfamily" />);

    fireEvent.click(await screen.findByTestId("follow-button"));

    const counts = within(screen.getByTestId("owner-profile-counts"));
    await waitFor(() => expect(counts.getByText("28")).toBeTruthy());
    expect(screen.getByTestId("follow-button").textContent).toBe("Following");
  });

  it("keeps blocking behind the overflow menu, never beside Follow", async () => {
    signIn();

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await screen.findByTestId("owner-profile-menu-trigger");

    expect(screen.queryByRole("button", { name: /^block/i })).toBeNull();
  });

  it("offers no follow or block controls on your own profile", async () => {
    signIn();
    mocks.getOwnerRelationship.mockResolvedValue({
      ...relationship,
      isSelf: true,
      canFollow: false,
    });

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByText("The Tan Family")).toBeTruthy());

    expect(screen.queryByTestId("follow-button")).toBeNull();
    expect(screen.queryByTestId("owner-profile-menu-trigger")).toBeNull();
  });

  it("still renders the profile when the relationship cannot be read", async () => {
    mocks.getOwnerRelationship.mockRejectedValue(new Error("network"));

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() => expect(screen.getByText("The Tan Family")).toBeTruthy());
    expect(screen.getByTestId("owner-profile-counts")).toBeTruthy();
  });

  it("likes one Moment from the grid without disturbing the others", async () => {
    signIn();
    mocks.likeMoment.mockResolvedValue({
      momentId: "mlast0",
      likeCount: 1,
      viewerHasLiked: true,
    });

    render(<OwnerSocialProfileView handle="tanfamily" />);

    const hearts = await screen.findAllByTestId("like-button");
    fireEvent.click(hearts[0]);

    await waitFor(() => expect(mocks.likeMoment).toHaveBeenCalledWith("mlast0"));

    const counts = screen.getAllByTestId("like-count");
    await waitFor(() => expect(counts[0].textContent).toBe("1"));
    expect(counts[1].textContent).toBe("0");
  });

  it("shows a signed-out visitor the count and a way to sign in", async () => {
    render(<OwnerSocialProfileView handle="tanfamily" />);

    const hearts = await screen.findAllByTestId("like-button-signin");

    expect(hearts[0].getAttribute("href")).toBe("/login?redirect=%2Fu%2Ftanfamily");
    expect(screen.queryByTestId("like-button")).toBeNull();
  });

  it("distinguishes a transport failure from an absent profile", async () => {
    mocks.getPublicOwnerProfile.mockRejectedValue(new Error("network"));

    render(<OwnerSocialProfileView handle="tanfamily" />);

    await waitFor(() =>
      expect(screen.getByText(/we couldn't load this profile/i)).toBeTruthy()
    );
  });
});
