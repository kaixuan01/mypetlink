// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicOwnerProfile } from "@/services/publicSocialService";
import type {
  OwnerRelationship,
  SocialAccountPage,
} from "@/services/socialGraphService";

const mocks = vi.hoisted(() => ({
  getPublicOwnerProfile: vi.fn(),
  getOwnerFollowers: vi.fn(),
  getOwnerFollowing: vi.fn(),
  getOwnerRelationship: vi.fn(),
  followOwner: vi.fn(),
}));

vi.mock("@/services/publicSocialService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/publicSocialService")
  >("@/services/publicSocialService");

  return {
    ...actual,
    getPublicOwnerProfile: (...args: unknown[]) =>
      mocks.getPublicOwnerProfile(...args),
  };
});

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    getOwnerFollowers: (...args: unknown[]) => mocks.getOwnerFollowers(...args),
    getOwnerFollowing: (...args: unknown[]) => mocks.getOwnerFollowing(...args),
    getOwnerRelationship: (...args: unknown[]) =>
      mocks.getOwnerRelationship(...args),
    followOwner: (...args: unknown[]) => mocks.followOwner(...args),
  };
});

import { OwnerConnectionsView } from "@/components/social/OwnerConnectionsView";
import { PublicProfileUnavailableError } from "@/services/publicSocialService";

const profile: PublicOwnerProfile = {
  handle: "tanfamily",
  displayName: "The Tan Family",
  bio: null,
  avatarUrl: null,
  avatarThumbnailUrl: null,
  generalArea: "Petaling Jaya",
  allowFollowers: true,
  pets: [],
};

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

/** A signed-in browser: the row controls only appear for someone who can act. */
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

function page(
  handles: string[],
  nextCursor: string | null = null
): SocialAccountPage {
  return {
    items: handles.map((handle) => ({
      handle,
      displayName: `${handle} household`,
      avatarThumbnailUrl: null,
      isFollowing: false,
      isSelf: false,
    })),
    nextCursor,
  };
}

beforeEach(() => {
  mocks.getPublicOwnerProfile.mockResolvedValue(profile);
  mocks.getOwnerRelationship.mockResolvedValue(relationship);
  mocks.getOwnerFollowers.mockResolvedValue(page(["limfamily", "raofamily"]));
  mocks.getOwnerFollowing.mockResolvedValue(page([]));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("OwnerConnectionsView", () => {
  it("lists the households that follow this one", async () => {
    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    const list = await screen.findByTestId("social-account-list");

    expect(within(list).getByText("@limfamily")).toBeTruthy();
    expect(within(list).getByText("@raofamily")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Followers");
  });

  it("carries the counts into both tabs and links to each list", async () => {
    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    const tabs = await screen.findByTestId("owner-connections-tabs");
    const links = within(tabs).getAllByRole("link");

    await waitFor(() => expect(links[0].textContent).toContain("27"));
    expect(links[0].getAttribute("href")).toBe("/u/tanfamily/followers");
    expect(links[0].getAttribute("aria-current")).toBe("page");
    expect(links[1].textContent).toContain("8");
    expect(links[1].getAttribute("href")).toBe("/u/tanfamily/following");
    expect(links[1].getAttribute("aria-current")).toBeNull();
  });

  it("pages with the cursor rather than an offset", async () => {
    mocks.getOwnerFollowers
      .mockResolvedValueOnce(page(["limfamily"], "cursor-2"))
      .mockResolvedValueOnce(page(["raofamily"]));

    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    fireEvent.click(await screen.findByTestId("social-account-list-more"));

    await waitFor(() =>
      expect(mocks.getOwnerFollowers).toHaveBeenLastCalledWith(
        "tanfamily",
        "cursor-2"
      )
    );

    const list = await screen.findByTestId("social-account-list");
    await waitFor(() => expect(within(list).getByText("@raofamily")).toBeTruthy());
    expect(within(list).getByText("@limfamily")).toBeTruthy();
    expect(screen.queryByTestId("social-account-list-more")).toBeNull();
  });

  it("keeps the rows already on screen when a further page fails", async () => {
    mocks.getOwnerFollowers
      .mockResolvedValueOnce(page(["limfamily"], "cursor-2"))
      .mockRejectedValueOnce(new Error("network"));

    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    fireEvent.click(await screen.findByTestId("social-account-list-more"));

    await waitFor(() => expect(mocks.getOwnerFollowers).toHaveBeenCalledTimes(2));
    expect(screen.getByText("@limfamily")).toBeTruthy();
  });

  it("says plainly when nobody is being followed yet", async () => {
    render(<OwnerConnectionsView handle="tanfamily" relation="following" />);

    const empty = await screen.findByTestId("social-account-list-empty");

    expect(empty.textContent).toBe("The Tan Family isn't following anyone yet.");
    expect(mocks.getOwnerFollowers).not.toHaveBeenCalled();
  });

  it("shows a blocked viewer the same screen an unshared profile shows", async () => {
    mocks.getPublicOwnerProfile.mockRejectedValue(
      new PublicProfileUnavailableError("not-found")
    );

    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    expect(await screen.findByText("This profile isn't available")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Explore Community" }).getAttribute("href")
    ).toBe("/explore");
    expect(screen.queryByTestId("social-account-list")).toBeNull();
  });

  it("does not lose the list when the counts cannot be read", async () => {
    mocks.getOwnerRelationship.mockRejectedValue(new Error("network"));

    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    expect(await screen.findByTestId("social-account-list")).toBeTruthy();
  });

  it("follows one household from the list without touching the others", async () => {
    signIn();
    mocks.followOwner.mockResolvedValue({ ...relationship, isFollowing: true });

    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    const list = await screen.findByTestId("social-account-list");
    const buttons = within(list).getAllByTestId("follow-button");
    fireEvent.click(buttons[0]);

    await waitFor(() => expect(mocks.followOwner).toHaveBeenCalledWith("limfamily"));
    await waitFor(() => expect(buttons[0].textContent).toBe("Following"));
    expect(buttons[1].textContent).toBe("Follow");
  });

  it("offers a signed-out visitor a way in rather than a dead control", async () => {
    render(<OwnerConnectionsView handle="tanfamily" relation="followers" />);

    const list = await screen.findByTestId("social-account-list");

    expect(within(list).getAllByTestId("follow-button-signin")).toHaveLength(2);
    expect(within(list).queryByTestId("follow-button")).toBeNull();
  });

  it("links back to the household's profile", async () => {
    render(<OwnerConnectionsView handle="tanfamily" relation="following" />);

    const back = await screen.findByRole("link", {
      name: "Back to The Tan Family's profile",
    });

    expect(back.getAttribute("href")).toBe("/u/tanfamily");
    expect(back.className).toContain("min-h-10");
  });
});
