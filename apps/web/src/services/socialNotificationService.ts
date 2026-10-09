import { apiRequest } from "@/services/apiClient";
import type { PublicOwnerAttribution } from "@/services/publicSocialService";
import {
  isKnownModerationNoticeAction,
  type CommunityModerationNotice,
} from "@/lib/communityModeration";

/**
 * In-app activity.
 *
 * The recipient is never sent: the API builds the list for whoever the token
 * says is asking, and ids belonging to another account simply match nothing.
 * There is no email counterpart to any of this.
 */

export type SocialActivityType =
  | "NewFollower"
  | "MomentLiked"
  | "MomentCommented"
  | "MomentCommentMentioned"
  | "MomentCommentReplied"
  | "MomentCollaborationRequested"
  | "MomentCollaborationAccepted";

export type SocialNotificationType = SocialActivityType | "CommunityModerationNotice";

type SocialNotificationBase = {
  id: string;
  createdAt: string;
  isRead: boolean;
  petName: string | null;
  petPublicSlug: string | null;
  /**
   * The Moment a like was about. Present whenever the activity row recorded
   * one — it is a pointer, not permission: the Moment's own page re-asks the
   * whole visibility question and refuses if the answer has changed.
   */
  momentId: string | null;
  commentId?: string | null;
  momentTitle: string | null;
  momentSubjectNames: string[];
  /** Requested pets for an invitation; the pets that joined for an acceptance. */
  collaborationPetNames?: string[];
};

/** Something another household did. */
export type SocialActivityNotification = SocialNotificationBase & {
  type: SocialActivityType;
  /** Resolved at read time, so it is never a stale identity. */
  actor: PublicOwnerAttribution;
  moderation?: null;
};

/**
 * A notice from MyPetLink about the household's own content or Community
 * access. It has no actor and never names or links to removed content.
 */
export type CommunityModerationNotification = SocialNotificationBase & {
  type: "CommunityModerationNotice";
  actor: null;
  moderation: CommunityModerationNotice;
};

export type SocialNotification = SocialActivityNotification | CommunityModerationNotification;

export type SocialNotificationPage = {
  items: SocialNotification[];
  nextCursor: string | null;
  unreadCount: number;
};

export async function getSocialNotifications(
  cursor?: string
): Promise<SocialNotificationPage> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiRequest<SocialNotificationPage>(
    `/api/v1/social/notifications${query}`
  );

  return {
    // Forward-compatible by construction. An API deployed ahead of this web
    // build may know an activity kind this UI does not; it must disappear, not
    // be mislabelled as a Like.
    items: (response.data?.items ?? [])
      .filter(isRenderableNotification)
      .map((item) => ({
        ...item,
        momentId: item.momentId ?? null,
        commentId: item.commentId ?? null,
        collaborationPetNames: item.collaborationPetNames ?? [],
        momentSubjectNames: item.momentSubjectNames ?? [],
      })),
    nextCursor: response.data?.nextCursor ?? null,
    unreadCount: response.data?.unreadCount ?? 0,
  };
}

export function isKnownNotificationType(
  value: string
): value is SocialNotificationType {
  return (
    value === "NewFollower" ||
    value === "MomentLiked" ||
    value === "MomentCommented" ||
    value === "MomentCommentMentioned" ||
    value === "MomentCommentReplied" ||
    value === "MomentCollaborationRequested" ||
    value === "MomentCollaborationAccepted" ||
    value === "CommunityModerationNotice"
  );
}

/**
 * A row this build can show truthfully: a known activity with its actor, or
 * a moderation notice whose action it knows. Anything else is dropped rather
 * than mislabelled.
 */
function isRenderableNotification(item: SocialNotification): boolean {
  if (!isKnownNotificationType(item.type)) return false;
  if (item.type === "CommunityModerationNotice") {
    return Boolean(item.moderation && isKnownModerationNoticeAction(item.moderation.action));
  }

  return Boolean(item.actor);
}

export async function getUnreadActivityCount(): Promise<number> {
  const response = await apiRequest<{ unreadCount: number }>(
    "/api/v1/social/notifications/unread"
  );

  return response.data?.unreadCount ?? 0;
}

/** With no ids, marks everything unread as read — what opening the screen means. */
export async function markActivityRead(
  notificationIds?: string[]
): Promise<number> {
  const response = await apiRequest<{ unreadCount: number }>(
    "/api/v1/social/notifications/read",
    { method: "POST", body: { notificationIds: notificationIds ?? null } }
  );

  return response.data?.unreadCount ?? 0;
}
