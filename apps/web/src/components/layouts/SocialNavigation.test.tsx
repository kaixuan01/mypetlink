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
  const { openCreate, closeCreate, composerOpen, openOwnProfile } =
    useSocialActions();

  return (
    <div>
      <button onClick={openCreate} type="button">
        Share a Moment
      </button>
      <button onClick={closeCreate} type="button">
        Close composer
      </button>
      <button onClick={openOwnProfile} type="button">
        My profile
      </button>
      <p data-testid="composer-state">{composerOpen ? "open" : "closed"}</p>
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

    const nav = screen.getByTestId("mobile-bottom-nav");
    const labels = within(nav)
      .getAllByTestId("mobile-nav-item")
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

    const badge = await screen.findByTestId("mobile-nav-badge");

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

  it("routes Share through its resolver and Profile through a real link", () => {
    const onCreate = vi.fn();
    const onProfile = vi.fn();

    render(<SocialBottomNav onCreate={onCreate} onProfile={onProfile} />);

    // Share still has to ask whether this owner has a pet to share.
    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));
    expect(onCreate).toHaveBeenCalled();

    // Profile does not: it is a destination, which also makes it reachable by
    // keyboard and able to mark itself as the current page.
    const profile = screen.getByRole("link", { name: "My profile" });
    expect(profile.getAttribute("href")).toBe("/community/profile");
    expect(onProfile).not.toHaveBeenCalled();
  });
});

describe("social actions", () => {
  it("opens the composer instead of leaving Community", async () => {
    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));

    // Share used to be a navigation into the Owner Portal: /pets/new with no
    // pets, a pet's Moments page with one, /moments with several. All three
    // dropped somebody out of Community to write something for Community.
    expect(screen.getByTestId("composer-state").textContent).toBe("open");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("does not navigate anywhere for any number of pets", async () => {
    for (const pets of [[], [{ id: "pet-1" }], [{ id: "pet-1" }, { id: "pet-2" }]]) {
      mocks.push.mockClear();
      mocks.getPets.mockResolvedValue({ data: pets });

      const view = render(<SocialActionsProbe />);
      fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));

      // How many pets there are is the composer's question now, answered
      // inside the dialog — it is no longer a routing decision.
      expect(mocks.push).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("closes again without navigating", () => {
    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "Share a Moment" }));
    fireEvent.click(screen.getByRole("button", { name: "Close composer" }));

    // Cancel leaves the reader exactly where they were, because they never
    // went anywhere — no push to /feed, no push back to anything.
    expect(screen.getByTestId("composer-state").textContent).toBe("closed");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("opens the owner's own profile inside Community, not the public page", async () => {
    mocks.getOwnerSocialProfile.mockResolvedValue({
      data: { handle: "TanFamily" },
    });

    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "My profile" }));

    // /u/{handle} is the page a VISITOR sees, and it renders in a bare shell
    // with no sidebar and no bottom bar. Sending the owner there made opening
    // your own profile feel like leaving the product to look at yourself.
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/community/profile")
    );
    expect(mocks.push).not.toHaveBeenCalledWith(expect.stringContaining("/u/"));
  });

  it("does not need to resolve a handle before it can navigate", async () => {
    render(<SocialActionsProbe />);

    fireEvent.click(screen.getByRole("button", { name: "My profile" }));

    // The destination handles the not-set-up and switched-off cases itself, so
    // there is nothing to look up first — and an owner without a handle is no
    // longer dumped into Owner Settings in the other half of the app.
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/community/profile")
    );
    expect(mocks.push).not.toHaveBeenCalledWith("/settings#social-profile");
  });
});

describe("switching between the two halves", () => {
  it("offers one control that names where it goes, from the social side", async () => {
    const { OwnerPortalHeader } = await import(
      "@/components/portal/OwnerHeaderActions"
    );
    mocks.pathname = "/feed";

    render(<OwnerPortalHeader />);

    const link = screen.getByTestId("social-mode-switch");

    // Names the destination, not the mode you are in. No "portal", no
    // "management mode".
    expect(link.textContent).toBe("My Pets");
    expect(link.getAttribute("href")).toBe("/dashboard");
  });

  it("points the other way from the management side", async () => {
    const { OwnerPortalHeader } = await import(
      "@/components/portal/OwnerHeaderActions"
    );
    mocks.pathname = "/pets";

    render(<OwnerPortalHeader />);

    const link = screen.getByTestId("social-mode-switch");

    expect(link.textContent).toBe("Community");
    expect(link.getAttribute("href")).toBe("/feed");
  });
});

describe("the public social shell", () => {
  it("gives a visitor a way in and no owner navigation at all", async () => {
    mocks.pathname = "/explore";
    window.history.replaceState({}, "", "/explore?species=Cat");

    render(
      <SocialLayout>
        <p>Explore body</p>
      </SocialLayout>
    );

    expect(screen.getByText("Explore body")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Sign in" }).getAttribute("href")
    ).toBe("/login?redirect=%2Fexplore%3Fspecies%3DCat");
    expect(
      screen.getByRole("button", { name: /create free pet profile/i })
    ).toBeTruthy();

    // Nothing from the owner portal is mentioned to somebody who cannot use it.
    await waitFor(() =>
      expect(screen.queryByTestId("mobile-bottom-nav")).toBeNull()
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
    expect(
      screen.queryByRole("button", { name: /create free pet profile/i })
    ).toBeNull();
  });
});
