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
});
