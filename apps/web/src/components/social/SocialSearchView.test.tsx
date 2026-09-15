// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SocialOwnerCard,
  SocialPetCard,
  SocialSearchResults,
} from "@/services/socialDiscoveryService";

const mocks = vi.hoisted(() => ({
  searchSocial: vi.fn(),
  followOwner: vi.fn(),
  query: "",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/search",
  useSearchParams: () => new URLSearchParams(mocks.query),
}));

vi.mock("@/services/socialDiscoveryService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialDiscoveryService")
  >("@/services/socialDiscoveryService");

  return {
    ...actual,
    searchSocial: (...args: unknown[]) => mocks.searchSocial(...args),
  };
});

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    followOwner: (...args: unknown[]) => mocks.followOwner(...args),
  };
});

import { SocialSearchView } from "@/components/social/SocialSearchView";

function pet(name: string, handle: string): SocialPetCard {
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

function owner(handle: string): SocialOwnerCard {
  return {
    handle,
    displayName: `The ${handle} Family`,
    avatarThumbnailUrl: null,
    generalArea: "Petaling Jaya",
    viewerFollows: false,
    isSelf: false,
  };
}

function results(
  query: string,
  pets: SocialPetCard[],
  owners: SocialOwnerCard[]
): SocialSearchResults {
  return { query, pets, owners };
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

function type(value: string) {
  fireEvent.change(screen.getByLabelText("Search pets and pet parents"), {
    target: { value },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.query = "";
  mocks.searchSocial.mockResolvedValue(
    results("moch", [pet("Mochi", "tanfamily")], [owner("mochiandcoco")])
  );
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("SocialSearchView", () => {
  it("calls the two tabs Pets and Pet Parents", () => {
    render(<SocialSearchView />);

    expect(screen.getByRole("button", { name: /^Pets/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Pet Parents/ })).toBeTruthy();

    // MyPetLink is pet-centric all the way down; these are pet parents, not
    // "People".
    expect(screen.queryByRole("button", { name: /^People/ })).toBeNull();
  });

  it("waits for two characters before asking the server anything", async () => {
    render(<SocialSearchView />);

    type("m");
    await vi.advanceTimersByTimeAsync(500);

    expect(mocks.searchSocial).not.toHaveBeenCalled();
    expect(screen.getByTestId("search-hint")).toBeTruthy();
  });

  it("searches once for a burst of typing", async () => {
    render(<SocialSearchView />);

    type("mo");
    type("moc");
    type("moch");
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => expect(mocks.searchSocial).toHaveBeenCalledTimes(1));
    expect(mocks.searchSocial).toHaveBeenCalledWith("moch");
  });

  it("shows matching pets first", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(500);

    const pets = await screen.findByTestId("search-pets");
    expect(within(pets).getByText("Mochi")).toBeTruthy();
  });

  it("shows matching pet parents on their own tab", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByTestId("search-pets");

    fireEvent.click(screen.getByRole("button", { name: /^Pet Parents/ }));

    const owners = await screen.findByTestId("search-owners");
    expect(within(owners).getByText("@mochiandcoco · Petaling Jaya")).toBeTruthy();
  });

  it("opens on the results when a search link is shared", async () => {
    mocks.query = "q=moch";

    render(<SocialSearchView />);
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => expect(mocks.searchSocial).toHaveBeenCalledWith("moch"));
  });

  it("follows a household from a result without leaving the page", async () => {
    signIn();
    mocks.followOwner.mockResolvedValue({
      isSelf: false,
      isFollowing: true,
      isFollowedBy: false,
      hasBlocked: false,
      canFollow: true,
      allowsFollowers: true,
      followerCount: 1,
      followingCount: 0,
    });

    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByTestId("search-pets");

    fireEvent.click(screen.getByRole("button", { name: /^Pet Parents/ }));
    fireEvent.click(await screen.findByTestId("follow-button"));

    await waitFor(() =>
      expect(mocks.followOwner).toHaveBeenCalledWith("mochiandcoco")
    );
  });

  it("says plainly when nothing matches", async () => {
    mocks.searchSocial.mockResolvedValue(results("zzzz", [], []));

    render(<SocialSearchView />);

    type("zzzz");
    await vi.advanceTimersByTimeAsync(500);

    expect(await screen.findByTestId("search-pets-empty")).toBeTruthy();
  });

  it("explains a failure without losing the box", async () => {
    mocks.searchSocial.mockRejectedValue(new Error("network"));

    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(500);

    expect(await screen.findByTestId("search-error")).toBeTruthy();
    expect(screen.getByLabelText("Search pets and pet parents")).toBeTruthy();
  });

  it("announces results politely rather than stealing focus", async () => {
    render(<SocialSearchView />);

    type("moch");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByTestId("search-pets");

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live!.contains(screen.getByTestId("search-pets"))).toBe(true);
  });
});
