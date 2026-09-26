import { apiRequest, isApiClientError } from "@/services/apiClient";

export type CommunityReportTargetType = "comment" | "moment" | "household";
export type CommunityReportReason =
  | "SpamOrScam"
  | "HarassmentOrBullying"
  | "InappropriateContent"
  | "AnimalWelfareConcern"
  | "Impersonation"
  | "PrivacyConcern"
  | "Other";

export const reportReasons: { value: CommunityReportReason; label: string }[] = [
  { value: "SpamOrScam", label: "Spam or scam" },
  { value: "HarassmentOrBullying", label: "Harassment or bullying" },
  { value: "InappropriateContent", label: "Inappropriate content" },
  { value: "AnimalWelfareConcern", label: "Animal welfare concern" },
  { value: "Impersonation", label: "Impersonation" },
  { value: "PrivacyConcern", label: "Privacy concern" },
  { value: "Other", label: "Something else" },
];

export type CommunityReportErrorReason =
  | "unavailable" | "own" | "profile" | "restricted" | "rate-limit" | "session" | "error";

export class CommunityReportError extends Error {
  constructor(readonly reason: CommunityReportErrorReason, message: string) {
    super(message);
    this.name = "CommunityReportError";
  }
}

export async function submitCommunityReport(request: {
  targetType: CommunityReportTargetType;
  target: string;
  reason: CommunityReportReason;
  details: string;
}): Promise<void> {
  try {
    const response = await apiRequest<{ accepted: boolean }>("/api/v1/social/reports", {
      method: "POST",
      body: request,
    });
    if (response.data?.accepted !== true) throw new Error("Report was not accepted.");
  } catch (error) {
    if (isApiClientError(error)) {
      if (error.status === 404 && error.code === "report_target_unavailable")
        throw new CommunityReportError("unavailable", "This content is no longer available.");
      if (error.status === 422 && error.code === "report_own_content")
        throw new CommunityReportError("own", "You can’t report your own content.");
      if (error.status === 403 && error.code === "community_profile_required")
        throw new CommunityReportError("profile", "Set up your Community profile to send a report.");
      if (error.status === 403)
        throw new CommunityReportError("restricted", "Reporting isn’t available for this account right now.");
      if (error.status === 429)
        throw new CommunityReportError("rate-limit", "You’ve sent several reports recently. Please try again later.");
      if (error.status === 401)
        throw new CommunityReportError("session", "Sign in to send a report.");
    }
    throw new CommunityReportError("error", "Couldn’t send report. Please try again.");
  }
}
