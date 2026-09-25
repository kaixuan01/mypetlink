// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SocialNotificationPage } from "@/services/socialNotificationService";

const mocks = vi.hoisted(() => ({
  getSocialNotifications: vi.fn(),
  markActivityRead: vi.fn(),
}));

vi.mock("@/services/socialNotificationService", () => ({
  getSocialNotifications: (...args: unknown[]) =>
    mocks.getSocialNotifications(...args),
  markActivityRead: (...args: unknown[]) => mocks.markActivityRead(...args),
  getUnreadActivityCount: vi.fn().mockResolvedValue(0),
}));

import { SocialNotificationsView } from "@/components/social/SocialNotificationsView";

function follow(handle: string, isRead = false) {
  return {
    id: `follow-${handle}`,
    type: "NewFollower" as const,
    createdAt: "2026-09-15T08:00:00Z",
    isRead,
    actor: {
      handle,
      displayName: `The ${handle} Family`,
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    petName: null,
    petPublicSlug: null,
    momentId: null,
    momentTitle: null,
    momentSubjectNames: [],
  };
}

function collaboration(
  handle: string,
  type: "MomentCollaborationRequested" | "MomentCollaborationAccepted",
  pets: string[]
) {
  return {
    ...follow(handle),
    id: `collab-${handle}`,
    type,
    momentId: "8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c",
    momentTitle: "Beach day",
    collaborationPetNames: pets,
  };
}

function like(
  handle: string,
  pets: string[],
  momentId: string | null = "8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c"
) {
  return {
    id: `like-${handle}`,
    type: "MomentLiked" as const,
    createdAt: "2026-09-15T06:00:00Z",
    isRead: false,
    actor: {
      handle,
      displayName: `The ${handle} Family`,
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    petName: "Mochi",
    petPublicSlug: "mochi-pubmochi",
    momentId,
    momentTitle: "Beach day",
    momentSubjectNames: pets,
  };
}

function comment(handle: string, commentId: string | null = "comment-1") {
  return {
    id: `comment-${handle}`,
    type: "MomentCommented" as const,
    createdAt: "2026-09-15T07:00:00Z",
    isRead: false,
    actor: {
      handle,
      displayName: `The ${handle} Family`,
      avatarUrl: null,
      avatarThumbnailUrl: null,
    },
    petName: "Mochi",
    petPublicSlug: "mochi-pubmochi",
    momentId: "8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c",
    commentId,
    momentTitle: "Beach day",
    momentSubjectNames: ["Mochi"],
  };
}

function mention(handle: string, commentId: string | null = "comment-mention-1") {
  return {
    ...comment(handle, commentId),
    id: `mention-${handle}`,
    type: "MomentCommentMentioned" as const,
  };
}

function page(
  items: SocialNotificationPage["items"],
  unreadCount = items.filter((item) => !item.isRead).length,
  nextCursor: string | null = null
): SocialNotificationPage {
  return { items, nextCursor, unreadCount };
}

beforeEach(() => {
  mocks.getSocialNotifications.mockResolvedValue(
    page([follow("limfamily"), like("raofamily", ["Mochi", "Coco"])])
  );
  mocks.markActivityRead.mockResolvedValue(0);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SocialNotificationsView", () => {
  it("says who did what, in the owner-as-actor voice", async () => {
    render(<SocialNotificationsView />);

    const list = await screen.findByTestId("activity-list");

    expect(
      within(list).getByText(/started following you\./)
    ).toBeTruthy();
    expect(
      within(list).getByText(/liked your Moment of Mochi & Coco\./)
    ).toBeTruthy();
  });

  it("marks only the rows it actually delivered", async () => {
    render(<SocialNotificationsView />);

    await screen.findByTestId("activity-list");

    // Never a blanket "mark everything": activity three pages down, which this
    // client was never sent, is not something the user has seen.
    await waitFor(() =>
      expect(mocks.markActivityRead).toHaveBeenCalledWith([
        "follow-limfamily",
        "like-raofamily",
      ])
    );

    // The rows keep their unread treatment for this visit; a list that blanks
    // itself the instant you arrive is a list you cannot read.
    expect(screen.getAllByTestId("activity-unread-marker").length).toBe(2);
  });

  it("marks each further page as that page arrives", async () => {
    mocks.getSocialNotifications
      .mockResolvedValueOnce(page([follow("limfamily")], 3, "cursor-2"))
      .mockResolvedValueOnce(page([follow("raofamily")], 2));

    render(<SocialNotificationsView />);

    await waitFor(() =>
      expect(mocks.markActivityRead).toHaveBeenCalledWith(["follow-limfamily"])
    );

    fireEvent.click(await screen.findByRole("button", { name: /show more/i }));

    await waitFor(() =>
      expect(mocks.markActivityRead).toHaveBeenLastCalledWith(["follow-raofamily"])
    );
  });

  it("leaves already-read rows alone rather than marking them again", async () => {
    mocks.getSocialNotifications.mockResolvedValue(
      page([follow("limfamily", true), follow("raofamily")], 1)
    );

    render(<SocialNotificationsView />);

    await screen.findByTestId("activity-list");

    await waitFor(() =>
      expect(mocks.markActivityRead).toHaveBeenCalledWith(["follow-raofamily"])
    );
  });

  it("does not mark anything read when there was nothing unread", async () => {
    mocks.getSocialNotifications.mockResolvedValue(
      page([follow("limfamily", true)], 0)
    );

    render(<SocialNotificationsView />);

    await screen.findByTestId("activity-list");

    expect(mocks.markActivityRead).not.toHaveBeenCalled();
  });

  it("signals unread with more than colour", async () => {
    render(<SocialNotificationsView />);

    const rows = await screen.findAllByTestId("activity-row");

    // A dot, the word "New", a distinct ground, and it is in the accessible
    // name — somebody who cannot see the tint still knows.
    expect(rows[0].getAttribute("data-read")).toBe("false");
    expect(within(rows[0]).getByText("New")).toBeTruthy();
    expect(rows[0].getAttribute("aria-label")).toContain("Unread.");
  });

  it("says where each row leads, not just what happened", async () => {
    render(<SocialNotificationsView />);

    const rows = await screen.findAllByTestId("activity-row");

    expect(rows[0].getAttribute("href")).toBe("/u/limfamily");
    expect(rows[0].getAttribute("aria-label")).toContain("View The limfamily Family's profile");

    // A like opens the exact Moment it is about, which is what the sentence
    // beside it describes. It used to have to settle for the pet's profile,
    // because a Moment had nowhere of its own to be.
    expect(rows[1].getAttribute("href")).toBe(
      "/moments/8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c"
    );
    expect(rows[1].getAttribute("aria-label")).toContain("View this Moment");
  });

  it("falls back to the pet's profile for a like recorded before Moments had a page", async () => {
    mocks.getSocialNotifications.mockResolvedValue(
      page([like("raofamily", ["Mochi"], null)])
    );

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];

    // Older rows may hold no Moment id. They still lead somewhere true rather
    // than nowhere.
    expect(row.getAttribute("href")).toBe("/p/mochi-pubmochi");
    expect(row.getAttribute("aria-label")).toContain("View Mochi's profile");
  });

  it("links Comment activity to the active Comment anchor", async () => {
    mocks.getSocialNotifications.mockResolvedValue(page([comment("limfamily")]));

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];
    expect(row.textContent).toContain("commented on your Moment");
    expect(row.getAttribute("href")).toBe(
      "/moments/8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c#comment-comment-1"
    );
    expect(row.getAttribute("aria-label")).toContain("View this comment");
  });

  it("falls back to the Comments section when retained activity has no active Comment", async () => {
    mocks.getSocialNotifications.mockResolvedValue(page([comment("limfamily", null)]));

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];
    expect(row.getAttribute("href")).toBe(
      "/moments/8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c#comments"
    );
  });

  it("links mention activity to the exact Comment", async () => {
    mocks.getSocialNotifications.mockResolvedValue(page([mention("limfamily")]));

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];
    expect(row.textContent).toContain("mentioned you in a comment.");
    expect(row.getAttribute("href")).toBe(
      "/moments/8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c#comment-comment-mention-1"
    );
    expect(row.getAttribute("aria-label")).toContain("View this comment");
  });

  it("keeps retained mention activity useful when its Comment is unavailable", async () => {
    mocks.getSocialNotifications.mockResolvedValue(page([mention("limfamily", null)]));

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];
    expect(row.getAttribute("href")).toBe(
      "/moments/8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c#comments"
    );
  });

  it("opens a collaboration invitation on its Moment, naming the requested pets", async () => {
    mocks.getSocialNotifications.mockResolvedValue(
      page([collaboration("tanfamily", "MomentCollaborationRequested", ["Mochi", "Milo"])])
    );

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];
    expect(row.textContent).toContain("invited Mochi & Milo to collaborate on a Moment.");
    expect(row.getAttribute("href")).toBe("/moments/8f1d2c3b-4a5e-4f6a-8b9c-0d1e2f3a4b5c");
    expect(row.getAttribute("aria-label")).toContain("Open the invitation");
    // Answering happens on the Moment, never inline in Activity.
    expect(within(row).queryByRole("button")).toBeNull();
    expect(row.textContent).not.toContain("liked");
  });

  it("tells the author which pets joined their Moment", async () => {
    mocks.getSocialNotifications.mockResolvedValue(
      page([collaboration("limfamily", "MomentCollaborationAccepted", ["Buddy"])])
    );

    render(<SocialNotificationsView />);

    const row = (await screen.findAllByTestId("activity-row"))[0];
    expect(row.textContent).toContain("joined your Moment with Buddy.");
    expect(row.getAttribute("aria-label")).toContain("View this Moment");
    expect(row.textContent).not.toContain("edit");
  });

  it("gives a timestamp machines can read", async () => {
    render(<SocialNotificationsView />);

    const rows = await screen.findAllByTestId("activity-row");
    const time = within(rows[0]).getByText(/\d|now/);

    expect(time.closest("time")?.getAttribute("datetime")).toBe(
      "2026-09-15T08:00:00Z"
    );
  });

  it("pages with the cursor", async () => {
    mocks.getSocialNotifications
      .mockResolvedValueOnce(page([follow("limfamily")], 1, "cursor-2"))
      .mockResolvedValueOnce(page([follow("raofamily")]));

    render(<SocialNotificationsView />);

    fireEvent.click(await screen.findByRole("button", { name: /show more/i }));

    await waitFor(() =>
      expect(mocks.getSocialNotifications).toHaveBeenLastCalledWith("cursor-2")
    );
    expect(await screen.findByText(/The raofamily Family/)).toBeTruthy();
  });

  it("explains an empty activity list rather than showing a blank screen", async () => {
    mocks.getSocialNotifications.mockResolvedValue(page([]));

    render(<SocialNotificationsView />);

    const empty = await screen.findByTestId("activity-empty");

    expect(empty.textContent).toContain("Nothing new yet");
    expect(empty.textContent).toContain("follow you, like a Moment, comment, or mention you");
  });

  it("offers a retry when activity cannot be loaded", async () => {
    mocks.getSocialNotifications.mockRejectedValueOnce(new Error("network"));

    render(<SocialNotificationsView />);

    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));

    expect(await screen.findByTestId("activity-list")).toBeTruthy();
  });

  it("never turns a failed mark-read into an error on screen", async () => {
    mocks.markActivityRead.mockRejectedValue(new Error("network"));

    render(<SocialNotificationsView />);

    expect(await screen.findByTestId("activity-list")).toBeTruthy();
    await waitFor(() => expect(mocks.markActivityRead).toHaveBeenCalled());
    expect(screen.queryByTestId("activity-error")).toBeNull();
  });
});
