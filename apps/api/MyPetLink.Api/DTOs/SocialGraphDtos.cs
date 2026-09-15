namespace MyPetLink.Api.DTOs;

/// <summary>
/// The viewer's relationship with a profile, and that profile's counts.
///
/// Returned to an authenticated caller so a Follow control can render in its
/// correct state without a second request. For an anonymous visitor the
/// relationship fields are all false — there is no relationship to have.
/// </summary>
public sealed record OwnerRelationshipResponse(
    bool IsSelf,
    bool IsFollowing,
    bool IsFollowedBy,
    bool HasBlocked,
    bool CanFollow,
    /// <summary>
    /// Whether the profile accepts followers at all. A property of the profile
    /// rather than of the viewer, and already public on the profile itself, so
    /// an anonymous visitor can be offered a sign-in-to-follow route without
    /// being told they may follow — which they may not, until they sign in.
    /// </summary>
    bool AllowsFollowers,
    int FollowerCount,
    int FollowingCount);

/// <summary>One account in a followers or following listing.</summary>
public sealed record SocialAccountSummaryResponse(
    string Handle,
    string DisplayName,
    string? AvatarThumbnailUrl,
    /// <summary>Whether the viewer already follows this account.</summary>
    bool IsFollowing,
    bool IsSelf);

public sealed record SocialAccountPageResponse(
    IReadOnlyCollection<SocialAccountSummaryResponse> Items,
    string? NextCursor);

/// <summary>Optional private note when blocking. Never shown to the blocked account.</summary>
public sealed record BlockOwnerRequest(string? Reason);
