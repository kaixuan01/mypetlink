// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OwnerRelationship } from "@/services/socialGraphService";

const mocks = vi.hoisted(() => ({
  blockOwner: vi.fn(),
  unblockOwner: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    blockOwner: (...args: unknown[]) => mocks.blockOwner(...args),
    unblockOwner: (...args: unknown[]) => mocks.unblockOwner(...args),
  };
});

import { OwnerProfileMenu } from "@/components/social/OwnerProfileMenu";
import { ApiClientError } from "@/services/apiClient";

beforeEach(() => {
  window.history.replaceState({}, "", "/u/tanfamily?source=shared");
});

const base: OwnerRelationship = {
  isSelf: false,
  isFollowing: false,
  isFollowedBy: false,
  hasBlocked: false,
  canFollow: true,
  allowsFollowers: true,
  followerCount: 4,
  followingCount: 2,
};

function renderMenu(
  relationship: Partial<OwnerRelationship> = {},
  options: { signedIn?: boolean | null } = {}
) {
  const onChange = vi.fn();
  const view = render(
    <OwnerProfileMenu
      displayName="The Tan Family"
      handle="tanfamily"
      onAuthenticationRequired={mocks.push}
      onChange={onChange}
      relationship={{ ...base, ...relationship }}
      signedIn={"signedIn" in options ? options.signedIn! : true}
    />
  );

  return { onChange, view };
}

function openMenu() {
  fireEvent.click(screen.getByTestId("owner-profile-menu-trigger"));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OwnerProfileMenu", () => {
  it("keeps blocking out of the page's own actions", () => {
    renderMenu();

    // Nothing about blocking is on the page until the menu is opened: it is a
    // rare, heavy action and must not read as an ordinary social gesture.
    expect(screen.queryByText(/block/i)).toBeNull();
    expect(screen.queryByTestId("owner-profile-menu")).toBeNull();
  });

  it("asks before blocking, and says what blocking does not touch", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem"));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/Block The Tan Family\?/)).toBeTruthy();
    expect(
      screen.getByText(/Safety Profiles keep\s+working/i)
    ).toBeTruthy();
    expect(mocks.blockOwner).not.toHaveBeenCalled();
  });

  it("blocks once confirmed and takes the server's relationship", async () => {
    mocks.blockOwner.mockResolvedValue({
      ...base,
      hasBlocked: true,
      canFollow: false,
      isFollowing: false,
      followerCount: 3,
    });

    const { onChange } = renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem"));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    await waitFor(() => expect(mocks.blockOwner).toHaveBeenCalledWith("tanfamily"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hasBlocked: true, canFollow: false })
    );
  });

  it("leaves the block in place and explains when the request fails", async () => {
    mocks.blockOwner.mockRejectedValue(
      new ApiClientError(503, "service_unavailable", "We couldn't reach MyPetLink.")
    );

    const { onChange } = renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem"));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    await screen.findByTestId("owner-profile-menu-error");

    expect(screen.getByTestId("owner-profile-menu-error").textContent).toBe(
      "We couldn't reach MyPetLink."
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("offers unblocking, and does not promise the follow back", async () => {
    mocks.unblockOwner.mockResolvedValue({ ...base, hasBlocked: false });

    renderMenu({ hasBlocked: true, canFollow: false });
    openMenu();

    expect(screen.getByRole("menuitem").textContent).toBe("Unblock @tanfamily");

    fireEvent.click(screen.getByRole("menuitem"));

    expect(screen.getByText(/will not start following you again/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(mocks.unblockOwner).toHaveBeenCalledWith("tanfamily"));
  });

  it("closes on Escape without acting", () => {
    renderMenu();
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("owner-profile-menu")).toBeNull();
    expect(mocks.blockOwner).not.toHaveBeenCalled();
  });

  it("offers a signed-out visitor a sign-in path without opening confirmation", () => {
    renderMenu({}, { signedIn: false });
    openMenu();

    const link = screen.getByTestId("owner-profile-block-signin");

    expect(link.textContent).toBe("Sign in to block @tanfamily");
    expect(link.getAttribute("href")).toBe(
      "/login?redirect=%2Fu%2Ftanfamily%3Fsource%3Dshared"
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.blockOwner).not.toHaveBeenCalled();
  });

  it("returns an expired Block confirmation through login without retrying", async () => {
    mocks.blockOwner.mockRejectedValue(
      new ApiClientError(401, "unauthorized", "Authentication is required.")
    );

    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem"));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/login?redirect=%2Fu%2Ftanfamily%3Fsource%3Dshared"
      )
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.blockOwner).toHaveBeenCalledOnce();
  });

  it("offers nothing on your own profile", () => {
    renderMenu({ isSelf: true });

    expect(screen.queryByTestId("owner-profile-menu-trigger")).toBeNull();
  });
});
