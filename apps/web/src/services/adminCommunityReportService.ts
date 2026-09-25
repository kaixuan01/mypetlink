import { apiRequest, isApiClientError } from "@/services/apiClient";

export type CommunityHousehold = {
  ownerId: string;
  handle: string | null;
  displayName: string | null;
  communityEnabled: boolean;
  communityRestricted: boolean;
  communityRestrictedAt: string | null;
  accountActive: boolean;
};

export type CommunityReportSummary = {
  id: string;
  targetType: "Comment" | "Moment" | "Household";
  reason: string;
  status: "Open" | "Resolved";
  resolution: string | null;
  createdAt: string;
  reviewedAt: string | null;
  snapshotHandle: string;
  snapshotDisplayName: string;
  reportedHousehold: CommunityHousehold;
  openReportsOnTarget: number;
};

export type CommunityReportHistoryItem = {
  id: string;
  targetType: string;
  reason: string;
  status: string;
  resolution: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type CommunityReportDetail = Pick<CommunityReportSummary, "id" | "targetType" | "reason" | "status" | "resolution" | "createdAt" | "reviewedAt" | "reportedHousehold" | "openReportsOnTarget"> & {
  details: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
  rowVersion: string;
  evidence: {
    handle: string;
    displayName: string;
    title: string | null;
    text: string | null;
    avatarUrl: string | null;
  };
  householdPubliclyVisible: boolean;
  currentComment: {
    body: string;
    removed: boolean;
    removedAt: string | null;
    removedBy: string | null;
    publiclyVisible: boolean;
  } | null;
  currentMoment: {
    title: string;
    caption: string | null;
    visibility: string;
    archivedAt: string | null;
    deleted: boolean;
    hidden: boolean;
    hiddenAt: string | null;
    publiclyVisible: boolean;
    media: { mediaFileId: string; type: string; url: string | null; caption: string | null; altText: string | null }[];
  } | null;
  targetHistory: CommunityReportHistoryItem[];
  targetHistoryTotal: number;
  householdHistory: CommunityReportHistoryItem[];
  householdHistoryTotal: number;
  involvesYou: boolean;
  availableActions: string[];
};

export type CommunityReportFilters = {
  page: number;
  pageSize: number;
  status?: string;
  targetType?: string;
  reason?: string;
  reportedOwnerId?: string;
  createdFrom?: string;
  createdTo?: string;
};

export const reportReasons = {
  SpamOrScam: "Spam or scam",
  HarassmentOrBullying: "Harassment or bullying",
  InappropriateContent: "Inappropriate content",
  AnimalWelfareConcern: "Animal welfare concern",
  Impersonation: "Impersonation",
  PrivacyConcern: "Privacy concern",
  Other: "Other",
} as const;

export type ModerationAction = "Dismiss" | "RemoveComment" | "HideMoment" | "UnhideMoment" | "RestrictHousehold" | "LiftRestriction";

export const moderationActions: Record<ModerationAction, { label: string; path: string; explanation: string; capability: "resolve" | "enforce"; destructive?: boolean }> = {
  Dismiss: { label: "Dismiss report", path: "dismiss", explanation: "This resolves all open reports for this same target. The reported content is not changed.", capability: "resolve" },
  RemoveComment: { label: "Remove Comment", path: "remove-comment", explanation: "The Comment will be removed and its body wiped. Related unread Activity and mentions are handled automatically. Report evidence remains available to moderators.", capability: "resolve", destructive: true },
  HideMoment: { label: "Hide Moment", path: "hide-moment", explanation: "The Moment will be hidden from Community surfaces. The owner’s original visibility setting is preserved.", capability: "enforce" },
  UnhideMoment: { label: "Unhide Moment", path: "unhide-moment", explanation: "This removes the moderation hide. The Moment will only become visible where the owner’s current settings allow it.", capability: "enforce" },
  RestrictHousehold: { label: "Restrict Community access", path: "restrict-household", explanation: "This restricts the household from Community while preserving the owner’s account, pets, Share Profiles, Safety Profiles, Smart Tags and other MyPetLink services.", capability: "enforce", destructive: true },
  LiftRestriction: { label: "Lift Community restriction", path: "lift-restriction", explanation: "This removes the moderation restriction and restores the household’s previously preserved Community setting.", capability: "enforce" },
};

export async function listCommunityReports(filters: CommunityReportFilters, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") params.set(key, String(value));
  const response = await apiRequest<CommunityReportSummary[]>(`/api/v1/admin/community-reports?${params}`, { signal, cache: "no-store" });
  return { items: response.data ?? [], total: response.meta?.total ?? 0 };
}

export async function getCommunityReport(id: string, signal?: AbortSignal) {
  const response = await apiRequest<CommunityReportDetail>(`/api/v1/admin/community-reports/${encodeURIComponent(id)}`, { signal, cache: "no-store" });
  if (!response.data) throw new Error("Report unavailable");
  return response.data;
}

export async function actOnCommunityReport(id: string, action: ModerationAction, note: string, rowVersion: string) {
  const response = await apiRequest<{ outcome: "Applied" | "AlreadyInEffect"; reportsResolved: number }>(
    `/api/v1/admin/community-reports/${encodeURIComponent(id)}/${moderationActions[action].path}`,
    { method: "POST", body: { note: note.trim(), rowVersion }, cache: "no-store" }
  );
  if (!response.data) throw new Error("Decision unavailable");
  return response.data;
}

export function moderationErrorMessage(error: unknown) {
  if (!isApiClientError(error)) return "We couldn’t complete this action. Please try again.";
  if (error.code === "moderation_conflict_of_interest") return "This report involves your household. Moderation actions are unavailable.";
  if (error.code === "moderation_note_required") return "Enter an internal moderator note before continuing.";
  if (error.code === "moderation_note_too_long") return "Keep the internal moderator note within 1,000 characters.";
  if (error.status === 409) return "This report changed while you were reviewing it. The latest state has been loaded.";
  if (error.status === 422) return "This moderation action is no longer available for the current report state.";
  if (error.status === 403) return "Your access to this action has changed. Please contact an administrator.";
  if (error.status === 401) return "Your session has expired. Please sign in again.";
  if (error.status === 400) return "Please check your internal note and try again.";
  return "We couldn’t complete this action. Please try again.";
}
