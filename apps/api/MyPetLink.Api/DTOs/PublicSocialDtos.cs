namespace MyPetLink.Api.DTOs;

/// <summary>
/// Who shared a pet, as a visitor sees it.
///
/// This is the owner's SOCIAL identity and nothing else: a chosen handle, a
/// chosen display name and an uploaded avatar. It never carries the account
/// name, the email, or the finder-facing owner name, which are different
/// identities with different audiences.
///
/// Returned only when the owner has switched social on AND the pet participates.
/// A shareable link is not social participation.
/// </summary>
public sealed record PublicOwnerAttributionResponse(
    string Handle,
    string DisplayName,
    string? AvatarUrl,
    string? AvatarThumbnailUrl);

/// <summary>
/// An owner's public social profile, at <c>/u/{handle}</c>.
/// </summary>
public sealed record PublicOwnerProfileResponse(
    string Handle,
    string DisplayName,
    string? Bio,
    string? AvatarUrl,
    string? AvatarThumbnailUrl,
    string? GeneralArea,
    bool AllowFollowers,

    /// <summary>
    /// Only the owner's pets that are eligible for social display. Owning a pet
    /// is not a reason to publish it.
    /// </summary>
    IReadOnlyCollection<PublicOwnerPetResponse> Pets);

/// <summary>One of an owner's pets, as listed on their social profile.</summary>
public sealed record PublicOwnerPetResponse(
    string Name,
    string Species,
    string? CustomSpecies,
    string? Breed,
    string PublicSlug,
    string? PhotoUrl,
    string? PhotoThumbnailUrl,
    bool HasSmartTagProtection,
    bool LostModeEnabled);

/// <summary>
/// One public Moment in a paginated social listing.
///
/// Carries no owner or safety field of any kind. The subjects are pet names and
/// public slugs only.
/// </summary>
public sealed record PublicMomentListItemResponse(
    Guid Id,
    string Title,
    DateOnly? MomentDate,
    DateTimeOffset? PublishedAt,
    string? Type,
    string? Caption,

    /// <summary>
    /// The household that shared it, as its SOCIAL identity. Null only when the
    /// author's social profile has since been switched off, which the selection
    /// predicates already exclude — a card that reaches a client always has one.
    /// </summary>
    PublicOwnerAttributionResponse? Author,

    IReadOnlyCollection<PublicMomentSubjectResponse> Subjects,
    IReadOnlyCollection<MemoryMediaResponse> Media,

    /// <summary>Counted from the like rows, never stored on the Moment.</summary>
    int LikeCount,

    /// <summary>
    /// Whether the caller has liked this Moment. Always false for a visitor with
    /// no session — there is nobody for a like to belong to.
    /// </summary>
    bool ViewerHasLiked);

/// <summary>
/// A page of public Moments.
///
/// <paramref name="NextCursor"/> is null when there is nothing further; a client
/// must use its presence rather than comparing counts, because a page can be
/// short and still have more behind it.
/// </summary>
public sealed record PublicMomentPageResponse(
    IReadOnlyCollection<PublicMomentListItemResponse> Items,
    string? NextCursor);

/// <summary>
/// A page of the signed-in owner's feed, plus the one thing an empty page
/// cannot say for itself.
///
/// "No Moments" has two completely different meanings: nobody is followed yet,
/// or people are followed and none of them has posted lately. The first needs
/// an invitation to go and find families; the second must never say "follow
/// somebody" to a person who already follows a dozen. Item count cannot tell
/// them apart, so the relationship is reported alongside the page rather than
/// guessed from it.
///
/// A separate record from <see cref="PublicMomentPageResponse"/> because this
/// fact is true of a feed and of nothing else: Explore, a profile's Moments and
/// a pet's Moments have no viewer relationship to describe.
/// </summary>
public sealed record SocialFeedPageResponse(
    IReadOnlyCollection<PublicMomentListItemResponse> Items,
    string? NextCursor,
    /// <summary>
    /// Whether the viewer follows anybody at all — not whether this page has
    /// anything in it. Answered by an existence check against the follow index,
    /// so it costs a seek and never grows with the size of the follow list.
    /// </summary>
    bool HasFollowing);

/// <summary>
/// Where a handle currently resolves. Used by the edge to answer a request for
/// a handle an account used to hold.
/// </summary>
public sealed record OwnerHandleResolutionResponse(
    string Handle,
    /// <summary>
    /// "current" when the handle is live, "moved" when the account that held it
    /// has since renamed and the caller should be redirected.
    /// </summary>
    string State,
    string? CurrentHandle);
