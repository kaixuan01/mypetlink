import { apiRequest, isApiClientError } from "@/services/apiClient";
import type { PublicOwnerAttribution } from "@/services/publicSocialService";

/**
 * Moment collaboration: another household, with its owner's consent, adding
 * some of its pets to a public Moment. The Moment stays its author's; a
 * collaborator only ever decides for its own household.
 *
 * Every call here is signed in. Nothing about a pending or ended
 * collaboration is ever part of a public response.
 */

export const MAX_COLLABORATOR_HOUSEHOLDS = 3;

export type MomentCollaborationStatus =
  | "Pending"
  | "Accepted"
  | "Declined"
  | "Revoked"
  | "Left"
  | "Expired";

export type MomentCollaborationPet = {
  name: string;
  publicSlug: string;
  photoUrl: string | null;
  isAccepted: boolean;
};

export type MomentCollaboration = {
  id: string;
  status: MomentCollaborationStatus;
  /** The invited household. */
  household: PublicOwnerAttribution;
  pets: MomentCollaborationPet[];
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  endedAt: string | null;
};

export type MomentCollaborationList = {
  viewerRole: "author" | "invitee" | "none";
  author: PublicOwnerAttribution | null;
  maxHouseholds: number;
  liveHouseholds: number;
  canInvite: boolean;
  inviteUnavailableReason: "moment-not-public" | "limit-reached" | null;
  items: MomentCollaboration[];
};

export type CollaborationCandidatePet = {
  name: string;
  publicSlug: string;
  photoUrl: string | null;
};

export type CollaborationCandidate = {
  household: PublicOwnerAttribution;
  isFollowed: boolean;
  /** For the Moment being edited: null (can be invited), Pending, Accepted or Unavailable. */
  invitationState: "Pending" | "Accepted" | "Unavailable" | null;
  pets: CollaborationCandidatePet[];
};

export type CollaborationInvite = {
  household: PublicOwnerAttribution;
  pets: CollaborationCandidatePet[];
};

export class MomentCollaborationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "MomentCollaborationError";
  }
}

const emptyList: MomentCollaborationList = {
  viewerRole: "none",
  author: null,
  maxHouseholds: MAX_COLLABORATOR_HOUSEHOLDS,
  liveHouseholds: 0,
  canInvite: false,
  inviteUnavailableReason: null,
  items: [],
};

export async function getCollaborationCandidates(
  query: string,
  momentId?: string
): Promise<CollaborationCandidate[]> {
  const params = new URLSearchParams({ q: query });
  if (momentId) params.set("momentId", momentId);

  const response = await call<{ items: CollaborationCandidate[] }>(
    `/api/v1/social/collaboration-candidates?${params}`,
    { cache: "no-store" }
  );
  return response?.items ?? [];
}

export async function getMomentCollaborations(
  momentId: string
): Promise<MomentCollaborationList> {
  return normalizeList(
    await call<MomentCollaborationList>(
      `/api/v1/social/moments/${encodeURIComponent(momentId)}/collaborations`,
      { cache: "no-store" }
    )
  );
}

export async function inviteCollaborator(
  momentId: string,
  handle: string,
  petSlugs: string[]
): Promise<MomentCollaborationList> {
  return normalizeList(
    await call<MomentCollaborationList>(
      `/api/v1/social/moments/${encodeURIComponent(momentId)}/collaborations`,
      { method: "POST", body: { handle, petSlugs } }
    )
  );
}

export async function revokeCollaboration(
  momentId: string,
  collaborationId: string
): Promise<MomentCollaborationList> {
  return normalizeList(
    await call<MomentCollaborationList>(
      `/api/v1/social/moments/${encodeURIComponent(momentId)}/collaborations/${encodeURIComponent(collaborationId)}`,
      { method: "DELETE" }
    )
  );
}

export async function acceptCollaboration(
  collaborationId: string,
  petSlugs: string[]
): Promise<MomentCollaborationList> {
  return normalizeList(
    await call<MomentCollaborationList>(
      `/api/v1/social/collaborations/${encodeURIComponent(collaborationId)}/accept`,
      { method: "POST", body: { petSlugs } }
    )
  );
}

export async function declineCollaboration(
  collaborationId: string
): Promise<MomentCollaborationList> {
  return normalizeList(
    await call<MomentCollaborationList>(
      `/api/v1/social/collaborations/${encodeURIComponent(collaborationId)}/decline`,
      { method: "POST" }
    )
  );
}

export async function leaveCollaboration(
  collaborationId: string
): Promise<MomentCollaborationList> {
  return normalizeList(
    await call<MomentCollaborationList>(
      `/api/v1/social/collaborations/${encodeURIComponent(collaborationId)}/leave`,
      { method: "POST" }
    )
  );
}

/**
 * Sends each queued invitation for a Moment that has just been created. The
 * Moment is already saved; an invitation that fails is reported, never a
 * reason to undo the Moment.
 */
export async function sendCollaborationInvites(
  momentId: string,
  invites: CollaborationInvite[]
): Promise<{ failed: { invite: CollaborationInvite; message: string }[] }> {
  const failed: { invite: CollaborationInvite; message: string }[] = [];

  for (const invite of invites) {
    try {
      await inviteCollaborator(
        momentId,
        invite.household.handle,
        invite.pets.map((pet) => pet.publicSlug)
      );
    } catch (error) {
      failed.push({ invite, message: collaborationErrorMessage(error) });
    }
  }

  return { failed };
}

/** Copy for a failed collaboration request, written for the owner. */
export function collaborationErrorMessage(error: unknown) {
  if (error instanceof MomentCollaborationError) {
    return error.message;
  }

  return "We couldn't update collaborators right now. Please try again.";
}

async function call<T>(
  path: string,
  options: Parameters<typeof apiRequest>[1]
): Promise<T | undefined> {
  try {
    const response = await apiRequest<T>(path, options);
    return response.data;
  } catch (error) {
    if (isApiClientError(error)) {
      throw new MomentCollaborationError(
        error.code,
        error.status === 401
          ? "Sign in again to manage collaborators."
          : error.message || "We couldn't update collaborators right now. Please try again.",
        error.status
      );
    }

    throw error;
  }
}

function normalizeList(list: MomentCollaborationList | undefined): MomentCollaborationList {
  if (!list) return emptyList;
  return {
    ...emptyList,
    ...list,
    items: (list.items ?? []).map((item) => ({ ...item, pets: item.pets ?? [] })),
  };
}
