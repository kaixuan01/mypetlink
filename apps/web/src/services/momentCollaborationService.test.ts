import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock("@/services/apiClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/apiClient")>();
  return { ...actual, apiRequest: mocks.apiRequest };
});

import { ApiClientError } from "@/services/apiClient";
import {
  acceptCollaboration,
  getCollaborationCandidates,
  getMomentCollaborations,
  MomentCollaborationError,
  sendCollaborationInvites,
} from "@/services/momentCollaborationService";

const household = (handle: string) => ({
  handle,
  displayName: handle,
  avatarUrl: null,
  avatarThumbnailUrl: null,
});

beforeEach(() => mocks.apiRequest.mockReset());

describe("Moment collaboration client", () => {
  it("uses the signed-in social routes and never sends an owner id", async () => {
    mocks.apiRequest.mockResolvedValue({ data: { items: [] } });

    await getCollaborationCandidates("lee", "m1");
    await acceptCollaboration("c 1", ["mochi-pub1"]);

    expect(mocks.apiRequest.mock.calls[0][0]).toBe(
      "/api/v1/social/collaboration-candidates?q=lee&momentId=m1"
    );
    expect(mocks.apiRequest.mock.calls[1][0]).toBe("/api/v1/social/collaborations/c%201/accept");
    expect(mocks.apiRequest.mock.calls[1][1]).toEqual({ method: "POST", body: { petSlugs: ["mochi-pub1"] } });
    expect(JSON.stringify(mocks.apiRequest.mock.calls)).not.toMatch(/userId|ownerId|petId/i);
  });

  it("fills a partial list response with safe defaults", async () => {
    mocks.apiRequest.mockResolvedValue({ data: { viewerRole: "author", items: [{ id: "a", status: "Pending", household: household("lee") }] } });

    const list = await getMomentCollaborations("m1");

    expect(list.maxHouseholds).toBe(3);
    expect(list.canInvite).toBe(false);
    expect(list.items[0].pets).toEqual([]);
  });

  it("reports each failed invitation without failing the rest", async () => {
    mocks.apiRequest
      .mockRejectedValueOnce(new ApiClientError(409, "collaboration_limit_reached", "Maximum 3 collaborator households for this Moment."))
      .mockResolvedValueOnce({ data: { viewerRole: "author", items: [] } });

    const { failed } = await sendCollaborationInvites("m1", [
      { household: household("leefamily"), pets: [{ name: "Mochi", publicSlug: "mochi-pub1", photoUrl: null }] },
      { household: household("ongfamily"), pets: [{ name: "Tofu", publicSlug: "tofu-pub2", photoUrl: null }] },
    ]);

    expect(mocks.apiRequest).toHaveBeenCalledTimes(2);
    expect(mocks.apiRequest.mock.calls[0][1]).toEqual({
      method: "POST",
      body: { handle: "leefamily", petSlugs: ["mochi-pub1"] },
    });
    expect(failed).toHaveLength(1);
    expect(failed[0].invite.household.handle).toBe("leefamily");
    expect(failed[0].message).toBe("Maximum 3 collaborator households for this Moment.");
  });

  it("turns an expired session into sign-in copy", async () => {
    mocks.apiRequest.mockImplementationOnce(async () => {
      throw new ApiClientError(401, "unauthorized", "Authentication is required.");
    });

    const error = await getMomentCollaborations("m1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MomentCollaborationError);
    expect((error as MomentCollaborationError).message).toBe("Sign in again to manage collaborators.");
  });
});
