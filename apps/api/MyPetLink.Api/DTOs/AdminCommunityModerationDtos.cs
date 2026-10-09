using System.ComponentModel.DataAnnotations;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.DTOs;

// Admin Community moderation. Every type here is Admin-only: reporter identity,
// reasons, details and moderator notes are sensitive moderation data and must
// never be returned by a public, social or owner endpoint.

/// <summary>The report queue's filters. Enum values are their names, exactly.</summary>
public sealed class AdminCommunityReportQuery : PagedQuery
{
    [MaxLength(16)] public string? Status { get; init; }
    [MaxLength(16)] public string? TargetType { get; init; }
    [MaxLength(32)] public string? Reason { get; init; }

    /// <summary>Only reports about this household.</summary>
    public Guid? ReportedOwnerId { get; init; }

    public DateTimeOffset? CreatedFrom { get; init; }
    public DateTimeOffset? CreatedTo { get; init; }
}

/// <summary>
/// A household as a moderator needs to see it: its current Community identity
/// and Community state, never its e-mail, phone, finder or Safety details.
/// </summary>
public sealed record AdminCommunityHouseholdResponse(
    Guid OwnerId,
    string? Handle,
    string? DisplayName,
    bool CommunityEnabled,
    bool CommunityRestricted,
    DateTimeOffset? CommunityRestrictedAt,
    bool AccountActive,

    /// <summary>When a timed restriction ends; null for none, or one with no end date.</summary>
    DateTimeOffset? CommunityRestrictedUntil = null);

public sealed record AdminCommunityReportListItemResponse(
    Guid Id,
    string TargetType,
    string Reason,
    string Status,
    string? Resolution,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt,
    string SnapshotHandle,
    string SnapshotDisplayName,
    AdminCommunityHouseholdResponse ReportedHousehold,
    AdminCommunityHouseholdResponse Reporter,
    int OpenReportsOnTarget);

/// <summary>The evidence as it was when the report was made. Plain text only.</summary>
public sealed record AdminCommunityReportEvidenceResponse(
    string Handle,
    string DisplayName,
    string? Title,
    string? Text,
    Guid? AvatarMediaFileId,
    string? AvatarUrl);

public sealed record AdminCommunityMediaResponse(
    Guid MediaFileId,
    string Type,
    string? Url,
    string? Caption,
    string? AltText,
    int SortOrder);

/// <summary>
/// A Comment as it is now. Removed Comments have an empty body. For a Reply,
/// <see cref="ParentCommentId"/> and <see cref="ParentComment"/> give the
/// Comment it answers, because a Reply rarely makes sense on its own; a Reply
/// is only publicly visible while that parent is. For a top-level Comment,
/// <see cref="ReplyCount"/> is how many Replies readers see under it now —
/// the thread removing it would hide; it is null for a Reply.
/// </summary>
public sealed record AdminCommunityCurrentCommentResponse(
    Guid Id,
    Guid MomentId,
    string Body,
    DateTimeOffset CreatedAt,
    bool Removed,
    DateTimeOffset? RemovedAt,
    string? RemovedBy,
    bool PubliclyVisible,
    AdminCommunityHouseholdResponse Author,
    Guid? ParentCommentId,
    AdminCommunityParentCommentResponse? ParentComment,
    int? ReplyCount = null);

/// <summary>
/// The Comment a reported Reply answers, as it is now. A removed parent has a
/// null body — its text is gone, as everywhere else.
/// </summary>
public sealed record AdminCommunityParentCommentResponse(
    Guid Id,
    string? Body,
    DateTimeOffset CreatedAt,
    bool Removed,
    bool PubliclyVisible,
    AdminCommunityHouseholdResponse Author);

/// <summary>A Moment as it is now — for a Comment report, the Moment it is on.</summary>
public sealed record AdminCommunityCurrentMomentResponse(
    Guid Id,
    string Title,
    string? Caption,
    string Visibility,
    DateTimeOffset? PublishedAt,
    DateTimeOffset? ArchivedAt,
    bool Deleted,
    bool Hidden,
    DateTimeOffset? HiddenAt,
    bool PubliclyVisible,
    AdminCommunityHouseholdResponse Author,
    IReadOnlyList<AdminCommunityMediaResponse> Media);

public sealed record AdminCommunityReportHistoryItemResponse(
    Guid Id,
    string TargetType,
    string Reason,
    string Status,
    string? Resolution,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt,
    string? ReporterHandle);

public sealed record AdminCommunityReportDetailResponse(
    Guid Id,
    string TargetType,
    string Reason,
    string? Details,
    string Status,
    string? Resolution,
    string? ReviewNote,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ReviewedAt,
    string? ReviewedByName,
    string RowVersion,
    AdminCommunityReportEvidenceResponse Evidence,
    AdminCommunityHouseholdResponse Reporter,
    AdminCommunityHouseholdResponse ReportedHousehold,
    bool HouseholdPubliclyVisible,
    AdminCommunityCurrentCommentResponse? CurrentComment,
    AdminCommunityCurrentMomentResponse? CurrentMoment,
    int OpenReportsOnTarget,
    IReadOnlyList<AdminCommunityReportHistoryItemResponse> TargetHistory,
    int TargetHistoryTotal,
    IReadOnlyList<AdminCommunityReportHistoryItemResponse> HouseholdHistory,
    int HouseholdHistoryTotal,
    bool InvolvesYou,
    IReadOnlyList<string> AvailableActions);

/// <summary>
/// Every moderation action takes only these values. The note is required; the
/// row version is the report's, from the detail, and is required by the
/// actions that decide the report. Status, resolution and every "by" field are
/// chosen by the server.
///
/// <see cref="Reason"/> is what the affected household is told when a decision
/// removes something of theirs or restricts them — a
/// <c>CommunityModerationReason</c> name, chosen by the moderator. Without one,
/// the report's own category is used. It never changes the report itself.
/// </summary>
public sealed record AdminCommunityModerationRequest(string? Note, string? RowVersion, string? Reason = null);

/// <summary>
/// <see cref="Outcome"/> is <c>Applied</c> when this action changed the content
/// or household, or <c>AlreadyInEffect</c> when it already was that way (a
/// Comment already removed, a Moment already hidden, a household already
/// restricted) and only the reports were decided.
/// </summary>
public sealed record AdminCommunityModerationResultResponse(
    Guid ReportId,
    string Outcome,
    int ReportsResolved);

// ---- Direct moderation, without a report -------------------------------------

/// <summary>
/// Community Moments a moderator can act on: every public Moment and every
/// Moment hidden by MyPetLink. A private Moment is never listed — it was never
/// shared, so there is nothing to moderate. <see cref="Status"/> is
/// <c>Active</c> or <c>Removed</c>.
/// </summary>
public sealed class AdminCommunityMomentQuery : PagedQuery
{
    [MaxLength(16)] public string? Status { get; init; }
    public Guid? AuthorId { get; init; }
    [MaxLength(100)] public string? Search { get; init; }
}

/// <summary>
/// <see cref="Status"/> is <c>Visible</c> (anyone in Community can see it now),
/// <c>NotVisible</c> (public, but not shown in Community — archived, or its
/// household's Community is off) or <c>Removed</c> (hidden by MyPetLink).
/// </summary>
public sealed record AdminCommunityMomentListItemResponse(
    Guid Id,
    string Title,
    string? CaptionPreview,
    AdminCommunityHouseholdResponse Author,
    string? PetName,
    DateTimeOffset? PublishedAt,
    string Status,
    DateTimeOffset? RemovedAt,
    int LikeCount,
    int CommentCount);

public sealed record AdminCommunityMomentDetailResponse(
    AdminCommunityCurrentMomentResponse Moment,
    string? PetName,
    int LikeCount,
    int CommentCount,
    IReadOnlyList<AdminCommunityModerationHistoryItemResponse> History,
    IReadOnlyList<string> AvailableActions);

/// <summary>
/// Comments and Replies a moderator can act on. <see cref="Status"/> is
/// <c>Active</c> or <c>Removed</c>; <see cref="Kind"/> is <c>Comment</c> or
/// <c>Reply</c>.
/// </summary>
public sealed class AdminCommunityCommentQuery : PagedQuery
{
    [MaxLength(16)] public string? Status { get; init; }
    [MaxLength(16)] public string? Kind { get; init; }
    public Guid? AuthorId { get; init; }
    public Guid? MomentId { get; init; }
}

/// <summary>
/// A removed Comment has a null <see cref="Body"/> — its text is gone, as
/// everywhere else. <see cref="Status"/> is <c>Active</c>, <c>RemovedByMyPetLink</c>,
/// <c>DeletedByAuthor</c> or <c>DeletedByMomentAuthor</c>.
/// </summary>
public sealed record AdminCommunityCommentListItemResponse(
    Guid Id,
    string Kind,
    string? Body,
    AdminCommunityHouseholdResponse Author,
    Guid MomentId,
    string MomentTitle,
    Guid? ParentCommentId,
    DateTimeOffset CreatedAt,
    string Status,
    DateTimeOffset? RemovedAt,
    bool PubliclyVisible);

/// <summary>One Comment in the thread shown around the one being reviewed.</summary>
public sealed record AdminCommunityThreadItemResponse(
    Guid Id,
    string? Body,
    DateTimeOffset CreatedAt,
    bool Removed,
    AdminCommunityHouseholdResponse Author);

/// <summary>
/// A Comment or Reply in context: the Moment it is on, the Comment a Reply
/// answers (in <see cref="AdminCommunityCurrentCommentResponse.ParentComment"/>),
/// and the thread's Replies, oldest first.
/// </summary>
public sealed record AdminCommunityCommentContextResponse(
    AdminCommunityCurrentCommentResponse Comment,
    AdminCommunityCurrentMomentResponse? Moment,
    IReadOnlyList<AdminCommunityThreadItemResponse> ThreadReplies,
    int ThreadReplyTotal,
    IReadOnlyList<AdminCommunityModerationHistoryItemResponse> History,
    IReadOnlyList<string> AvailableActions);

/// <summary>
/// One entry in a household's moderation history, for moderators only. The
/// remark and the snapshot of removed content never leave the Admin Portal.
/// </summary>
public sealed record AdminCommunityModerationHistoryItemResponse(
    Guid Id,
    string Action,
    string? Reason,
    string? InternalRemark,
    string? PerformedByName,
    DateTimeOffset CreatedAt,
    DateTimeOffset? RestrictedUntil,
    Guid? MomentId,
    Guid? CommentId,
    Guid? ReportId,
    string? ContentSnapshot);

/// <summary>
/// A household's moderation standing and history.
/// <see cref="AccountStatus"/> is the account's own status (<c>Active</c>,
/// <c>Suspended</c>, …) — separate from Community.
/// <see cref="CommunityStatus"/> is <c>NotSetUp</c>, <c>Off</c>, <c>On</c>,
/// <c>Restricted</c> (until <see cref="RestrictedUntil"/>) or <c>Suspended</c>
/// (restricted with no end date).
/// </summary>
public sealed record AdminCommunityHouseholdModerationResponse(
    AdminCommunityHouseholdResponse Household,
    string AccountStatus,
    string CommunityStatus,
    int WarningCount,
    DateTimeOffset? RestrictedAt,
    DateTimeOffset? RestrictedUntil,
    IReadOnlyList<AdminCommunityModerationHistoryItemResponse> History,
    int HistoryTotal,
    IReadOnlyList<string> AvailableActions);

/// <summary>Remove a Moment, Comment or Reply. The reason is required; the remark is not.</summary>
public sealed record AdminCommunityRemoveContentRequest(string? Reason, string? Remark);

/// <summary>
/// A warning to a household, optionally about one Moment or one Comment of
/// theirs. Content that is not theirs is refused.
/// </summary>
public sealed record AdminCommunityWarningRequest(string? Reason, string? Remark, Guid? MomentId, Guid? CommentId);

/// <summary>
/// Restrict a household's Community access. <see cref="Duration"/> is
/// <c>24h</c>, <c>7d</c>, <c>30d</c> or <c>permanent</c>. Restricting a household
/// already restricted gives the restriction this new end.
/// </summary>
public sealed record AdminCommunityRestrictRequest(string? Reason, string? Duration, string? Remark);

/// <summary>A reversal — restore, lift, reinstate — takes only an optional remark.</summary>
public sealed record AdminCommunityReversalRequest(string? Remark);

/// <summary>Suspend a whole account. Severe and separate from any Community restriction.</summary>
public sealed record AdminAccountSuspensionRequest(string? Reason, string? Remark);

public sealed record AdminCommunityActionResultResponse(
    Guid ActionId,
    string Action,
    DateTimeOffset? RestrictedUntil);
