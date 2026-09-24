import { apiRequest, isApiClientError } from "@/services/apiClient";
import type { PublicOwnerAttribution } from "@/services/publicSocialService";

export type MomentCommentDeleteAction = "delete" | "remove" | null;

export type MomentComment = {
  id: string;
  body: string;
  createdAt: string;
  author: PublicOwnerAttribution;
  viewerDeleteAction: MomentCommentDeleteAction;
};

export type MomentCommentViewer = {
  canComment: boolean;
  requirement: "signIn" | "communityProfile" | null;
  identity: PublicOwnerAttribution | null;
};

export type MomentCommentPage = {
  items: MomentComment[];
  nextCursor: string | null;
  commentCount: number;
  viewer: MomentCommentViewer;
};

export type CreateMomentCommentResult = {
  comment: MomentComment;
  commentCount: number;
};

export type DeleteMomentCommentResult = {
  commentId: string;
  commentCount: number;
};

export type MomentCommentErrorReason =
  | "validation"
  | "rate-limit"
  | "session"
  | "community-profile"
  | "unavailable"
  | "error";

export class MomentCommentError extends Error {
  constructor(
    readonly reason: MomentCommentErrorReason,
    message: string
  ) {
    super(message);
    this.name = "MomentCommentError";
  }
}

export async function getMomentComments(
  momentId: string,
  cursor?: string
): Promise<MomentCommentPage> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);

  try {
    const response = await apiRequest<MomentCommentPage>(
      `/api/v1/public/moments/${encodeURIComponent(momentId)}/comments?${params}`,
      { cache: "no-store" }
    );

    return {
      items: response.data?.items ?? [],
      nextCursor: response.data?.nextCursor ?? null,
      commentCount: response.data?.commentCount ?? 0,
      viewer: response.data?.viewer ?? {
        canComment: false,
        requirement: "signIn",
        identity: null,
      },
    };
  } catch (error) {
    throw mapCommentError(error);
  }
}

export async function createMomentComment(
  momentId: string,
  body: string
): Promise<CreateMomentCommentResult> {
  try {
    const response = await apiRequest<CreateMomentCommentResult>(
      `/api/v1/social/moments/${encodeURIComponent(momentId)}/comments`,
      { method: "POST", body: { body } }
    );
    if (!response.data) throw new Error("Missing Comment response.");
    return response.data;
  } catch (error) {
    throw mapCommentError(error);
  }
}

export async function deleteMomentComment(
  momentId: string,
  commentId: string
): Promise<DeleteMomentCommentResult> {
  try {
    const response = await apiRequest<DeleteMomentCommentResult>(
      `/api/v1/social/moments/${encodeURIComponent(momentId)}/comments/${encodeURIComponent(commentId)}`,
      { method: "DELETE" }
    );
    if (!response.data) throw new Error("Missing Comment response.");
    return response.data;
  } catch (error) {
    throw mapCommentError(error);
  }
}

function mapCommentError(error: unknown): MomentCommentError {
  // The structural fallback also covers errors crossing a test iframe or
  // another JS realm, where instanceof cannot recognize the same class.
  if (
    !isApiClientError(error) &&
    !(
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      "code" in error &&
      "message" in error
    )
  ) {
    return new MomentCommentError("error", "We couldn’t complete that request.");
  }

  const apiError = error as {
    status: number;
    code: string;
    message: string;
  };

  if (apiError.status === 401) {
    return new MomentCommentError("session", "Sign in to comment.");
  }
  if (apiError.status === 404) {
    return new MomentCommentError(
      "unavailable",
      "This Moment isn’t available any more."
    );
  }
  if (apiError.status === 429) {
    return new MomentCommentError(
      "rate-limit",
      "You’re commenting a lot right now. Please wait a moment and try again."
    );
  }
  if (apiError.code === "community_profile_required") {
    return new MomentCommentError(
      "community-profile",
      "Set up your Community profile to comment."
    );
  }
  if (apiError.status === 422) {
    return new MomentCommentError("validation", apiError.message);
  }

  return new MomentCommentError("error", apiError.message);
}
