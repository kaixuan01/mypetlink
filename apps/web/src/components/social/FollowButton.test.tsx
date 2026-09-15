// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerRelationship } from "@/services/socialGraphService";

const mocks = vi.hoisted(() => ({
  followOwner: vi.fn(),
  unfollowOwner: vi.fn(),
}));

vi.mock("@/services/socialGraphService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/socialGraphService")
  >("@/services/socialGraphService");

  return {
    ...actual,
    followOwner: (...args: unknown[]) => mocks.followOwner(...args),
    unfollowOwner: (...args: unknown[]) => mocks.unfollowOwner(...args),
  };
});

import { FollowButton } from "@/components/social/FollowButton";
import { ApiClientError } from "@/services/apiClient";

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

function renderButton(
  relationship: Partial<OwnerRelationship> = {},
  options: { signedIn?: boolean | null; surface?: "profile" | "attribution" } = {}
) {
  const onChange = vi.fn();
  const view = render(
    <FollowButton
      displayName="The Tan Family"
      handle="tanfamily"
      onChange={onChange}
      relationship={{ ...base, ...relationship }}
      signedIn={"signedIn" in options ? options.signedIn! : true}
      surface={options.surface}
    />
  );

  return { onChange, view };
}

function followButton() {
  return screen.getByTestId("follow-button") as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FollowButton", () => {
  it("follows optimistically and then keeps the server's own answer", async () => {
    let resolve: (value: OwnerRelationship) => void = () => undefined;
    mocks.followOwner.mockReturnValue(
      new Promise<OwnerRelationship>((r) => {
        resolve = r;
      })
    );

    const { onChange } = renderButton();
    fireEvent.click(screen.getByTestId("follow-button"));

    // Applied before the request settles: waiting on a round trip reads as a
    // broken button.
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ isFollowing: true, followerCount: 5 })
    );

    resolve({ ...base, isFollowing: true, followerCount: 9 });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ isFollowing: true, followerCount: 9 })
      )
    );
  });

  it("rolls back and explains itself when the follow is refused", async () => {
    mocks.followOwner.mockRejectedValue(
      new ApiClientError(429, "rate_limited", "You're doing that too quickly.")
    );

    const { onChange } = renderButton();
    fireEvent.click(screen.getByTestId("follow-button"));

    await screen.findByTestId("follow-button-error");

    expect(screen.getByTestId("follow-button-error").textContent).toBe(
      "You're doing that too quickly."
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ isFollowing: false, followerCount: 4 })
    );
  });

  it("unfollows and never lets the count fall below zero", async () => {
    mocks.unfollowOwner.mockResolvedValue({
      ...base,
      isFollowing: false,
      followerCount: 0,
    });

    const { onChange } = renderButton({ isFollowing: true, followerCount: 0 });
    fireEvent.click(screen.getByTestId("follow-button"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ isFollowing: false, followerCount: 0 })
    );
    await waitFor(() => expect(mocks.unfollowOwner).toHaveBeenCalledWith("tanfamily"));
    expect(mocks.followOwner).not.toHaveBeenCalled();
  });

  it("reports the followed state to assistive technology", () => {
    renderButton({ isFollowing: true });
    const button = screen.getByTestId("follow-button");

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe(
      "Stop following The Tan Family (@tanfamily)"
    );
  });

  it("offers nothing on your own profile", () => {
    renderButton({ isSelf: true });

    expect(screen.queryByTestId("follow-button")).toBeNull();
  });

  it("offers nothing when the household has closed follows", () => {
    renderButton({ canFollow: false, allowsFollowers: false });

    expect(screen.queryByTestId("follow-button")).toBeNull();
  });

  it("shows a blocked viewer exactly what a closed profile shows", () => {
    // Blocked either way: the API reports canFollow false and says nothing
    // about why. Nothing rendered here may hint at a block.
    const { view } = renderButton({ canFollow: false, allowsFollowers: true });
    const blocked = view.container.innerHTML;

    cleanup();
    const closed = renderButton({
      canFollow: false,
      allowsFollowers: true,
      isFollowedBy: true,
    }).view.container.innerHTML;

    expect(blocked).toBe("");
    expect(closed).toBe("");
  });

  it("still lets an existing follow be undone when following is now closed", () => {
    renderButton({ canFollow: false, isFollowing: true });

    expect(screen.getByTestId("follow-button").textContent).toBe("Following");
  });

  it("sends a signed-out visitor to sign in, and back to the profile after", () => {
    renderButton({}, { signedIn: false });
    const link = screen.getByTestId("follow-button-signin");

    expect(link.getAttribute("href")).toBe("/login?redirect=%2Fu%2Ftanfamily");
    expect(screen.queryByTestId("follow-button")).toBeNull();
  });

  it("offers a signed-out visitor nothing when follows are closed", () => {
    renderButton({ allowsFollowers: false }, { signedIn: false });

    expect(screen.queryByTestId("follow-button-signin")).toBeNull();
  });

  it("names the household on a pet's page, so nobody thinks they followed the pet", () => {
    renderButton({}, { surface: "attribution" });

    expect(screen.getByTestId("follow-button").textContent).toBe("Follow @tanfamily");
  });

  it("stays inert until the signed-in check has run", () => {
    renderButton({}, { signedIn: null });

    expect(followButton().disabled).toBe(true);
  });

  it("ignores a second click while the first is still in flight", async () => {
    mocks.followOwner.mockReturnValue(new Promise(() => undefined));

    renderButton();
    const button = followButton();
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(true));
    expect(mocks.followOwner).toHaveBeenCalledTimes(1);
  });
});
