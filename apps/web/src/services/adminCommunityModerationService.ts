import { apiRequest, isApiClientError } from "@/services/apiClient";
import type { CommunityHousehold } from "@/services/adminCommunityReportService";
import type { CommunityModerationReason } from "@/lib/communityModeration";

/**
 * Community moderation without a report: the Moments and Comments lists, a
 * Comment in context, a household's moderation standing and history, and the
 * actions taken directly from them. Admin-only; the API decides who may do
 * what, and every action is recorded against the signed-in moderator.
 */

export type CommunityMomentStatus = "Visible" | "NotVisible" | "Removed";

export type CommunityMomentSummary = {
  id: string;
  title: string;
  captionPreview: string | null;
  author: CommunityHousehold;
  petName: string | null;
  publishedAt: string | null;
  status: CommunityMomentStatus;
  removedAt: string | null;
  likeCount: number;
  commentCount: number;
};

export type CommunityMedia = {
  mediaFileId: string;
  type: "image" | "video";
  url: string | null;
  caption: string | null;
  altText: string | null;
  sortOrder: number;
};

export type CommunityCurrentMoment = {
  id: string;
  title: string;
  caption: string | null;
  visibility: string;
  publishedAt: string | null;
  archivedAt: string | null;
  deleted: boolean;
  hidden: boolean;
  hiddenAt: string | null;
  publiclyVisible: boolean;
  author: CommunityHousehold;
  media: CommunityMedia[];
};

export type ModerationHistoryItem = {
  id: string;
  action: string;
  reason: string | null;
  internalRemark: string | null;
  performedByName: string | null;
  createdAt: string;
  restrictedUntil: string | null;
  momentId: string | null;
  commentId: string | null;
  reportId: string | null;
  contentSnapshot: string | null;
};

export type CommunityMomentDetail = {
  moment: CommunityCurrentMoment;
  petName: string | null;
  likeCount: number;
  commentCount: number;
  history: ModerationHistoryItem[];
  availableActions: string[];
};

export type CommunityCommentStatus = "Active" | "RemovedByMyPetLink" | "DeletedByAuthor" | "DeletedByMomentAuthor";

export type CommunityCommentSummary = {
  id: string;
  kind: "Comment" | "Reply";
  body: string | null;
  author: CommunityHousehold;
  momentId: string;
  momentTitle: string;
  parentCommentId: string | null;
  createdAt: string;
  status: CommunityCommentStatus;
  removedAt: string | null;
  publiclyVisible: boolean;
};

export type CommunityCurrentComment = {
  id: string;
  momentId: string;
  body: string;
  createdAt: string;
  removed: boolean;
  removedAt: string | null;
  removedBy: "Author" | "MomentAuthor" | "MyPetLink" | null;
  publiclyVisible: boolean;
  author: CommunityHousehold;
  parentCommentId: string | null;
  parentComment: {
    id: string;
    body: string | null;
    createdAt: string;
    removed: boolean;
    publiclyVisible: boolean;
    author: CommunityHousehold;
  } | null;
  replyCount: number | null;
};

export type CommunityThreadItem = {
  id: string;
  body: string | null;
  createdAt: string;
  removed: boolean;
  author: CommunityHousehold;
};

export type CommunityCommentContext = {
  comment: CommunityCurrentComment;
  moment: CommunityCurrentMoment | null;
  threadReplies: CommunityThreadItem[];
  threadReplyTotal: number;
  history: ModerationHistoryItem[];
  availableActions: string[];
};

export type HouseholdCommunityStatus = "NotSetUp" | "Off" | "On" | "Restricted" | "Suspended";

export type HouseholdModeration = {
  household: CommunityHousehold;
  accountStatus: string;
  communityStatus: HouseholdCommunityStatus;
  warningCount: number;
  restrictedAt: string | null;
  restrictedUntil: string | null;
  history: ModerationHistoryItem[];
  historyTotal: number;
  availableActions: string[];
};

export type CommunityRestrictionDuration = "24h" | "7d" | "30d" | "permanent";

export const restrictionDurations: Record<CommunityRestrictionDuration, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  permanent: "Until lifted (Community suspension)",
};

export type ModerationActionResult = {
  actionId: string;
  action: string;
  restrictedUntil: string | null;
};

/** History entries in moderators' words. */
export const moderationHistoryLabels: Record<string, string> = {
  MomentRemoved: "Moment removed",
  MomentRestored: "Moment restored",
  CommentRemoved: "Comment removed",
  ReplyRemoved: "Reply removed",
  WarningIssued: "Warning issued",
  CommunityRestricted: "Community restricted",
  CommunityRestrictionLifted: "Community restriction lifted",
  CommunityRestrictionExpired: "Community restriction ended",
  AccountSuspended: "Account suspended",
  AccountReinstated: "Account reinstated",
};

export function moderationHistoryLabel(item: Pick<ModerationHistoryItem, "action" | "restrictedUntil">) {
  if (item.action === "CommunityRestricted" && !item.restrictedUntil) return "Community permanently suspended";
  return moderationHistoryLabels[item.action] ?? item.action;
}

type ListParams = Record<string, string | number | undefined>;

function query(params: ListParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

export async function listCommunityMoments(params: ListParams, signal?: AbortSignal) {
  const response = await apiRequest<CommunityMomentSummary[]>(
    `/api/v1/admin/community/moments?${query(params)}`,
    { signal, cache: "no-store" }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function getCommunityMoment(id: string, signal?: AbortSignal) {
  const response = await apiRequest<CommunityMomentDetail>(
    `/api/v1/admin/community/moments/${encodeURIComponent(id)}`,
    { signal, cache: "no-store" }
  );
  if (!response.data) throw new Error("Moment unavailable");
  return response.data;
}

export async function listCommunityComments(params: ListParams, signal?: AbortSignal) {
  const response = await apiRequest<CommunityCommentSummary[]>(
    `/api/v1/admin/community/comments?${query(params)}`,
    { signal, cache: "no-store" }
  );
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function getCommunityComment(id: string, signal?: AbortSignal) {
  const response = await apiRequest<CommunityCommentContext>(
    `/api/v1/admin/community/comments/${encodeURIComponent(id)}`,
    { signal, cache: "no-store" }
  );
  if (!response.data) throw new Error("Comment unavailable");
  return response.data;
}

export async function getHouseholdModeration(ownerId: string, signal?: AbortSignal) {
  const response = await apiRequest<HouseholdModeration>(
    `/api/v1/admin/community/households/${encodeURIComponent(ownerId)}`,
    { signal, cache: "no-store" }
  );
  if (!response.data) throw new Error("Household unavailable");
  return response.data;
}

async function act(path: string, body: Record<string, unknown>) {
  const response = await apiRequest<ModerationActionResult>(path, { method: "POST", body, cache: "no-store" });
  if (!response.data) throw new Error("Action unavailable");
  return response.data;
}

const remarkBody = (remark: string) => (remark.trim() ? { remark: remark.trim() } : {});

export const removeCommunityMoment = (id: string, reason: CommunityModerationReason, remark: string) =>
  act(`/api/v1/admin/community/moments/${encodeURIComponent(id)}/remove`, { reason, ...remarkBody(remark) });

export const restoreCommunityMoment = (id: string, remark: string) =>
  act(`/api/v1/admin/community/moments/${encodeURIComponent(id)}/restore`, remarkBody(remark));

export const removeCommunityComment = (id: string, reason: CommunityModerationReason, remark: string) =>
  act(`/api/v1/admin/community/comments/${encodeURIComponent(id)}/remove`, { reason, ...remarkBody(remark) });

export const issueCommunityWarning = (ownerId: string, reason: CommunityModerationReason, remark: string) =>
  act(`/api/v1/admin/community/households/${encodeURIComponent(ownerId)}/warnings`, { reason, ...remarkBody(remark) });

export const restrictCommunity = (
  ownerId: string,
  reason: CommunityModerationReason,
  duration: CommunityRestrictionDuration,
  remark: string
) =>
  act(`/api/v1/admin/community/households/${encodeURIComponent(ownerId)}/restrict`, {
    reason,
    duration,
    ...remarkBody(remark),
  });

export const liftCommunityRestriction = (ownerId: string, remark: string) =>
  act(`/api/v1/admin/community/households/${encodeURIComponent(ownerId)}/lift-restriction`, remarkBody(remark));

export const suspendOwnerAccount = (ownerId: string, reason: CommunityModerationReason, remark: string) =>
  act(`/api/v1/admin/owners/${encodeURIComponent(ownerId)}/suspend`, { reason, ...remarkBody(remark) });

export const reinstateOwnerAccount = (ownerId: string, remark: string) =>
  act(`/api/v1/admin/owners/${encodeURIComponent(ownerId)}/reinstate`, remarkBody(remark));

/** Admin-facing copy for a failed moderation request. */
export function directModerationErrorMessage(error: unknown) {
  if (!isApiClientError(error)) return "We couldn’t complete this action. Please try again.";
  switch (error.code) {
    case "moderation_conflict_of_interest":
      return "Another moderator needs to handle this because it involves your own household.";
    case "content_already_removed":
      return "This has already been removed. Refreshing the latest state.";
    case "moment_not_hidden":
      return "This Moment isn’t removed. Refreshing the latest state.";
    case "household_not_restricted":
      return "This household’s Community access isn’t restricted. Refreshing the latest state.";
    case "household_unavailable":
      return "This household hasn’t set up a Community Profile, so there is no Community access to restrict.";
    case "account_already_suspended":
      return "This account is already suspended. Refreshing the latest state.";
    case "account_not_suspended":
      return "This account isn’t suspended. Refreshing the latest state.";
    case "account_not_active":
      return "Only an active account can be suspended.";
    case "account_is_admin":
      return "Admin Portal accounts are managed from Access, not suspended here.";
    case "moderation_remark_too_long":
      return "Keep the internal remark within 1,000 characters.";
    case "community_content_not_found":
      return "This content is no longer available.";
    case "owner_not_found":
      return "This owner could not be found.";
  }
  if (error.status === 403) return "Your access to this action has changed. Please contact an administrator.";
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 409) return "This changed while you were reviewing it. Refreshing the latest state.";
  if (error.status === 400) return "Choose a reason and try again.";
  return "We couldn’t complete this action. Please try again.";
}
