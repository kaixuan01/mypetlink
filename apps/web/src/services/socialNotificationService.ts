import { apiRequest } from "@/services/apiClient";
import type { PublicOwnerAttribution } from "@/services/publicSocialService";

/**
 * In-app activity.
 *
 * The recipient is never sent: the API builds the list for whoever the token
 * says is asking, and ids belonging to another account simply match nothing.
 * There is no email counterpart to any of this.
 */

export type SocialNotificationType = "NewFollower" | "MomentLiked";

export type SocialNotification = {
  id: string;
  type: SocialNotificationType;
  createdAt: string;
  isRead: boolean;
  /** Resolved at read time, so it is never a stale identity. */
  actor: PublicOwnerAttribution;
  petName: string | null;
  petPublicSlug: string | null;
  momentTitle: string | null;
  momentSubjectNames: string[];
};

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
    items: (response.data?.items ?? []).map((item) => ({
      ...item,
      momentSubjectNames: item.momentSubjectNames ?? [],
    })),
    nextCursor: response.data?.nextCursor ?? null,
    unreadCount: response.data?.unreadCount ?? 0,
  };
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
