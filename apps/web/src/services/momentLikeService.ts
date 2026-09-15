import { apiRequest } from "@/services/apiClient";

/**
 * Liking a Moment.
 *
 * The path names the Moment. Who is liking it is the authenticated session and
 * is never sent, so there is nothing a client could put in a body to leave a
 * like in somebody else's name.
 */

export type MomentLikeState = {
  momentId: string;
  likeCount: number;
  viewerHasLiked: boolean;
};

function likePath(momentId: string) {
  return `/api/v1/social/moments/${encodeURIComponent(momentId)}/like`;
}

function fallback(momentId: string, viewerHasLiked: boolean): MomentLikeState {
  return { momentId, likeCount: 0, viewerHasLiked };
}

export async function likeMoment(momentId: string): Promise<MomentLikeState> {
  const response = await apiRequest<MomentLikeState>(likePath(momentId), {
    method: "POST",
  });

  return response.data ?? fallback(momentId, true);
}

export async function unlikeMoment(momentId: string): Promise<MomentLikeState> {
  const response = await apiRequest<MomentLikeState>(likePath(momentId), {
    method: "DELETE",
  });

  return response.data ?? fallback(momentId, false);
}
