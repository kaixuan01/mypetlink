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
/// Community content and households as a moderator sees them, without a
/// report: the Moments and Comments lists, a Moment or Comment in context, and
/// a household's moderation standing and history.
///
/// These reads are privileged in the same way the report detail's are — blocks,
/// Community switch-offs, removal and restriction hide nothing from a
/// moderator — and none of them widens a public query. A private Moment is
/// never listed: it was never shared, so there is nothing to moderate.
/// </summary>
public sealed class AdminCommunityContentQueryService : SkeletonService, IAdminCommunityContentQueryService
{
    /// <summary>How much moderation history a detail carries, newest first.</summary>
    public const int HistoryLimit = 50;

    /// <summary>How many Replies of a thread "View context" shows.</summary>
    public const int ThreadLimit = 50;

    private const int PreviewLength = 160;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly AdminCommunityContentReader _reader;

    public AdminCommunityContentQueryService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _reader = new AdminCommunityContentReader(dbContext, r2Options.Value.PublicBaseUrl);
    }

    // ---- Moments ------------------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminCommunityMomentListItemResponse> Items, int Total)> ListMomentsAsync(
        AdminCommunityMomentQuery query,
        CancellationToken cancellationToken = default)
    {
        var moments = CommunityMoments();

        switch (Normalize(query.Status))
        {
            case null:
                break;
            case "active":
                moments = moments.Where(moment => moment.ModeratedAt == null);
                break;
            case "removed":
                moments = moments.Where(moment => moment.ModeratedAt != null);
                break;
            default:
                throw ValidationFailed("status", "Choose Active or Removed.");
        }

        if (query.AuthorId is { } authorId)
        {
            moments = moments.Where(moment => moment.AuthorUserId == authorId);
        }

        if (query.Search?.Trim() is { Length: > 0 } search)
        {
            moments = moments.Where(moment => moment.Title.Contains(search));
        }

        var total = await moments.CountAsync(cancellationToken);
        var visible = _dbContext.PetMemories.SociallyVisible();
        var rows = await moments
            .OrderByDescending(moment => moment.PublishedAt ?? moment.CreatedAt)
            .ThenByDescending(moment => moment.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(moment => new
            {
                moment.Id,
                moment.Title,
                moment.Caption,
                moment.AuthorUserId,
                PetName = moment.Pet.Name,
                moment.PublishedAt,
                moment.ModeratedAt,
                Visible = visible.Any(item => item.Id == moment.Id),
                LikeCount = _dbContext.MomentLikes.Count(like => like.MomentId == moment.Id),
                CommentCount = _dbContext.MomentComments.Count(comment =>
                    comment.MomentId == moment.Id && comment.DeletedAt == null)
            })
            .ToListAsync(cancellationToken);
        var households = await _reader.LoadHouseholdsAsync(rows.Select(row => row.AuthorUserId), cancellationToken);

        return (
            rows.Select(row => new AdminCommunityMomentListItemResponse(
                    row.Id,
                    row.Title,
                    Preview(row.Caption),
                    households[row.AuthorUserId],
                    row.PetName,
                    row.PublishedAt,
                    MomentStatus(row.ModeratedAt, row.Visible),
                    row.ModeratedAt,
                    row.LikeCount,
                    row.CommentCount))
                .ToArray(),
            total);
    }

    public async Task<AdminCommunityMomentDetailResponse> GetMomentAsync(
        Guid? currentUserId,
        Guid momentId,
        CancellationToken cancellationToken = default)
    {
        var summary = await CommunityMoments()
            .Where(moment => moment.Id == momentId)
            .Select(moment => new
            {
                PetName = moment.Pet.Name,
                LikeCount = _dbContext.MomentLikes.Count(like => like.MomentId == moment.Id),
                CommentCount = _dbContext.MomentComments.Count(comment =>
                    comment.MomentId == moment.Id && comment.DeletedAt == null)
            })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw AdminCommunityEnforcementService.ContentNotFound();
        var moment = await _reader.LoadMomentAsync(momentId, cancellationToken)
            ?? throw AdminCommunityEnforcementService.ContentNotFound();
        var households = await _reader.LoadHouseholdsAsync([moment.AuthorUserId], cancellationToken);
        var history = await HistoryAsync(
            _dbContext.CommunityModerationActions.Where(action => action.MomentId == momentId),
            cancellationToken);

        return new AdminCommunityMomentDetailResponse(
            ToMomentResponse(moment, households),
            summary.PetName,
            summary.LikeCount,
            summary.CommentCount,
            history.Items,
            currentUserId == moment.AuthorUserId
                ? []
                : [moment.ModeratedAt.HasValue ? "RestoreMoment" : "RemoveMoment"]);
    }

    // ---- Comments and Replies -------------------------------------------------------

    public async Task<(IReadOnlyCollection<AdminCommunityCommentListItemResponse> Items, int Total)> ListCommentsAsync(
        AdminCommunityCommentQuery query,
        CancellationToken cancellationToken = default)
    {
        var comments = _dbContext.MomentComments.AsNoTracking();

        switch (Normalize(query.Status))
        {
            case null:
                break;
            case "active":
                comments = comments.Where(comment => comment.DeletedAt == null);
                break;
            case "removed":
                comments = comments.Where(comment => comment.DeletedAt != null);
                break;
            default:
                throw ValidationFailed("status", "Choose Active or Removed.");
        }

        switch (Normalize(query.Kind))
        {
            case null:
                break;
            case "comment":
                comments = comments.Where(comment => comment.ParentCommentId == null);
                break;
            case "reply":
                comments = comments.Where(comment => comment.ParentCommentId != null);
                break;
            default:
                throw ValidationFailed("kind", "Choose Comment or Reply.");
        }

        if (query.AuthorId is { } authorId)
        {
            comments = comments.Where(comment => comment.AuthorUserId == authorId);
        }

        if (query.MomentId is { } momentId)
        {
            comments = comments.Where(comment => comment.MomentId == momentId);
        }

        var total = await comments.CountAsync(cancellationToken);
        var publiclyVisible = _dbContext.MomentComments.VisibleComments(_dbContext, null);
        var rows = await comments
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(comment => new
            {
                comment.Id,
                comment.ParentCommentId,
                // A removed Comment's text is gone; nothing here brings it back.
                Body = comment.DeletedAt == null ? comment.Body : null,
                comment.AuthorUserId,
                comment.MomentId,
                MomentTitle = comment.Moment.Title,
                MomentAuthorUserId = comment.Moment.AuthorUserId,
                comment.CreatedAt,
                comment.DeletedAt,
                comment.DeletedByUserId,
                PubliclyVisible = publiclyVisible.Any(item => item.Id == comment.Id)
            })
            .ToListAsync(cancellationToken);
        var households = await _reader.LoadHouseholdsAsync(rows.Select(row => row.AuthorUserId), cancellationToken);

        return (
            rows.Select(row => new AdminCommunityCommentListItemResponse(
                    row.Id,
                    row.ParentCommentId is null ? "Comment" : "Reply",
                    row.Body,
                    households[row.AuthorUserId],
                    row.MomentId,
                    row.MomentTitle,
                    row.ParentCommentId,
                    row.CreatedAt,
                    CommentStatus(row.DeletedAt, row.DeletedByUserId, row.AuthorUserId, row.MomentAuthorUserId),
                    row.DeletedAt,
                    row.PubliclyVisible))
                .ToArray(),
            total);
    }

    /// <summary>
    /// A Comment or Reply with what a moderator needs to judge it: the Moment
    /// it is on, the Comment a Reply answers, and the thread's Replies.
    /// </summary>
    public async Task<AdminCommunityCommentContextResponse> GetCommentAsync(
        Guid? currentUserId,
        Guid commentId,
        CancellationToken cancellationToken = default)
    {
        var comment = await _reader.LoadCommentAsync(commentId, cancellationToken)
            ?? throw AdminCommunityEnforcementService.ContentNotFound();
        var parent = comment.ParentCommentId is { } parentId
            ? await _reader.LoadCommentAsync(parentId, cancellationToken)
            : null;
        var moment = await _reader.LoadMomentAsync(comment.MomentId, cancellationToken);

        var threadRootId = comment.ParentCommentId ?? comment.Id;
        var thread = _dbContext.MomentComments.AsNoTracking()
            .Where(item => item.ParentCommentId == threadRootId);
        var threadTotal = await thread.CountAsync(cancellationToken);
        var replies = await thread
            .OrderBy(item => item.CreatedAt)
            .ThenBy(item => item.Id)
            .Take(ThreadLimit)
            .Select(item => new
            {
                item.Id,
                Body = item.DeletedAt == null ? item.Body : null,
                item.CreatedAt,
                Removed = item.DeletedAt != null,
                item.AuthorUserId
            })
            .ToListAsync(cancellationToken);

        var households = await _reader.LoadHouseholdsAsync(
            replies.Select(item => item.AuthorUserId)
                .Append(comment.AuthorUserId)
                .Concat(parent is null ? [] : [parent.AuthorUserId])
                .Concat(moment is null ? [] : [moment.AuthorUserId]),
            cancellationToken);
        var history = await HistoryAsync(
            _dbContext.CommunityModerationActions.Where(action => action.CommentId == commentId),
            cancellationToken);
        var involvesYou = currentUserId == comment.AuthorUserId || currentUserId == comment.MomentAuthorUserId;

        return new AdminCommunityCommentContextResponse(
            new AdminCommunityCurrentCommentResponse(
                comment.Id,
                comment.MomentId,
                comment.DeletedAt.HasValue ? "" : comment.Body,
                comment.CreatedAt,
                comment.DeletedAt.HasValue,
                comment.DeletedAt,
                comment.DeletedAt.HasValue
                    ? AdminCommunityContentReader.DescribeRemover(
                        comment.DeletedByUserId, comment.AuthorUserId, comment.MomentAuthorUserId)
                    : null,
                comment.PubliclyVisible,
                households[comment.AuthorUserId],
                comment.ParentCommentId,
                parent is null ? null : new AdminCommunityParentCommentResponse(
                    parent.Id,
                    parent.DeletedAt.HasValue ? null : parent.Body,
                    parent.CreatedAt,
                    parent.DeletedAt.HasValue,
                    parent.PubliclyVisible,
                    households[parent.AuthorUserId]),
                comment.ReplyCount),
            moment is null ? null : ToMomentResponse(moment, households),
            replies.Select(item => new AdminCommunityThreadItemResponse(
                    item.Id,
                    item.Body,
                    item.CreatedAt,
                    item.Removed,
                    households[item.AuthorUserId]))
                .ToArray(),
            threadTotal,
            history.Items,
            involvesYou || comment.DeletedAt.HasValue ? [] : ["RemoveComment"]);
    }

    // ---- Households -----------------------------------------------------------------

    /// <summary>
    /// A household's moderation standing — account status and Community
    /// status kept apart — its warning count, any restriction and its end,
    /// and its history. A moderator never reviews their own household.
    /// </summary>
    public async Task<AdminCommunityHouseholdModerationResponse> GetHouseholdAsync(
        Guid? currentUserId,
        Guid ownerId,
        CancellationToken cancellationToken = default)
    {
        if (currentUserId == ownerId)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "moderation_conflict_of_interest",
                "Another moderator needs to review your own household.");
        }

        var account = await _dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == ownerId && user.DeletedAt == null)
            .Select(user => new
            {
                user.Status,
                IsAdmin = user.AdminUser != null && user.AdminUser.IsActive && user.AdminUser.DisabledAt == null
            })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw AdminCommunityEnforcementService.OwnerNotFound();
        var profile = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(item => item.UserId == ownerId)
            .Select(item => new
            {
                item.IsSocialEnabled,
                item.CommunityRestrictedAt,
                item.CommunityRestrictedUntil
            })
            .SingleOrDefaultAsync(cancellationToken);
        var households = await _reader.LoadHouseholdsAsync([ownerId], cancellationToken);
        var warningCount = await _dbContext.CommunityModerationActions.CountAsync(
            action => action.TargetUserId == ownerId
                && action.ActionType == CommunityModerationActionType.WarningIssued,
            cancellationToken);
        var history = await HistoryAsync(
            _dbContext.CommunityModerationActions.Where(action => action.TargetUserId == ownerId),
            cancellationToken);

        var restricted = profile?.CommunityRestrictedAt is not null;
        var communityStatus = profile is null ? "NotSetUp"
            : restricted ? (profile.CommunityRestrictedUntil is null ? "Suspended" : "Restricted")
            : profile.IsSocialEnabled ? "On"
            : "Off";

        var actions = new List<string> { "IssueWarning" };
        if (profile is not null) actions.Add("RestrictCommunity");
        if (restricted) actions.Add("LiftCommunityRestriction");
        if (!account.IsAdmin && account.Status == UserStatus.Active) actions.Add("SuspendAccount");
        if (!account.IsAdmin && account.Status == UserStatus.Suspended) actions.Add("ReinstateAccount");

        return new AdminCommunityHouseholdModerationResponse(
            households[ownerId],
            account.Status.ToString(),
            communityStatus,
            warningCount,
            profile?.CommunityRestrictedAt,
            profile?.CommunityRestrictedUntil,
            history.Items,
            history.Total,
            actions);
    }

    // ---- helpers --------------------------------------------------------------------

    /// <summary>Moments that were shared: public now, or hidden by MyPetLink. Never a private one.</summary>
    private IQueryable<PetMemory> CommunityMoments() =>
        _dbContext.PetMemories
            .AsNoTracking()
            .Where(moment => moment.DeletedAt == null
                && (moment.Visibility == MemoryVisibility.Public || moment.ModeratedAt != null));

    private async Task<(IReadOnlyList<AdminCommunityModerationHistoryItemResponse> Items, int Total)> HistoryAsync(
        IQueryable<CommunityModerationAction> actions,
        CancellationToken cancellationToken)
    {
        var total = await actions.CountAsync(cancellationToken);
        var items = await actions
            .AsNoTracking()
            .OrderByDescending(action => action.CreatedAt)
            .ThenByDescending(action => action.Id)
            .Take(HistoryLimit)
            .Select(action => new
            {
                action.Id,
                action.ActionType,
                action.Reason,
                action.InternalRemark,
                PerformedByName = action.PerformedByUser == null ? null : action.PerformedByUser.DisplayName,
                action.CreatedAt,
                action.RestrictedUntil,
                action.MomentId,
                action.CommentId,
                action.CommunityReportId,
                action.ContentSnapshot
            })
            .ToListAsync(cancellationToken);

        return (
            items.Select(item => new AdminCommunityModerationHistoryItemResponse(
                    item.Id,
                    item.ActionType.ToString(),
                    item.Reason?.ToString(),
                    item.InternalRemark,
                    item.PerformedByName,
                    item.CreatedAt,
                    item.RestrictedUntil,
                    item.MomentId,
                    item.CommentId,
                    item.CommunityReportId,
                    item.ContentSnapshot))
                .ToArray(),
            total);
    }

    private static AdminCommunityCurrentMomentResponse ToMomentResponse(
        AdminCommunityContentReader.MomentRow moment,
        IReadOnlyDictionary<Guid, AdminCommunityHouseholdResponse> households) =>
        new(
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
            moment.Media);

    private static string MomentStatus(DateTimeOffset? moderatedAt, bool visible) =>
        moderatedAt.HasValue ? "Removed" : visible ? "Visible" : "NotVisible";

    private static string CommentStatus(DateTimeOffset? deletedAt, Guid? deletedBy, Guid authorId, Guid momentAuthorId) =>
        !deletedAt.HasValue ? "Active"
        : deletedBy == authorId ? "DeletedByAuthor"
        : deletedBy == momentAuthorId ? "DeletedByMomentAuthor"
        : "RemovedByMyPetLink";

    private static string? Preview(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length <= PreviewLength ? trimmed : $"{trimmed[..PreviewLength].TrimEnd()}…";
    }

    /// <summary>A filter value lowercased for matching, or null when absent.</summary>
    private static string? Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
