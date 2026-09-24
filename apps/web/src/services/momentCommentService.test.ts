import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

import {
  createMomentComment,
  deleteMomentComment,
  getMomentComments,
  MomentCommentError,
} from "@/services/momentCommentService";

beforeEach(() => {
  mocks.apiRequest.mockReset();
});

describe("Moment Comment service", () => {
  it("uses optional authentication for public reads", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        items: [],
        nextCursor: null,
        commentCount: 0,
        viewer: { canComment: false, requirement: "signIn", identity: null },
      },
    });

    await getMomentComments("moment-1");

    expect(mocks.apiRequest.mock.calls[0][1]).toEqual({ cache: "no-store" });
    expect(mocks.apiRequest.mock.calls[0][1]).not.toHaveProperty("auth", false);
  });

  it("encodes a stable cursor and caps reads at the API page size", async () => {
    mocks.apiRequest.mockResolvedValue({
      data: {
        items: [],
        nextCursor: null,
        commentCount: 0,
        viewer: { canComment: false, requirement: "signIn", identity: null },
      },
    });

    await getMomentComments("moment/1", "created+id=");

    expect(mocks.apiRequest.mock.calls[0][0]).toBe(
      "/api/v1/public/moments/moment%2F1/comments?limit=20&cursor=created%2Bid%3D"
    );
  });

  it("uses authenticated mutation routes for create and delete", async () => {
    mocks.apiRequest
      .mockResolvedValueOnce({
        data: {
          comment: {
            id: "comment-1",
            body: "Hello",
            createdAt: "2026-09-24T00:00:00Z",
            author: null,
            viewerDeleteAction: "delete",
          },
          commentCount: 1,
        },
      })
      .mockResolvedValueOnce({ data: { commentId: "comment-1", commentCount: 0 } });

    await createMomentComment("moment-1", "Hello");
    await deleteMomentComment("moment-1", "comment-1");

    expect(mocks.apiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/v1/social/moments/moment-1/comments",
      { method: "POST", body: { body: "Hello" } }
    );
    expect(mocks.apiRequest).toHaveBeenNthCalledWith(
      2,
      "/api/v1/social/moments/moment-1/comments/comment-1",
      { method: "DELETE" }
    );
  });

  for (const [status, code, expectedReason] of [
    [422, "comment_body_required", "validation"],
    [429, "rate_limit_exceeded", "rate-limit"],
    [401, "unauthorized", "session"],
    [404, "social_moment_not_found", "unavailable"],
    [403, "community_profile_required", "community-profile"],
  ] as const) {
    it(`maps ${status} ${code} to ${expectedReason}`, async () => {
      // Use the public error shape here so the mapping stays robust across
      // browser realms as well as for ApiClientError instances.
      mocks.apiRequest.mockImplementation(() => {
        throw { status, code, message: "Message" };
      });

      const error = await createMomentComment("moment-1", "Hello").catch(
        (caught) => caught
      );

      expect(error).toBeInstanceOf(MomentCommentError);
      expect((error as MomentCommentError).reason).toBe(expectedReason);
    });
  }
});
