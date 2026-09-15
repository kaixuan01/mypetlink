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
    momentTitle: null,
    momentSubjectNames: [],
  };
}

function like(handle: string, pets: string[]) {
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
    momentTitle: "Beach day",
    momentSubjectNames: pets,
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

    // No standalone Moment route exists yet, so a like leads to the pet's own
    // public page, where the Moment is listed.
    expect(rows[1].getAttribute("href")).toBe("/p/mochi-pubmochi");
    expect(rows[1].getAttribute("aria-label")).toContain("View Mochi's profile");
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
    expect(empty.textContent).toContain("follow you or like a Moment");
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
