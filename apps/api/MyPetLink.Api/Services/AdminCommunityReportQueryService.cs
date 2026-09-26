using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// The Admin Portal's Community report queue and report detail.
///
/// <b>Privileged, and separate from Community visibility.</b> A moderator sees
/// a reported Comment, Moment or household whatever Community would show — after
/// a block, a Community switch-off, a removal, a hide or a restriction — because
/// deciding a report needs it. Nothing here widens what Community itself shows.
///
/// <b>Evidence is not current state.</b> The snapshot taken when the report was
/// made is returned exactly as stored, beside the target as it is now, and the
/// two are never merged.
///
/// <b>Admin-only.</b> Reporter identity, reasons, details, notes and report
/// counts leave the API only through these responses, behind
/// <c>community_reports.view</c>.
/// </summary>
public sealed class AdminCommunityReportQueryService : SkeletonService, IAdminCommunityReportQueryService
{
    /// <summary>How much prior-report context a detail carries for each list.</summary>
    public const int HistoryLimit = 20;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly string? _publicMediaBaseUrl;

    public AdminCommunityReportQueryService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _publicMediaBaseUrl = r2Options.Value.PublicBaseUrl;
    }

    // ---- queue --------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminCommunityReportListItemResponse> Items, int Total)> ListAsync(
        Guid? currentUserId,
        AdminCommunityReportQuery query,
        CancellationToken cancellationToken = default)
    {
        var reports = Filter(ExcludingReportsAbout(currentUserId), query);
        var total = await reports.CountAsync(cancellationToken);

        // Undecided first, then newest first; the id only makes paging stable.
        var rows = await reports
            .OrderBy(report => report.Status == CommunityReportStatus.Open ? 0 : 1)
            .ThenByDescending(report => report.CreatedAt)
            .ThenBy(report => report.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(report => new
            {
                report.Id,
                report.TargetType,
                report.CommentId,
                report.MomentId,
                report.Reason,
                report.Status,
                report.Resolution,
                report.CreatedAt,
                report.ReviewedAt,
                report.SnapshotHandle,
                report.SnapshotDisplayName,
                report.ReportedUserId,
                report.ReporterUserId
            })
            .ToListAsync(cancellationToken);

        var households = await LoadHouseholdsAsync(
            rows.SelectMany(row => new[] { row.ReportedUserId, row.ReporterUserId }),
            cancellationToken);
        var openCounts = await CountOpenByTargetAsync(
            rows.Select(row => new TargetKey(row.TargetType, row.CommentId, row.MomentId, row.ReportedUserId)),
            cancellationToken);

        var items = rows.Select(row => new AdminCommunityReportListItemResponse(
                row.Id,
                row.TargetType.ToString(),
                row.Reason.ToString(),
                row.Status.ToString(),
                row.Resolution?.ToString(),
                row.CreatedAt,
                row.ReviewedAt,
                row.SnapshotHandle,
                row.SnapshotDisplayName,
                households[row.ReportedUserId],
                households[row.ReporterUserId],
                openCounts.GetValueOrDefault(new TargetKey(row.TargetType, row.CommentId, row.MomentId, row.ReportedUserId).Normalized())))
            .ToArray();

        return (items, total);
    }

    // ---- detail -------------------------------------------------------------

    public async Task<AdminCommunityReportDetailResponse> GetAsync(
        Guid? currentUserId,
        Guid reportId,
        CancellationToken cancellationToken = default)
    {
        var report = await _dbContext.CommunityReports
            .AsNoTracking()
            .Where(item => item.Id == reportId)
            .Select(item => new
            {
                Report = item,
                ReviewedByName = item.ReviewedByUser == null ? null : item.ReviewedByUser.DisplayName
            })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw ReportNotFound();

        var r = report.Report;
        if (currentUserId == r.ReportedUserId)
        {
            // A moderator never reads who reported their own household or what
            // they said: to them, the report is not there.
            throw ReportNotFound();
        }

        var comment = r.CommentId is { } commentId
            ? await LoadCommentAsync(commentId, cancellationToken)
            : null;
        var momentId = r.MomentId ?? comment?.MomentId;
        var moment = momentId is { } id
            ? await LoadMomentAsync(id, cancellationToken)
            : null;

        var households = await LoadHouseholdsAsync(
            new[] { r.ReporterUserId, r.ReportedUserId }
                .Concat(comment is null ? Array.Empty<Guid>() : new[] { comment.AuthorUserId })
                .Concat(moment is null ? Array.Empty<Guid>() : new[] { moment.AuthorUserId }),
            cancellationToken);

        var householdPubliclyVisible = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .AnyAsync(profile =>
                profile.UserId == r.ReportedUserId
                && profile.IsSocialEnabled
                && profile.Handle != null
                && profile.Handle != ""
                && profile.DisplayName != null
                && profile.DisplayName != ""
                && profile.User.DeletedAt == null
                && profile.User.Status == UserStatus.Active,
                cancellationToken);

        var sameTarget = _dbContext.CommunityReports.AsNoTracking()
            .SameTarget(r.TargetType, r.CommentId, r.MomentId, r.ReportedUserId);
        var openOnTarget = await sameTarget.CountAsync(item => item.Status == CommunityReportStatus.Open, cancellationToken);
        var (targetHistory, targetHistoryTotal) = await LoadHistoryAsync(
            sameTarget.Where(item => item.Id != r.Id),
            cancellationToken);
        var (householdHistory, householdHistoryTotal) = await LoadHistoryAsync(
            _dbContext.CommunityReports.AsNoTracking()
                .Where(item => item.ReportedUserId == r.ReportedUserId && item.Id != r.Id),
            cancellationToken);

        var avatarUrl = r.SnapshotAvatarMediaFileId is { } avatarId
            ? MediaDerivatives.ResolveThumbnailUrl(
                await _dbContext.MediaFiles.AsNoTracking()
                    .SingleOrDefaultAsync(media => media.Id == avatarId && media.DeletedAt == null, cancellationToken),
                _publicMediaBaseUrl)
            : null;

        var reportedHousehold = households[r.ReportedUserId];
        var involvesYou = currentUserId.HasValue && currentUserId == r.ReporterUserId;

        return new AdminCommunityReportDetailResponse(
            r.Id,
            r.TargetType.ToString(),
            r.Reason.ToString(),
            r.Details,
            r.Status.ToString(),
            r.Resolution?.ToString(),
            r.ReviewNote,
            r.CreatedAt,
            r.ReviewedAt,
            report.ReviewedByName,
            Convert.ToBase64String(r.RowVersion),
            new AdminCommunityReportEvidenceResponse(
                r.SnapshotHandle,
                r.SnapshotDisplayName,
                r.SnapshotTitle,
                r.SnapshotText,
                r.SnapshotAvatarMediaFileId,
                avatarUrl),
            households[r.ReporterUserId],
            reportedHousehold,
            householdPubliclyVisible,
            comment is null ? null : new AdminCommunityCurrentCommentResponse(
                comment.Id,
                comment.MomentId,
                comment.Body,
                comment.CreatedAt,
                comment.DeletedAt.HasValue,
                comment.DeletedAt,
                comment.DeletedAt.HasValue
                    ? DescribeRemover(comment.DeletedByUserId, comment.AuthorUserId, comment.MomentAuthorUserId)
                    : null,
                comment.PubliclyVisible,
                households[comment.AuthorUserId]),
            moment is null ? null : new AdminCommunityCurrentMomentResponse(
                moment.Id,
                moment.Title,
                moment.Caption,
                moment.Visibility.ToString(),
                moment.PublishedAt,
                moment.ArchivedAt,
                moment.DeletedAt.HasValue,
                moment.ModeratedAt.HasValue,
                moment.ModeratedAt,
                moment.PubliclyVisible,
                households[moment.AuthorUserId],
                moment.Media),
            openOnTarget,
            targetHistory,
            targetHistoryTotal,
            householdHistory,
            householdHistoryTotal,
            involvesYou,
            involvesYou
                ? []
                : AvailableActions(r, moment?.ModeratedAt.HasValue == true, reportedHousehold));
    }

    // ---- helpers --------------------------------------------------------------

    /// <summary>
    /// Every report except those about the viewer's own household. A reported
    /// household never learns who reported it or why — including when it is a
    /// moderator's.
    /// </summary>
    private IQueryable<CommunityReport> ExcludingReportsAbout(Guid? viewerId)
    {
        var reports = _dbContext.CommunityReports.AsNoTracking();
        return viewerId is { } viewer
            ? reports.Where(report => report.ReportedUserId != viewer)
            : reports;
    }

    private static IQueryable<CommunityReport> Filter(
        IQueryable<CommunityReport> reports,
        AdminCommunityReportQuery query)
    {
        if (Normalize(query.Status) is { } status)
        {
            var parsed = ParseName(status, "status", "Choose Open or Resolved.",
                CommunityReportStatus.Open, CommunityReportStatus.Resolved);
            reports = reports.Where(report => report.Status == parsed);
        }

        if (Normalize(query.TargetType) is { } targetType)
        {
            var parsed = ParseName(targetType, "targetType", "Choose Comment, Moment or Household.",
                CommunityReportTargetType.Comment, CommunityReportTargetType.Moment, CommunityReportTargetType.Household);
            reports = reports.Where(report => report.TargetType == parsed);
        }

        if (Normalize(query.Reason) is { } reason)
        {
            var parsed = ParseName(reason, "reason", "Choose one of the report reasons.",
                Enum.GetValues<CommunityReportReason>().Where(item => item != CommunityReportReason.Unknown).ToArray());
            reports = reports.Where(report => report.Reason == parsed);
        }

        if (query.ReportedOwnerId is { } ownerId)
        {
            reports = reports.Where(report => report.ReportedUserId == ownerId);
        }

        if (query.CreatedFrom.HasValue && query.CreatedTo.HasValue && query.CreatedFrom > query.CreatedTo)
        {
            throw ValidationFailed("createdTo", "The end date must be after the start date.");
        }

        if (query.CreatedFrom is { } from)
        {
            reports = reports.Where(report => report.CreatedAt >= from);
        }

        if (query.CreatedTo is { } to)
        {
            reports = reports.Where(report => report.CreatedAt <= to);
        }

        return reports;
    }

    /// <summary>
    /// What a moderator could do next, from the report's and the target's state
    /// alone. Capabilities are the API's to enforce and the Portal's to combine
    /// with this; a report involving the moderator's own household offers nothing.
    /// </summary>
    private static IReadOnlyList<string> AvailableActions(
        CommunityReport report,
        bool momentHidden,
        AdminCommunityHouseholdResponse household)
    {
        var open = report.Status == CommunityReportStatus.Open;
        var actions = new List<string>();

        if (open)
        {
            actions.Add("Dismiss");
            if (report.TargetType == CommunityReportTargetType.Comment) actions.Add("RemoveComment");
            if (report.TargetType == CommunityReportTargetType.Moment) actions.Add("HideMoment");
            actions.Add("RestrictHousehold");
        }

        if (report.TargetType == CommunityReportTargetType.Moment && momentHidden) actions.Add("UnhideMoment");
        if (household.CommunityRestricted) actions.Add("LiftRestriction");
        return actions.Distinct().ToArray();
    }

    private static string DescribeRemover(Guid? removedBy, Guid authorId, Guid momentAuthorId) =>
        removedBy == authorId ? "Author"
        : removedBy == momentAuthorId ? "MomentAuthor"
        : "MyPetLink";

    private sealed record CommentRow(
        Guid Id,
        Guid MomentId,
        Guid AuthorUserId,
        Guid MomentAuthorUserId,
        string Body,
        DateTimeOffset CreatedAt,
        DateTimeOffset? DeletedAt,
        Guid? DeletedByUserId,
        bool PubliclyVisible);

    private async Task<CommentRow?> LoadCommentAsync(Guid commentId, CancellationToken cancellationToken)
    {
        var publiclyVisible = _dbContext.MomentComments.VisibleComments(_dbContext, null);
        return await _dbContext.MomentComments
            .AsNoTracking()
            .Where(comment => comment.Id == commentId)
            .Select(comment => new CommentRow(
                comment.Id,
                comment.MomentId,
                comment.AuthorUserId,
                comment.Moment.AuthorUserId,
                comment.Body,
                comment.CreatedAt,
                comment.DeletedAt,
                comment.DeletedByUserId,
                publiclyVisible.Any(visible => visible.Id == comment.Id)))
            .SingleOrDefaultAsync(cancellationToken);
    }

    private sealed record MomentRow(
        Guid Id,
        Guid AuthorUserId,
        string Title,
        string? Caption,
        MemoryVisibility Visibility,
        DateTimeOffset? PublishedAt,
        DateTimeOffset? ArchivedAt,
        DateTimeOffset? DeletedAt,
        DateTimeOffset? ModeratedAt,
        bool PubliclyVisible,
        IReadOnlyList<AdminCommunityMediaResponse> Media);

    private async Task<MomentRow?> LoadMomentAsync(Guid momentId, CancellationToken cancellationToken)
    {
        var publiclyVisible = _dbContext.PetMemories.SociallyVisible();
        var moment = await _dbContext.PetMemories
            .AsNoTracking()
            .Where(item => item.Id == momentId)
            .Select(item => new
            {
                item.Id,
                item.AuthorUserId,
                item.Title,
                item.Caption,
                item.Visibility,
                item.PublishedAt,
                item.ArchivedAt,
                item.DeletedAt,
                item.ModeratedAt,
                PubliclyVisible = publiclyVisible.Any(visible => visible.Id == item.Id)
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (moment is null)
        {
            return null;
        }

        // The media the Moment shows, by reference: the same files and URLs a
        // viewer would be handed, never storage keys or bucket details.
        var media = await _dbContext.MediaFileLinks
            .AsNoTracking()
            .Where(link =>
                link.OwnerId == momentId
                && link.OwnerType == MediaOwnerType.PetMemory
                && link.ArchivedAt == null
                && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                && link.MediaFile.IsPublic
                && link.MediaFile.DeletedAt == null)
            .OrderBy(link => link.SortOrder)
            .Select(link => new { link.MediaFileId, link.Caption, link.AltText, link.SortOrder, link.MediaFile })
            .ToListAsync(cancellationToken);

        return new MomentRow(
            moment.Id,
            moment.AuthorUserId,
            moment.Title,
            moment.Caption,
            moment.Visibility,
            moment.PublishedAt,
            moment.ArchivedAt,
            moment.DeletedAt,
            moment.ModeratedAt,
            moment.PubliclyVisible,
            media.Select(link => new AdminCommunityMediaResponse(
                    link.MediaFileId,
                    link.MediaFile.MediaType == MediaFileType.Video ? "video" : "image",
                    MediaDerivatives.ResolveListUrl(link.MediaFile, _publicMediaBaseUrl),
                    link.Caption,
                    link.AltText,
                    link.SortOrder))
                .ToArray());
    }

    /// <summary>
    /// Households by account, as a moderator sees them now. One query for any
    /// number of them, so a page of the queue never costs a query per row.
    /// </summary>
    private async Task<Dictionary<Guid, AdminCommunityHouseholdResponse>> LoadHouseholdsAsync(
        IEnumerable<Guid> userIds,
        CancellationToken cancellationToken)
    {
        var ids = userIds.Distinct().ToArray();
        var rows = await _dbContext.Users
            .AsNoTracking()
            .Where(user => ids.Contains(user.Id))
            .Select(user => new
            {
                user.Id,
                user.Status,
                user.DeletedAt,
                Handle = user.SocialProfile == null ? null : user.SocialProfile.Handle,
                DisplayName = user.SocialProfile == null ? null : user.SocialProfile.DisplayName,
                Enabled = user.SocialProfile != null && user.SocialProfile.IsSocialEnabled,
                RestrictedAt = user.SocialProfile == null ? null : user.SocialProfile.CommunityRestrictedAt
            })
            .ToListAsync(cancellationToken);

        var households = rows.ToDictionary(
            row => row.Id,
            row => new AdminCommunityHouseholdResponse(
                row.Id,
                row.Handle,
                row.DisplayName,
                row.Enabled,
                row.RestrictedAt.HasValue,
                row.RestrictedAt,
                row.Status == UserStatus.Active && row.DeletedAt == null));

        // Report foreign keys are Restrict, so every id resolves; this only
        // keeps a projection total if that ever stops being true.
        foreach (var id in ids.Where(id => !households.ContainsKey(id)))
        {
            households[id] = new AdminCommunityHouseholdResponse(id, null, null, false, false, null, false);
        }

        return households;
    }

    private readonly record struct TargetKey(
        CommunityReportTargetType TargetType,
        Guid? CommentId,
        Guid? MomentId,
        Guid ReportedUserId)
    {
        /// <summary>
        /// The key that identifies the target: the Comment, the Moment, or —
        /// only for a Household report — the household.
        /// </summary>
        public TargetKey Normalized() => TargetType == CommunityReportTargetType.Household
            ? this with { CommentId = null, MomentId = null }
            : this with { ReportedUserId = Guid.Empty };
    }

    /// <summary>
    /// Open reports per target for a page of the queue, in one grouped query.
    /// </summary>
    private async Task<Dictionary<TargetKey, int>> CountOpenByTargetAsync(
        IEnumerable<TargetKey> keys,
        CancellationToken cancellationToken)
    {
        var targets = keys.Select(key => key.Normalized()).Distinct().ToArray();
        if (targets.Length == 0)
        {
            return new Dictionary<TargetKey, int>();
        }

        var commentIds = targets.Where(key => key.CommentId.HasValue).Select(key => key.CommentId!.Value).ToArray();
        var momentIds = targets.Where(key => key.MomentId.HasValue).Select(key => key.MomentId!.Value).ToArray();
        var householdIds = targets
            .Where(key => key.TargetType == CommunityReportTargetType.Household)
            .Select(key => key.ReportedUserId)
            .ToArray();

        var groups = await _dbContext.CommunityReports
            .AsNoTracking()
            .Where(report =>
                report.Status == CommunityReportStatus.Open
                && ((report.TargetType == CommunityReportTargetType.Comment && commentIds.Contains(report.CommentId!.Value))
                    || (report.TargetType == CommunityReportTargetType.Moment && momentIds.Contains(report.MomentId!.Value))
                    || (report.TargetType == CommunityReportTargetType.Household && householdIds.Contains(report.ReportedUserId))))
            .GroupBy(report => new
            {
                report.TargetType,
                report.CommentId,
                report.MomentId,
                ReportedUserId = report.TargetType == CommunityReportTargetType.Household
                    ? report.ReportedUserId
                    : Guid.Empty
            })
            .Select(group => new { group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return groups.ToDictionary(
            group => new TargetKey(group.Key.TargetType, group.Key.CommentId, group.Key.MomentId, group.Key.ReportedUserId),
            group => group.Count);
    }

    private static async Task<(IReadOnlyList<AdminCommunityReportHistoryItemResponse> Items, int Total)> LoadHistoryAsync(
        IQueryable<CommunityReport> reports,
        CancellationToken cancellationToken)
    {
        var total = await reports.CountAsync(cancellationToken);
        var items = await reports
            .OrderByDescending(report => report.CreatedAt)
            .ThenBy(report => report.Id)
            .Take(HistoryLimit)
            .Select(report => new
            {
                report.Id,
                report.TargetType,
                report.Reason,
                report.Status,
                report.Resolution,
                report.CreatedAt,
                report.ReviewedAt,
                ReporterHandle = report.ReporterUser.SocialProfile == null
                    ? null
                    : report.ReporterUser.SocialProfile.Handle
            })
            .ToListAsync(cancellationToken);

        return (items.Select(item => new AdminCommunityReportHistoryItemResponse(
                item.Id,
                item.TargetType.ToString(),
                item.Reason.ToString(),
                item.Status.ToString(),
                item.Resolution?.ToString(),
                item.CreatedAt,
                item.ReviewedAt,
                item.ReporterHandle))
            .ToArray(), total);
    }

    private static TEnum ParseName<TEnum>(string value, string field, string message, params TEnum[] allowed)
        where TEnum : struct, Enum
    {
        foreach (var candidate in allowed)
        {
            if (string.Equals(value, candidate.ToString(), StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }
        }

        throw ValidationFailed(field, message);
    }

    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    internal static ApiException ReportNotFound() => new(
        StatusCodes.Status404NotFound,
        "community_report_not_found",
        "This report could not be found.");

    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
