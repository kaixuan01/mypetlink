// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedMomentSummary } from "@/components/social/CommunityMomentComposer";

const mocks = vi.hoisted(() => ({
  pathname: "/explore",
  announceMomentCreated: vi.fn(),
  refresh: vi.fn(),
  summary: null as SharedMomentSummary | null,
  /** Every composer opening's callbacks, oldest first. */
  openings: [] as { onClose: () => void; onCreated: (shared: SharedMomentSummary) => void }[],
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

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: mocks.refresh }),
}));

vi.mock("@/components/auth/AuthGuard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/brand/BrandLogo", () => ({ BrandLogo: () => null }));
vi.mock("@/components/layouts/MobileBottomNav", () => ({ MobileBottomNav: () => null }));
vi.mock("@/components/layouts/SocialBottomNav", () => ({ SocialBottomNav: () => null }));
vi.mock("@/components/layouts/OwnerKeyboardViewport", () => ({
  OwnerKeyboardViewport: () => null,
}));
vi.mock("@/components/portal/OwnerHeaderActions", () => ({
  OwnerHeaderActionsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  OwnerPortalHeader: () => null,
}));
vi.mock("@/services/authService", () => ({ logoutOwner: vi.fn() }));
vi.mock("@/lib/useUnreadActivity", () => ({ useUnreadActivity: () => 0 }));
vi.mock("@/lib/momentChanges", () => ({
  announceMomentCreated: () => mocks.announceMomentCreated(),
  subscribeMomentCreated: () => () => undefined,
}));

// The composer's own behaviour is tested beside it. Here it only reports a
// share and closes, which is all the shell sees of it.
vi.mock("@/components/social/CommunityMomentComposer", () => ({
  CommunityMomentComposer: ({
    onClose,
    onCreated,
  }: {
    onClose: () => void;
    onCreated: (shared: SharedMomentSummary) => void;
  }) => {
    if (!mocks.openings.some((opening) => opening.onClose === onClose)) {
      mocks.openings.push({ onClose, onCreated });
    }
    return (
    <div role="dialog">
      <button onClick={() => onCreated(mocks.summary!)} type="button">
        report share
      </button>
      <button onClick={onClose} type="button">
        close composer
      </button>
    </div>
    );
  },
}));

import { AppLayout } from "@/components/layouts/AppLayout";
import { useOpenCommunityComposer } from "@/components/social/CommunityComposerContext";

function PageShareButton() {
  const open = useOpenCommunityComposer();
  return open ? (
    <button onClick={open} type="button">
      page share
    </button>
  ) : null;
}

function shareFromTheSidebar(summary: SharedMomentSummary) {
  mocks.summary = summary;
  const community = screen.getByRole("navigation", { name: "Community" });
  fireEvent.click(within(community).getByRole("button", { name: "Share a Moment" }));
  fireEvent.click(screen.getByRole("button", { name: "report share" }));
}

beforeEach(() => {
  mocks.openings = [];
  mocks.pathname = "/explore";
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe("after Share a Moment", () => {
  it("tells the listing underneath, instead of refreshing a route that cannot reach it", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);

    shareFromTheSidebar({
      momentId: "m-1",
      petId: "pet-1",
      audience: "Public",
      communityProfileActive: true,
    });

    expect(mocks.announceMomentCreated).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("confirms once, after the composer has closed, with View Moment", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);

    shareFromTheSidebar({
      momentId: "m-1",
      petId: "pet-1",
      audience: "Public",
      communityProfileActive: true,
    });

    // Never behind the dialog (the collaborator follow-up can keep it open).
    expect(screen.queryByTestId("moment-shared-notice")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "close composer" }));

    const notices = screen.getAllByTestId("moment-shared-notice");
    expect(notices).toHaveLength(1);
    expect(within(notices[0]).getByRole("status").textContent).toContain("Moment shared.");
    expect(
      within(notices[0]).getByRole("link", { name: "View Moment" }).getAttribute("href")
    ).toBe("/moments/m-1?returnTo=%2Fexplore");
  });

  it("says a Moment kept to Only me was saved, and where to find it", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);

    shareFromTheSidebar({
      momentId: "m-2",
      petId: "pet-7",
      audience: "Private",
      communityProfileActive: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "close composer" }));

    const notice = screen.getByTestId("moment-shared-notice");
    expect(notice.textContent).toContain("Moment saved. Only you can see it.");
    expect(notice.textContent).not.toContain("shared");
    // Saved private: no public list can gain it, so none is asked to refresh.
    expect(mocks.announceMomentCreated).not.toHaveBeenCalled();
    expect(within(notice).queryByRole("link", { name: "View Moment" })).toBeNull();
    expect(
      within(notice).getByRole("link", { name: "View in My Pets" }).getAttribute("href")
    ).toBe("/pets/pet-7/moments");
  });

  it("offers no Community page for a public Moment from an owner outside Community", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);

    shareFromTheSidebar({
      momentId: "m-3",
      petId: "pet-7",
      audience: "Public",
      communityProfileActive: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "close composer" }));

    const notice = screen.getByTestId("moment-shared-notice");
    expect(within(notice).queryByRole("link", { name: "View Moment" })).toBeNull();
    expect(within(notice).getByRole("link", { name: "View in My Pets" })).toBeTruthy();
  });

  it("can be dismissed, and retires itself", async () => {
    render(<AppLayout><p>Explore</p></AppLayout>);

    shareFromTheSidebar({
      momentId: "m-1",
      petId: "pet-1",
      audience: "Public",
      communityProfileActive: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "close composer" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByTestId("moment-shared-notice")).toBeNull();

    shareFromTheSidebar({
      momentId: "m-4",
      petId: "pet-1",
      audience: "Public",
      communityProfileActive: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "close composer" }));
    expect(screen.getByTestId("moment-shared-notice")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(screen.queryByTestId("moment-shared-notice")).toBeNull();
  });

  it("lets a page open the same composer through the shell", () => {
    render(
      <AppLayout>
        <PageShareButton />
      </AppLayout>
    );

    fireEvent.click(screen.getByRole("button", { name: "page share" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("an earlier composer's save, finishing after a new one opened", () => {
  const publicShare: SharedMomentSummary = {
    momentId: "m-a",
    petId: "pet-1",
    audience: "Public",
    communityProfileActive: true,
  };

  function openComposer() {
    const community = screen.getByRole("navigation", { name: "Community" });
    fireEvent.click(within(community).getByRole("button", { name: "Share a Moment" }));
  }

  it("cannot close the new composer", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);
    openComposer();
    const composerA = mocks.openings.at(-1)!;
    act(() => composerA.onClose());
    openComposer();
    expect(mocks.openings).toHaveLength(2);

    // A's save settles now and asks to close "its" composer.
    act(() => composerA.onClose());

    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("still refreshes the lists for a Moment that exists, but confirms nothing over the new composer", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);
    openComposer();
    const composerA = mocks.openings.at(-1)!;
    act(() => composerA.onClose());
    openComposer();
    const composerB = mocks.openings.at(-1)!;

    act(() => composerA.onCreated(publicShare));

    // Global: the Moment exists and is public, so lists learn of it.
    expect(mocks.announceMomentCreated).toHaveBeenCalledTimes(1);
    // Composer-owned: no confirmation for A, then or after B closes.
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() => composerB.onClose());
    expect(screen.queryByTestId("moment-shared-notice")).toBeNull();
  });

  it("confirms a save that finished after its composer closed, when nothing newer opened", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);
    openComposer();
    const composerA = mocks.openings.at(-1)!;
    act(() => composerA.onClose());

    act(() => composerA.onCreated(publicShare));

    expect(screen.getByTestId("moment-shared-notice").textContent).toContain("Moment shared.");
  });

  it("the current composer still closes and confirms exactly once", () => {
    render(<AppLayout><p>Explore</p></AppLayout>);
    openComposer();
    const composer = mocks.openings.at(-1)!;

    act(() => composer.onCreated(publicShare));
    act(() => composer.onClose());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByTestId("moment-shared-notice")).toHaveLength(1);
    expect(mocks.announceMomentCreated).toHaveBeenCalledTimes(1);
  });
});
