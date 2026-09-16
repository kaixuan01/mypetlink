// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PublicMomentListItem,
  PublicMomentMedia,
} from "@/services/publicSocialService";

const mocks = vi.hoisted(() => ({
  getPublicMoment: vi.fn(),
  back: vi.fn(),
  push: vi.fn(),
  // A visitor who followed a shared link: the case a Moment page exists for,
  // and the one that must not depend on a session.
  signedIn: { current: false as boolean | null },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/moments/moment-1",
  useRouter: () => ({ back: mocks.back, push: mocks.push, replace: vi.fn() }),
}));

vi.mock("@/lib/useSignedIn", () => ({ useSignedIn: () => mocks.signedIn.current }));

vi.mock("@/services/publicSocialService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/publicSocialService")
  >("@/services/publicSocialService");
  return {
    ...actual,
    getPublicMoment: (...args: unknown[]) => mocks.getPublicMoment(...args),
  };
});

import { MomentDetailView } from "@/components/social/MomentDetailView";

/**
 * One Moment, on its own page.
 *
 * The problem this page exists for: a card could show one photo of four and a
 * badge saying there were three more, and there was nowhere for those three to
 * be. So the things worth pinning down are that every item is reachable, that
 * they arrive in the order the owner arranged them, and that reaching the fourth
 * does not mean having downloaded all four on arrival.
 */

type Spec = { type: "image" | "video" };

function media(specs: Spec[]): PublicMomentMedia[] {
  return specs.map((spec, index) => ({
    id: `media-${index}`,
    type: spec.type,
    url:
      spec.type === "video"
        ? `https://media.test/clip-${index}.mp4`
        : `https://media.test/photo-${index}.jpg`,
    caption: null,
    altText: `Item ${index}`,
    sortOrder: index,
  }));
}

function moment(
  overrides: Partial<PublicMomentListItem> = {}
): PublicMomentListItem {
  return {
    id: "9c1f8a2e-1111-4a2b-8c3d-4e5f60718293",
    title: "Beach day",
    momentDate: null,
    publishedAt: "2026-09-01T00:00:00Z",
    type: "Memory",
    caption: "A bright afternoon by the water.",
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
    media: media([{ type: "image" }]),
    likeCount: 3,
    viewerHasLiked: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.getPublicMoment.mockResolvedValue(moment());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Moment detail", () => {
  it("shows the Moment, its pets, its household and when it was shared", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    expect(screen.getByTestId("moment-title").textContent).toBe("Beach day");
    expect(screen.getByTestId("moment-subjects").textContent).toContain("Mochi");
    expect(screen.getByTestId("moment-byline").textContent).toContain("@tanfamily");
    expect(screen.getByTestId("moment-published").textContent).toContain("2026");
    expect(screen.getByText("A bright afternoon by the water.")).toBeTruthy();
  });

  it("offers the actions a Moment has, and none it does not", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const detail = screen.getByTestId("moment-detail");

    expect(within(detail).getByRole("button", { name: /share/i })).toBeTruthy();

    // A visitor is offered the like control as a way in rather than a dead
    // heart, so it is a link here and a button once they are signed in.
    const like = within(detail).getByTestId("like-button-signin");

    expect(like.getAttribute("aria-label")).toContain("3 likes");

    // Comments do not exist. A page must not imply an affordance it lacks.
    expect(screen.queryByRole("button", { name: /comment/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/comment/i)).toBeNull();
  });

  it("makes every item reachable, in the order they were arranged", async () => {
    mocks.getPublicMoment.mockResolvedValue(
      moment({ media: media([{ type: "image" }, { type: "image" }, { type: "image" }]) })
    );

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    expect(screen.getByLabelText("Media 1 of 3").textContent).toBe("1 / 3");
    expect(screen.getByAltText("Item 0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next media" }));

    await waitFor(() => expect(screen.getByAltText("Item 1")).toBeTruthy());
    expect(screen.getByLabelText("Media 2 of 3").textContent).toBe("2 / 3");

    fireEvent.click(screen.getByRole("button", { name: "Previous media" }));

    await waitFor(() => expect(screen.getByAltText("Item 0")).toBeTruthy());
  });

  it("does not fetch the whole set to show the first of it", async () => {
    mocks.getPublicMoment.mockResolvedValue(
      moment({
        media: media([
          { type: "image" },
          { type: "image" },
          { type: "image" },
          { type: "video" },
        ]),
      })
    );

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    // Four items exist; one is on screen. The blurred backdrop behind it is the
    // same picture, so no second file is requested for it either.
    const requested = new Set(
      Array.from(document.querySelectorAll("img")).map((image) => image.src)
    );

    expect(requested.has("https://media.test/photo-0.jpg")).toBe(true);
    expect(requested.has("https://media.test/photo-1.jpg")).toBe(false);
    expect(requested.has("https://media.test/photo-2.jpg")).toBe(false);
    expect(document.querySelectorAll("video")).toHaveLength(0);
  });

  it("renders a video Moment as a video", async () => {
    mocks.getPublicMoment.mockResolvedValue(
      moment({ media: media([{ type: "video" }]) })
    );

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const video = document.querySelector("video");

    expect(video?.getAttribute("src")).toBe("https://media.test/clip-0.mp4");
    expect(video?.muted).toBe(true);
    expect(video?.getAttribute("preload")).toBe("metadata");
    expect(document.querySelector('img[src$=".mp4"]')).toBeNull();
  });

  it("goes back the way the browser would, without inventing its own history", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const back = screen.queryByRole("button", { name: "Back" });

    if (back) {
      fireEvent.click(back);
      expect(mocks.back).toHaveBeenCalledTimes(1);
    } else {
      // No history to go back to — a shared link opened cold. It offers a real
      // destination rather than a control that would do nothing.
      expect(
        screen.getByRole("link", { name: /explore mypetlink/i }).getAttribute("href")
      ).toBe("/explore");
    }

    // Nothing here pushes, replaces or rewrites history, which is what keeps
    // ordinary back behaviour ordinary.
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("says plainly when a Moment cannot be opened", async () => {
    mocks.getPublicMoment.mockRejectedValue(new Error("unavailable"));

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    const unavailable = await screen.findByTestId("moment-unavailable");

    expect(unavailable.textContent).toContain("isn’t available");

    // Never a reason. "Taken down", "made private" and "they blocked you" must
    // read identically, or the page becomes a way to ask.
    expect(unavailable.textContent).not.toMatch(/blocked|private|deleted/i);
    expect(screen.queryByTestId("moment-detail")).toBeNull();
  });

  it("gives a visitor a way into the product rather than owner navigation", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    // The same shell Explore and search use when nobody is signed in: the brand,
    // a sign-in, and a way to start. Never a portal route a visitor cannot use.
    const header = screen.getByTestId("social-header-public");

    expect(within(header).getByRole("link", { name: /sign in/i })).toBeTruthy();
    expect(within(header).getByRole("link", { name: /get started/i })).toBeTruthy();
  });

  it("holds a modest skeleton while it loads", () => {
    mocks.getPublicMoment.mockImplementation(() => new Promise(() => {}));

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    expect(
      screen.getByTestId("moment-detail-loading").getAttribute("aria-busy")
    ).toBe("true");
  });
});
