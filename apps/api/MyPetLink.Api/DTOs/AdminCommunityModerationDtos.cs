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
    bool AccountActive);

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

/// <summary>A Comment as it is now. Removed Comments have an empty body.</summary>
public sealed record AdminCommunityCurrentCommentResponse(
    Guid Id,
    Guid MomentId,
    string Body,
    DateTimeOffset CreatedAt,
    bool Removed,
    DateTimeOffset? RemovedAt,
    string? RemovedBy,
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
/// Every moderation action takes only these two values. The note is required;
/// the row version is the report's, from the detail, and is required by the
/// actions that decide the report. Status, resolution and every "by" field are
/// chosen by the server.
/// </summary>
public sealed record AdminCommunityModerationRequest(string? Note, string? RowVersion);

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
