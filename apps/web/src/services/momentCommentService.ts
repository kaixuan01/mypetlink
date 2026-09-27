import { apiRequest, isApiClientError } from "@/services/apiClient";
import type { PublicOwnerAttribution } from "@/services/publicSocialService";

export type MomentCommentDeleteAction = "delete" | "remove" | null;

export type MomentComment = {
  id: string;
  body: string;
  createdAt: string;
  author: PublicOwnerAttribution;
  viewerDeleteAction: MomentCommentDeleteAction;
  mentions?: MomentCommentMention[];
  /** Absent only when talking to a pre-Replies deployment. */
  parentCommentId?: string | null;
  replyCount?: number;
};

/** UTF-16 offsets into the immutable Comment body, including the leading @. */
export type MomentCommentMention = {
  start: number;
  length: number;
  /** Resolved at read time so links follow a household's current handle. */
  household: PublicOwnerAttribution;
};

export type CommentMentionSuggestionContext =
  | "author"
  | "collaborator"
  | "commenter"
  | "following"
  | "discoverable";

export type CommentMentionSuggestion = {
  household: PublicOwnerAttribution;
  context: CommentMentionSuggestionContext;
};

export type CommentMentionSuggestions = {
  query: string;
  items: CommentMentionSuggestion[];
};

export type MomentCommentViewer = {
  canComment: boolean;
  /** Why this viewer cannot comment. "communityRestricted" means Community access is paused — never a setup prompt. */
  requirement: "signIn" | "communityProfile" | "communityRestricted" | null;
  identity: PublicOwnerAttribution | null;
};

export type MomentCommentPage = {
  items: MomentComment[];
  nextCursor: string | null;
  commentCount: number;
  viewer: MomentCommentViewer;
  anchorParentCommentId?: string | null;
};

export type MomentReplyPage = {
  parentCommentId: string;
  items: MomentComment[];
  nextCursor: string | null;
  replyCount: number;
};

/** F2's additive thread contract, not a count-based product switch. */
export function supportsCommentReplies(comment: MomentComment) {
  return comment.parentCommentId === null && typeof comment.replyCount === "number";
}

export type CreateMomentCommentResult = {
  comment: MomentComment;
  commentCount: number;
  parentCommentId?: string | null;
  parentReplyCount?: number | null;
};

export type DeleteMomentCommentResult = {
  commentId: string;
  commentCount: number;
  parentCommentId?: string | null;
  parentReplyCount?: number | null;
};

export type MomentCommentErrorReason =
  | "validation"
  | "rate-limit"
  | "session"
  | "community-profile"
  | "community-restricted"
  | "forbidden"
  | "unavailable"
  | "parent-unavailable"
  | "parent-invalid"
  | "error";

/** Shown to a household whose Community access MyPetLink has paused. Deliberately says nothing about why. */
export const COMMUNITY_PAUSED_MESSAGE = "Community access is currently paused.";

export class MomentCommentError extends Error {
  constructor(
    readonly reason: MomentCommentErrorReason,
    message: string
  ) {
    super(message);
    this.name = "MomentCommentError";
  }
}

const commentIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The Comment a `#comment-{id}` link points at, or null for any other hash.
 */
export function linkedCommentId(hash: string) {
  const match = /^#comment-(.+)$/.exec(hash);
  return match && commentIdPattern.test(match[1]) ? match[1] : null;
}

/**
 * One page of a thread, newest first.
 *
 * `anchor` asks the first page to reach down to a linked Comment. The API
 * honours it only for a Comment this viewer can already see within a bounded
 * depth, and otherwise answers exactly as if it had not been sent.
 */
export async function getMomentComments(
  momentId: string,
  cursor?: string,
  options: { anchor?: string | null } = {}
): Promise<MomentCommentPage> {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  else if (options.anchor) params.set("anchor", options.anchor);

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
      anchorParentCommentId: response.data?.anchorParentCommentId ?? null,
    };
  } catch (error) {
    throw mapCommentError(error);
  }
}

export async function createMomentComment(
  momentId: string,
  body: string,
  parentCommentId?: string
): Promise<CreateMomentCommentResult> {
  try {
    const response = await apiRequest<CreateMomentCommentResult>(
      `/api/v1/social/moments/${encodeURIComponent(momentId)}/comments`,
      { method: "POST", body: { body, ...(parentCommentId ? { parentCommentId } : {}) } }
    );
    if (!response.data) throw new Error("Missing Comment response.");
    return response.data;
  } catch (error) {
    throw mapCommentError(error);
  }
}

export async function getMomentReplies(
  momentId: string,
  parentCommentId: string,
  cursor?: string,
  options: { anchor?: string | null } = {},
): Promise<MomentReplyPage> {
  const params = new URLSearchParams({ limit: "10" });
  if (cursor) params.set("cursor", cursor);
  else if (options.anchor) params.set("anchor", options.anchor);
  try {
    const response = await apiRequest<MomentReplyPage>(
      `/api/v1/public/moments/${encodeURIComponent(momentId)}/comments/${encodeURIComponent(parentCommentId)}/replies?${params}`,
      { cache: "no-store" },
    );
    if (!response.data) throw new Error("Missing Reply page.");
    return response.data;
  } catch (error) {
    throw mapCommentError(error);
  }
}

export async function getCommentMentionSuggestions(
  momentId: string,
  query: string
): Promise<CommentMentionSuggestions> {
  const params = new URLSearchParams({ q: query });
  const response = await apiRequest<CommentMentionSuggestions>(
    `/api/v1/social/moments/${encodeURIComponent(momentId)}/comments/mention-suggestions?${params}`,
    { cache: "no-store" }
  );

  return {
    query: response.data?.query ?? query,
    // Preserve the server's contextual order. It is privacy-aware and more
    // meaningful than client-side alphabetizing.
    items: response.data?.items ?? [],
  };
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
    if (apiError.code === "comment_not_found") return new MomentCommentError("parent-unavailable", "This comment is no longer available.");
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
  if (apiError.code === "community_restricted") {
    return new MomentCommentError("community-restricted", COMMUNITY_PAUSED_MESSAGE);
  }
  if (apiError.status === 403) {
    return new MomentCommentError("forbidden", apiError.message);
  }
  if (apiError.status === 422) {
    if (apiError.code === "comment_reply_parent_invalid") return new MomentCommentError("parent-invalid", "This comment is no longer available. Please try again.");
    return new MomentCommentError("validation", apiError.message);
  }

  return new MomentCommentError("error", apiError.message);
}
