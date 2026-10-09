import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/services/apiClient", () => ({ apiRequest: mocks.apiRequest }));

import { getSocialNotifications } from "@/services/socialNotificationService";

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe("Social activity compatibility", () => {
  it("keeps Reply Activity returned by the server and its unread count", async () => {
    const actor = { handle: "ben", displayName: "Ben", avatarUrl: null, avatarThumbnailUrl: null };
    mocks.apiRequest.mockResolvedValue({ data: { items: [{ id: "reply-activity", type: "MomentCommentReplied", createdAt: "2026-09-24T00:00:00Z", isRead: false, actor, momentId: "moment", commentId: "reply" }], nextCursor: null, unreadCount: 1 } });
    const page = await getSocialNotifications();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ type: "MomentCommentReplied", commentId: "reply", actor, isRead: false });
    expect(page.unreadCount).toBe(1);
  });
  it("skips unknown activity instead of presenting it as a Like", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        items: [
          {
            id: "unknown-1",
            type: "FutureActivity",
            createdAt: "2026-09-24T00:00:00Z",
            isRead: false,
            actor: {
              handle: "future",
              displayName: "Future Family",
              avatarUrl: null,
              avatarThumbnailUrl: null,
            },
          },
        ],
        nextCursor: null,
        unreadCount: 0,
      },
    });

    const page = await getSocialNotifications();

    expect(page.items).toEqual([]);
  });

  it("keeps collaboration activity, with pet names defaulted", async () => {
    const actor = { handle: "tanfamily", displayName: "The Tan Family", avatarUrl: null, avatarThumbnailUrl: null };
    mocks.apiRequest.mockResolvedValue({
      data: {
        items: [
          { id: "a", type: "MomentCollaborationRequested", createdAt: "2026-09-24T00:00:00Z", isRead: false, actor, momentId: "m1", collaborationPetNames: ["Mochi"] },
          { id: "b", type: "MomentCollaborationAccepted", createdAt: "2026-09-24T00:00:00Z", isRead: false, actor, momentId: "m1" },
        ],
        nextCursor: null,
        unreadCount: 2,
      },
    });

    const page = await getSocialNotifications();

    expect(page.items.map((item) => item.type)).toEqual([
      "MomentCollaborationRequested",
      "MomentCollaborationAccepted",
    ]);
    expect(page.items[0].collaborationPetNames).toEqual(["Mochi"]);
    expect(page.items[1].collaborationPetNames).toEqual([]);
  });

  it("keeps a moderation notice from MyPetLink, which has no actor, and drops one it cannot word", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        items: [
          { id: "n1", type: "CommunityModerationNotice", createdAt: "2026-10-08T00:00:00Z", isRead: false, actor: null, moderation: { action: "CommentRemoved", reason: "SpamOrAdvertising", restrictedUntil: null } },
          { id: "n2", type: "CommunityModerationNotice", createdAt: "2026-10-08T00:00:00Z", isRead: false, actor: null, moderation: { action: "SomethingNew", reason: null, restrictedUntil: null } },
          { id: "n3", type: "CommunityModerationNotice", createdAt: "2026-10-08T00:00:00Z", isRead: false, actor: null, moderation: null },
        ],
        nextCursor: null,
        unreadCount: 3,
      },
    });

    const page = await getSocialNotifications();

    expect(page.items.map((item) => item.id)).toEqual(["n1"]);
    expect(page.items[0]).toMatchObject({ actor: null, moderation: { action: "CommentRemoved", reason: "SpamOrAdvertising" } });
  });
});
