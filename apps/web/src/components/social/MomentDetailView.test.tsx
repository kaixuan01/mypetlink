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
import {
  PublicProfileUnavailableError,
  type PublicMomentListItem,
  type PublicMomentMedia,
} from "@/services/publicSocialService";

const mocks = vi.hoisted(() => ({
  getPublicMoment: vi.fn(),
  getMomentComments: vi.fn(),
  getOwnerSocialProfile: vi.fn(),
  // A visitor who followed a shared link: the case a Moment page exists for,
  // and the one that must not depend on a session.
  signedIn: { current: false as boolean | null },
}));

vi.mock("@/services/momentCommentService", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/momentCommentService")
  >("@/services/momentCommentService");
  return {
    ...actual,
    getMomentComments: (...args: unknown[]) => mocks.getMomentComments(...args),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/moments/moment-1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/useSignedIn", () => ({ useSignedIn: () => mocks.signedIn.current }));
vi.mock("@/components/auth/AuthGuard", () => ({ AuthGuard: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/services/ownerSocialService", async () => {
  const actual = await vi.importActual<typeof import("@/services/ownerSocialService")>("@/services/ownerSocialService");
  return { ...actual, getOwnerSocialProfile: (...args: unknown[]) => mocks.getOwnerSocialProfile(...args) };
});

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
  mocks.signedIn.current = false;
  mocks.getOwnerSocialProfile.mockResolvedValue({ data: { handle: "viewerhome", isSocialEnabled: true, canEnableSocial: true } });
  mocks.getPublicMoment.mockResolvedValue(moment());
  mocks.getMomentComments.mockResolvedValue({
    items: [],
    nextCursor: null,
    commentCount: 0,
    viewer: { canComment: false, requirement: "signIn", identity: null },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Moment detail", () => {
  it.each([
    ["author", "tanfamily", false],
    ["collaborator", "collabhome", true],
    ["viewer", "viewerhome", true],
  ] as const)("shows Moment report only to a signed-in non-author %s", async (_role, handle, visible) => {
    mocks.signedIn.current = true;
    mocks.getOwnerSocialProfile.mockResolvedValue({ data: { handle, isSocialEnabled: true, canEnableSocial: true } });
    render(<MomentDetailView momentId="moment-1" />);
    await screen.findByTestId("moment-detail");
    if (visible) {
      const trigger = await screen.findByRole("button", { name: "Moment actions" });
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole("menuitem", { name: "Report Moment" }));
      expect(screen.getByRole("dialog", { name: "Report Moment" })).toBeTruthy();
    } else {
      await waitFor(() => expect(mocks.getOwnerSocialProfile).toHaveBeenCalled());
      expect(screen.queryByRole("button", { name: "Moment actions" })).toBeNull();
    }
  });

  it("shows the Moment, its pets, its household and when it was shared", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    expect(screen.getByTestId("moment-title").textContent).toBe("Beach day");
    expect(screen.getByTestId("moment-subjects").textContent).toContain("Mochi");
    expect(screen.getByTestId("shared-by-identity").textContent).toContain(
      "@tanfamily"
    );
    expect(screen.getByTestId("moment-published").textContent).toContain("2026");
    expect(screen.getByText("A bright afternoon by the water.")).toBeTruthy();
  });

  it("offers Like, Comment and Share as distinct actions", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const detail = screen.getByTestId("moment-detail");

    expect(within(detail).getByRole("button", { name: /share/i })).toBeTruthy();

    // A visitor is offered the like control as a way in rather than a dead
    // heart, so it is a link here and a button once they are signed in.
    const like = within(detail).getByTestId("like-button-signin");

    expect(like.getAttribute("aria-label")).toContain("3 likes");

    const comments = within(detail).getByRole("link", { name: /comments on beach day/i });
    expect(comments.getAttribute("href")).toContain("#comments");
    expect(await screen.findByRole("heading", { name: /comments/i })).toBeTruthy();
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

  it("uses a deterministic Community route instead of guessing from browser history", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    expect(
      screen
        .getByRole("link", { name: "Back to The Tan Family" })
        .getAttribute("href")
    ).toBe("/u/tanfamily");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });

  /**
   * Pet above household.
   *
   * A card byline puts a display name and a handle on one line because a card
   * has a dozen of them and no room. A Moment's own page has one, and that line
   * was truncating both strings at once — neither readable, and neither
   * obviously the subject or the author.
   */
  it("shows the pet as the subject and the household as the author", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const subjects = screen.getByTestId("moment-subjects");
    const author = screen.getByTestId("shared-by-identity");

    expect(subjects.textContent).toContain("Mochi");
    expect(author.textContent).toContain("Shared by");
    expect(author.textContent).toContain("The Tan Family");
    expect(author.textContent).toContain("@tanfamily");

    // The pet leads; the household follows it.
    expect(
      subjects.compareDocumentPosition(author) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("stacks the household's two names rather than sharing one line", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const author = screen.getByTestId("shared-by-identity");
    const lines = [...author.querySelectorAll("span.block")];

    // Label, display name, handle — each on its own line, each free to use the
    // full width of the column before it truncates.
    expect(lines).toHaveLength(3);
    expect(lines[0].className).toContain("whitespace-nowrap");
    expect(lines[1].className).toContain("truncate");
    expect(lines[2].className).toContain("truncate");
    expect(author.querySelector("span.min-w-0")?.className).toContain("flex-1");
  });

  it("survives a long display name and a long handle together", async () => {
    mocks.getPublicMoment.mockResolvedValue(
      moment({
        author: {
          handle: "gbbsoftwaresolutions",
          displayName: "GBB Software Solutions Sdn Bhd",
          avatarUrl: null,
          avatarThumbnailUrl: null,
        },
      })
    );

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    const author = screen.getByTestId("shared-by-identity");

    // Both are present in full in the document; whether either needs to
    // truncate is a width question, and the column is the only thing that
    // shrinks — never the avatar, and never into a column of characters.
    expect(author.textContent).toContain("GBB Software Solutions Sdn Bhd");
    expect(author.textContent).toContain("@gbbsoftwaresolutions");
    expect(author.querySelector("span.h-11")?.className).toContain("shrink-0");
    expect(author.className).toContain("min-w-0");
  });

  it("keeps the Community bar, because hiding it would surface nothing", async () => {
    const source = (await import("node:fs")).readFileSync(
      (await import("node:path")).join(__dirname, "MomentDetailView.tsx"),
      "utf8"
    );

    // Measured rather than assumed: the action row sits below the fold on a
    // 812px screen with or without the bar, because a fixed bar releases
    // padding and not layout space. Removing it would cost the Community
    // navigation and buy nothing, so this page uses the same shell every other
    // public Community page uses.
    expect(source).toContain("SocialLayout");
    expect(source).not.toContain("hideBottomNav");
    expect(source).not.toContain("mobileNav={null}");
  });

  it("always offers a route-aware way back of its own", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    expect(
      screen.getByRole("link", { name: "Back to The Tan Family" })
    ).toBeTruthy();
  });

  it("says plainly when a Moment cannot be opened", async () => {
    // The server's own verdict: deleted, unshared, or blocked all arrive as
    // not-found, and all three must render this one page.
    mocks.getPublicMoment.mockRejectedValue(
      new PublicProfileUnavailableError("not-found")
    );

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    const unavailable = await screen.findByTestId("moment-unavailable");

    expect(unavailable.textContent).toContain("isn’t available");

    // Never a reason. "Taken down", "made private" and "they blocked you" must
    // read identically, or the page becomes a way to ask.
    expect(unavailable.textContent).not.toMatch(/blocked|private|deleted/i);
    expect(screen.queryByTestId("moment-detail")).toBeNull();
  });

  it("does not blame the family when the request simply failed", async () => {
    // A dropped connection is not evidence about anybody's sharing choice.
    // Reporting it as "the family may not be sharing it right now" invents a
    // reason, and hides the one thing that would actually help: try again.
    mocks.getPublicMoment.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    const failed = await screen.findByTestId("moment-load-failed");

    expect(failed.textContent).toMatch(/couldn.t load this Moment/i);
    expect(failed.textContent).not.toMatch(/sharing it right now|available/i);
    expect(screen.queryByTestId("moment-unavailable")).toBeNull();
    expect(
      within(failed).getByRole("button", { name: "Try again" })
    ).toBeTruthy();
  });

  it("retries the Moment when the visitor asks", async () => {
    mocks.getPublicMoment.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    const failed = await screen.findByTestId("moment-load-failed");
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));

    // The second call resolves from the default mock set up in beforeEach.
    await screen.findByTestId("moment-detail");
  });

  it("gives a visitor a way into the product rather than owner navigation", async () => {
    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    await screen.findByTestId("moment-detail");

    // The same shell Explore and search use when nobody is signed in: the brand,
    // a sign-in, and a way to start. Never a portal route a visitor cannot use.
    const header = screen.getByTestId("social-header-public");

    expect(within(header).getByRole("link", { name: /sign in/i })).toBeTruthy();
    expect(
      within(header).getByRole("button", { name: /create free pet profile/i })
    ).toBeTruthy();
  });

  it("holds a modest skeleton while it loads", () => {
    mocks.getPublicMoment.mockImplementation(() => new Promise(() => {}));

    render(<MomentDetailView momentId="9c1f8a2e-1111-4a2b-8c3d-4e5f60718293" />);

    expect(
      screen.getByTestId("moment-detail-loading").getAttribute("aria-busy")
    ).toBe("true");
  });
});

describe("Moment detail tab title", () => {
  const momentIdForTitle = "9c1f8a2e-1111-4a2b-8c3d-4e5f60718293";

  beforeEach(() => {
    // Every real Moment arrives through the exported 404 shell, whose own
    // metadata title is "Loading".
    document.head.innerHTML = "<title>Loading | MyPetLink</title>";
  });

  it("replaces Loading with the Moment's own title once it has loaded", async () => {
    mocks.getPublicMoment.mockResolvedValue(moment({ title: "My Big Boss" }));

    render(<MomentDetailView momentId={momentIdForTitle} />);

    await screen.findByTestId("moment-detail");
    await waitFor(() => expect(document.title).toBe("My Big Boss | MyPetLink"));
  });

  it("keeps the Moment's title when the shell's Loading title is committed again", async () => {
    // Next commits the shell's metadata into <head> after hydration — after
    // this view's first effect. That was the bug: the tab went back to
    // "Loading" beside a Moment that had finished loading.
    mocks.getPublicMoment.mockResolvedValue(moment({ title: "My Big Boss" }));

    render(<MomentDetailView momentId={momentIdForTitle} />);
    await waitFor(() => expect(document.title).toBe("My Big Boss | MyPetLink"));

    document.head.innerHTML = "<title>Loading | MyPetLink</title>";

    await waitFor(() => expect(document.title).toBe("My Big Boss | MyPetLink"));
  });

  it("stops holding the title once the page has gone", async () => {
    mocks.getPublicMoment.mockResolvedValue(moment({ title: "My Big Boss" }));

    const view = render(<MomentDetailView momentId={momentIdForTitle} />);
    await waitFor(() => expect(document.title).toBe("My Big Boss | MyPetLink"));

    view.unmount();
    document.title = "The Tan Family | MyPetLink";
    await Promise.resolve();

    expect(document.title).toBe("The Tan Family | MyPetLink");
  });

  it("says Moment not found for a Moment that cannot be shown", async () => {
    mocks.getPublicMoment.mockRejectedValue(
      new PublicProfileUnavailableError("not-found")
    );

    render(<MomentDetailView momentId={momentIdForTitle} />);

    await screen.findByTestId("moment-unavailable");
    await waitFor(() => expect(document.title).toBe("Moment not found | MyPetLink"));
  });

  it("does not call a failed request a missing Moment", async () => {
    mocks.getPublicMoment.mockRejectedValue(new TypeError("Failed to fetch"));

    render(<MomentDetailView momentId={momentIdForTitle} />);

    await screen.findByTestId("moment-load-failed");
    await waitFor(() => expect(document.title).toBe("Moment unavailable | MyPetLink"));
  });

  it("holds the edge's title for this Moment while it loads, even over the shell's Loading", async () => {
    document.head.innerHTML =
      "<title>My Big Boss | MyPetLink</title>" +
      `<meta name="mypetlink-moment" content="${momentIdForTitle}" data-title="My Big Boss">`;
    mocks.getPublicMoment.mockImplementation(() => new Promise(() => {}));

    render(<MomentDetailView momentId={momentIdForTitle} />);

    // Next commits the 404 shell's metadata after hydration.
    document.head.querySelector("title")!.textContent = "Loading | MyPetLink";

    await waitFor(() => expect(document.title).toBe("My Big Boss | MyPetLink"));
  });

  it("never borrows the edge's title for a different Moment", () => {
    document.head.innerHTML =
      "<title>Loading | MyPetLink</title>" +
      '<meta name="mypetlink-moment" content="another-moment" data-title="Someone else">';
    mocks.getPublicMoment.mockImplementation(() => new Promise(() => {}));

    render(<MomentDetailView momentId={momentIdForTitle} />);

    expect(document.title).toBe("Loading | MyPetLink");
  });

  it("leaves the title alone while the Moment is still loading", () => {
    // In production the edge has already named the page; a placeholder here
    // would replace the right title with a worse one.
    document.head.innerHTML = "<title>My Big Boss | MyPetLink</title>";
    mocks.getPublicMoment.mockImplementation(() => new Promise(() => {}));

    render(<MomentDetailView momentId={momentIdForTitle} />);

    expect(document.title).toBe("My Big Boss | MyPetLink");
  });
});
