import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/services/apiClient", () => ({ apiRequest: mocks.apiRequest }));

import { getSocialNotifications } from "@/services/socialNotificationService";

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe("Social activity compatibility", () => {
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
});
