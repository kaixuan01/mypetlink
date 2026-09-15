// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/feed",
  push: vi.fn(),
  getPets: vi.fn(),
  getOwnerSocialProfile: vi.fn(),
  getUnreadActivityCount: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, replace: mocks.push }),
}));

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

vi.mock("@/services/petService", () => ({
  getPets: (...args: unknown[]) => mocks.getPets(...args),
}));

vi.mock("@/services/ownerSocialService", () => ({
  getOwnerSocialProfile: (...args: unknown[]) =>
    mocks.getOwnerSocialProfile(...args),
}));

vi.mock("@/services/socialNotificationService", () => ({
  getUnreadActivityCount: (...args: unknown[]) =>
    mocks.getUnreadActivityCount(...args),
}));

import { SocialBottomNav } from "@/components/layouts/SocialBottomNav";
import { SocialLayout } from "@/components/layouts/SocialLayout";
import { resetUnreadActivityCache } from "@/lib/useUnreadActivity";
import { useSocialActions } from "@/lib/useSocialActions";

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

/** Exercises the two actions that cannot be plain links. */
function SocialActionsProbe() {
  const { openCreate, openOwnProfile } = useSocialActions();

  return (
    <div>
      <button onClick={openCreate} type="button">
        Share a Moment
      </button>
      <button onClick={openOwnProfile} type="button">
        My profile
      </button>
    </div>
  );
}

beforeEach(() => {
  mocks.pathname = "/feed";
  mocks.getUnreadActivityCount.mockResolvedValue(0);
  mocks.getPets.mockResolvedValue({ data: [] });
  mocks.getOwnerSocialProfile.mockResolvedValue({ data: { handle: "" } });
  resetUnreadActivityCache();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("social phone navigation", () => {
  it("offers the five social jobs, not a merged eleven-item bar", () => {
    render(<SocialBottomNav onCreate={vi.fn()} onProfile={vi.fn()} />);

    const nav = screen.getByTestId("social-bottom-nav");
    const labels = within(nav)
      .getAllByRole("listitem")
      .map((item) => item.textContent);

    expect(labels).toEqual(["Home", "Explore", "Share", "Activity", "Profile"]);
  });

  it("marks the current destination for assistive technology", () => {
    mocks.pathname = "/explore";

    render(<SocialBottomNav onCreate={vi.fn()} onProfile={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Explore" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("treats search as part of Explore rather than a sixth tab", () => {
    mocks.pathname = "/search";

    render(<SocialBottomNav onCreate={vi.fn()} onProfile={vi.fn()} />);

    expect(
      screen.getByRole("link", { name: "Explore" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("shows unread activity as a capped badge, and says so out loud", async () => {
    mocks.getUnreadActivityCount.mockResolvedValue(42);

    render(<SocialBottomNav onCreate={vi.fn()} onProfile={vi.fn()} />);

    const badge = await screen.findByTestId("activity-badge");

    expect(badge.textContent).toBe("9+");
    expect(
      screen.getByRole("link", { name: "Activity, 42 unread" })
    ).toBeTruthy();
  });

  it("asks for the unread count once, however many bars are on screen", async () => {
    render(
      <>
        <SocialBottomNav onCreate={vi.fn()} onProfile={vi.fn()} />
        <SocialBottomNav onCreate={vi.fn()} onProfile={vi.fn()} />
      </>
    );

    await waitFor(() =>
      expect(mocks.getUnreadActivityCount).toHaveBeenCalledTimes(1)
    );
  });

  it("routes Share and Profile through their resolvers, not a guessed href", () => {
    const onCreate = vi.fn();
    const onProfile = vi.fn();

    render(<SocialBottomNav onCreate={onCreate} onProfile={onProfile} />);

    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));
    fireEvent.click(screen.getByRole("button", { name: "My profile" }));

    expect(onCreate).toHaveBeenCalled();
    expect(onProfile).toHaveBeenCalled();
  });
});

describe("social actions", () => {
  it("sends an owner with no pets to add one rather than to an empty editor", async () => {
    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/pets/new"));
  });

  it("opens the editor directly when there is only one pet", async () => {
    mocks.getPets.mockResolvedValue({ data: [{ id: "pet-1" }] });

    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/pets/pet-1/moments/new")
    );
  });

  it("lets an owner with several pets choose first", async () => {
    mocks.getPets.mockResolvedValue({ data: [{ id: "pet-1" }, { id: "pet-2" }] });

    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/moments"));
  });

  it("opens the owner's own social profile when they have a handle", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue({
      data: { handle: "TanFamily" },
    });

    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "My profile" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/u/tanfamily"));
  });

  it("sends an owner with no handle to set one up, never to an invalid /u/", async () => {
    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "My profile" }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/settings#social-profile")
    );
    expect(mocks.push).not.toHaveBeenCalledWith(expect.stringContaining("/u/"));
  });
});

describe("the public social shell", () => {
  it("gives a visitor a way in and no owner navigation at all", async () => {
    mocks.pathname = "/explore";

    render(
      <SocialLayout>
        <p>Explore body</p>
      </SocialLayout>
    );

    expect(screen.getByText("Explore body")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href")
    ).toBe("/login?redirect=%2Fexplore");
    expect(screen.getByRole("link", { name: /get started/i })).toBeTruthy();

    // Nothing from the owner portal is mentioned to somebody who cannot use it.
    await waitFor(() =>
      expect(screen.queryByTestId("social-bottom-nav")).toBeNull()
    );
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Smart Tags" })).toBeNull();
  });

  it("hands a signed-in owner over to the portal shell instead", async () => {
    signIn();
    mocks.pathname = "/explore";

    render(
      <SocialLayout>
        <p>Explore body</p>
      </SocialLayout>
    );

    // The same page, different chrome: the visitor header is gone, and the
    // owner shell (with its own session check) has taken over.
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull()
    );
    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
  });
});
