namespace MyPetLink.Api.DTOs;

/// <summary>
/// One piece of activity, as the recipient sees it now.
///
/// Deliberately structured rather than a rendered sentence: the copy lives in
/// the UI, where the same subject formatting the rest of the product uses can
/// turn two pet names into "Mochi &amp; Coco". A row that stored its own
/// sentence would also freeze a display name that the actor may since have
/// changed.
///
/// Nothing here is copied from a notification row. The actor's identity is
/// resolved at read time from their current public social profile, so an actor
/// who leaves social, or who has since blocked the recipient, cannot keep an
/// identity alive in somebody else's activity list.
/// </summary>
public sealed record OwnerNotificationResponse(
    Guid Id,
    /// <summary>"NewFollower" or "MomentLiked".</summary>
    string Type,
    DateTimeOffset CreatedAt,
    bool IsRead,
    PublicOwnerAttributionResponse Actor,

    /// <summary>The recipient's own pet this is about, when there is one.</summary>
    string? PetName,

    /// <summary>
    /// Where the notification leads. A pet's public profile for a like, because
    /// there is no standalone Moment route yet; null for a follow, which leads
    /// to the actor's profile instead.
    /// </summary>
    string? PetPublicSlug,

    string? MomentTitle,

    /// <summary>Every pet the liked Moment is about, for "Moment of Mochi &amp; Coco".</summary>
    IReadOnlyCollection<string> MomentSubjectNames);

public sealed record OwnerNotificationPageResponse(
    IReadOnlyCollection<OwnerNotificationResponse> Items,
    string? NextCursor,

    /// <summary>
    /// Sent with the page so a client that has just opened Activity does not
    /// then ask for the badge separately.
    /// </summary>
    int UnreadCount);

/// <summary>The badge. Counted the same way the list is filtered.</summary>
public sealed record OwnerNotificationSummaryResponse(int UnreadCount);

/// <summary>
/// Marks activity as read. With no ids, marks everything currently unread —
/// which is what opening the screen means.
/// </summary>
public sealed record MarkNotificationsReadRequest(IReadOnlyCollection<Guid>? NotificationIds);
