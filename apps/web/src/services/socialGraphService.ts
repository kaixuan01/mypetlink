import { apiRequest } from "@/services/apiClient";

/**
 * Following and blocking.
 *
 * Every call names a TARGET by handle. The actor is the authenticated session
 * and is never sent: the API resolves it from the token, so there is nothing a
 * client could put in a body to act as somebody else.
 *
 * Reads are deliberately not gated behind a stored session — counts and lists
 * are public, and most people who open a shared profile link have no account.
 * When a session does exist the shared client attaches it, which is what turns
 * a relationship response from "no relationship" into the real one.
 */

export type OwnerRelationship = {
  isSelf: boolean;
  isFollowing: boolean;
  isFollowedBy: boolean;
  hasBlocked: boolean;
  /** False when either side has blocked, when self, or when followers are closed. */
  canFollow: boolean;
  /**
   * Whether the household accepts followers at all — a fact about them, not
   * about the viewer. A signed-out visitor has `canFollow: false` and still
   * needs this to be offered a way in.
   */
  allowsFollowers: boolean;
  followerCount: number;
  followingCount: number;
};

export type SocialAccountSummary = {
  handle: string;
  displayName: string;
  avatarThumbnailUrl: string | null;
  isFollowing: boolean;
  isSelf: boolean;
};

export type SocialAccountPage = {
  items: SocialAccountSummary[];
  /** Null when there is nothing further. Never infer "done" from a short page. */
  nextCursor: string | null;
};

export const noRelationship: OwnerRelationship = {
  isSelf: false,
  isFollowing: false,
  isFollowedBy: false,
  hasBlocked: false,
  canFollow: false,
  allowsFollowers: false,
  followerCount: 0,
  followingCount: 0,
};

function ownerPath(handle: string) {
  return `/api/v1/social/owners/${encodeURIComponent(handle.toLowerCase())}`;
}

export async function getOwnerRelationship(
  handle: string,
  signal?: AbortSignal
): Promise<OwnerRelationship> {
  const response = await apiRequest<OwnerRelationship>(
    `${ownerPath(handle)}/relationship`,
    { signal }
  );

  return response.data ?? noRelationship;
}

export async function followOwner(handle: string): Promise<OwnerRelationship> {
  const response = await apiRequest<OwnerRelationship>(
    `${ownerPath(handle)}/follow`,
    { method: "POST" }
  );

  return response.data ?? noRelationship;
}

export async function unfollowOwner(handle: string): Promise<OwnerRelationship> {
  const response = await apiRequest<OwnerRelationship>(
    `${ownerPath(handle)}/follow`,
    { method: "DELETE" }
  );

  return response.data ?? noRelationship;
}

export async function blockOwner(
  handle: string,
  reason?: string
): Promise<OwnerRelationship> {
  const response = await apiRequest<OwnerRelationship>(
    `${ownerPath(handle)}/block`,
    { method: "POST", body: { reason: reason?.trim() || null } }
  );

  return response.data ?? noRelationship;
}

export async function unblockOwner(handle: string): Promise<OwnerRelationship> {
  const response = await apiRequest<OwnerRelationship>(
    `${ownerPath(handle)}/block`,
    { method: "DELETE" }
  );

  return response.data ?? noRelationship;
}

export async function getOwnerFollowers(
  handle: string,
  cursor?: string,
  signal?: AbortSignal
): Promise<SocialAccountPage> {
  return getAccountPage(`${ownerPath(handle)}/followers`, cursor, signal);
}

export async function getOwnerFollowing(
  handle: string,
  cursor?: string,
  signal?: AbortSignal
): Promise<SocialAccountPage> {
  return getAccountPage(`${ownerPath(handle)}/following`, cursor, signal);
}

async function getAccountPage(
  path: string,
  cursor?: string,
  signal?: AbortSignal
): Promise<SocialAccountPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<SocialAccountPage>(`${path}${query}`, {
    signal,
  });

  return {
    items: response.data?.items ?? [],
    nextCursor: response.data?.nextCursor ?? null,
  };
}
