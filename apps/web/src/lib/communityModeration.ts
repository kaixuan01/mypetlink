import { isApiClientError } from "@/services/apiClient";

/**
 * Community moderation as households and moderators read it: the reasons a
 * moderator can give, what a restricted household is told when an action is
 * refused, and the wording of a moderation notice in Activity.
 *
 * A household is only ever told what happened, the reason in these words and,
 * for a timed restriction, when it ends. Never who decided, who reported, or a
 * moderator's internal remark — none of that reaches the client.
 */

/** The reasons a moderator can give, in the words everyone sees. */
export const communityModerationReasons = {
  SpamOrAdvertising: "Spam / Advertising",
  Harassment: "Harassment",
  InappropriateContent: "Inappropriate Content",
  ScamOrFraud: "Scam / Fraud",
  PrivacyOrPersonalInformation: "Privacy / Personal Information",
  AnimalWelfareConcern: "Animal Welfare Concern",
  Impersonation: "Impersonation",
  SecurityAbuse: "Security Abuse",
  RepeatedViolations: "Repeated Violations",
  Other: "Other",
} as const;

export type CommunityModerationReason = keyof typeof communityModerationReasons;

/** The reasons that fit removing content, warning or restricting Community access. */
export const communityContentReasons: CommunityModerationReason[] = [
  "SpamOrAdvertising",
  "Harassment",
  "InappropriateContent",
  "ScamOrFraud",
  "PrivacyOrPersonalInformation",
  "AnimalWelfareConcern",
  "Impersonation",
  "RepeatedViolations",
  "Other",
];

/** The reasons that justify suspending a whole account. */
export const accountSuspensionReasons: CommunityModerationReason[] = [
  "ScamOrFraud",
  "SecurityAbuse",
  "RepeatedViolations",
  "Harassment",
  "Other",
];

export function communityModerationReasonLabel(value?: string | null): string | null {
  if (!value) return null;
  return communityModerationReasons[value as CommunityModerationReason] ?? null;
}

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

/** When a restriction ends, in Malaysia time: "15 Oct 2026, 2:00 PM". */
export function formatCommunityRestrictionEnd(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(parsed)
    .replace(/\b(am|pm)\b/i, (period) => period.toUpperCase());
}

/**
 * What a restricted household is told when a Community action is refused.
 * With no end date the restriction lasts until MyPetLink lifts it; an end that
 * has just passed is about to be lifted on its own.
 */
export function communityRestrictionMessage(
  restrictedUntil: string | null | undefined,
  now: number = Date.now()
): string {
  if (!restrictedUntil) {
    return "Your Community access has been suspended.";
  }

  const end = Date.parse(restrictedUntil);
  if (Number.isNaN(end)) {
    return "Your Community access is temporarily restricted.";
  }

  if (end <= now) {
    return "Your Community access is being restored. Please try again in a minute.";
  }

  return `Your Community access is temporarily restricted until ${formatCommunityRestrictionEnd(restrictedUntil)}.`;
}

/** Said alongside every restriction: Community is the only thing affected. */
export const communityRestrictionReassurance =
  "You can still use everything else in MyPetLink, including your pets, Safety Profiles, Smart Tags and orders.";

/** The restriction an API error describes, or null for any other error. */
export function readCommunityRestriction(
  error: unknown
): { restrictedUntil: string | null } | null {
  if (!isApiClientError(error) || error.code !== "community_restricted") {
    return null;
  }

  return { restrictedUntil: error.details?.restrictedUntil?.[0] ?? null };
}

/**
 * Copy for a failed Community action: a restriction, with its end, or
 * otherwise the error's own message.
 */
export function communityActionErrorMessage(error: unknown, fallback: string): string {
  const restriction = readCommunityRestriction(error);
  if (restriction) {
    return communityRestrictionMessage(restriction.restrictedUntil);
  }

  return isApiClientError(error) ? error.message : fallback;
}

export type CommunityModerationNoticeAction =
  | "MomentRemoved"
  | "CommentRemoved"
  | "ReplyRemoved"
  | "WarningIssued"
  | "CommunityRestricted";

export type CommunityModerationNotice = {
  action: CommunityModerationNoticeAction;
  reason: string | null;
  restrictedUntil: string | null;
};

export function isKnownModerationNoticeAction(
  value: string
): value is CommunityModerationNoticeAction {
  return (
    value === "MomentRemoved" ||
    value === "CommentRemoved" ||
    value === "ReplyRemoved" ||
    value === "WarningIssued" ||
    value === "CommunityRestricted"
  );
}

/** A moderation notice in Activity: a short headline, one calm sentence, and the reason. */
export function moderationNoticeCopy(notice: CommunityModerationNotice): {
  title: string;
  body: string;
  reason: string | null;
} {
  const reason = communityModerationReasonLabel(notice.reason);

  switch (notice.action) {
    case "MomentRemoved":
      return {
        title: "Your Moment was removed",
        body: "Your Moment was removed because it violated our Community Guidelines.",
        reason,
      };
    case "CommentRemoved":
      return {
        title: "Your comment was removed",
        body: "Your comment was removed because it violated our Community Guidelines.",
        reason,
      };
    case "ReplyRemoved":
      return {
        title: "Your reply was removed",
        body: "Your reply was removed because it violated our Community Guidelines.",
        reason,
      };
    case "WarningIssued":
      return {
        title: "You received a Community warning.",
        body: "Please take a moment to review our Community Guidelines.",
        reason,
      };
    case "CommunityRestricted":
    default:
      return {
        title: notice.restrictedUntil
          ? `Your Community access has been restricted until ${formatCommunityRestrictionEnd(notice.restrictedUntil)}.`
          : "Your Community access has been suspended.",
        body: communityRestrictionReassurance,
        reason,
      };
  }
}
