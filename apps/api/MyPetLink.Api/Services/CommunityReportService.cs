using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Report submission: a signed-in household tells MyPetLink about a Comment, a
/// Moment or a Community Profile.
///
/// <b>Evidence, not enforcement.</b> Submitting creates one Open
/// <see cref="CommunityReport"/> and changes nothing else — no block, hide,
/// removal, restriction, notification or audit row. Moderators decide later.
///
/// <b>Only what the reporter can see.</b> Each target is resolved through the
/// same visibility rule its public surface uses, for this reporter, so Block,
/// privacy, moderation and Community state all apply exactly as they do when
/// browsing. Anything the reporter cannot see — missing, deleted, private,
/// hidden by MyPetLink, blocked either way, Community off, inactive,
/// incomplete — answers with one identical "unavailable" error, so reporting
/// is never a way to learn about something hidden.
///
/// <b>Resolved on the server.</b> The reported household and the evidence
/// snapshot come from one read of the target, never from the request. The
/// snapshot is the committed version that read saw, and is never rewritten.
///
/// <b>Idempotent.</b> One Open report per reporter per target: a repeat —
/// a double tap, a retry after a timeout, two requests at once — converges on
/// the report already there and answers exactly like the first.
/// </summary>
public sealed class CommunityReportService : SkeletonService, ICommunityReportService
{
    private const int SnapshotTextMaxLength = 2000;
    private const string OpenReportIndex = "IX_CommunityReports_OpenPerReporterAndTarget";

    private readonly MyPetLinkDbContext _dbContext;

    public CommunityReportService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<CommunityReportReceivedResponse> SubmitAsync(
        Guid? currentUserId,
        CreateCommunityReportRequest? request,
        CancellationToken cancellationToken = default)
    {
        var reporterId = currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

        var targetType = ParseTargetType(request?.TargetType);
        var reason = ParseReason(request?.Reason);
        var details = CommunityReportDetailsRules.RequireValid(reason, request?.Details);
        await RequireReportingIdentityAsync(reporterId, cancellationToken);

        var target = await ResolveAsync(reporterId, targetType, request?.Target, cancellationToken)
            ?? throw Unavailable();

        if (target.ReportedUserId == reporterId)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "report_own_content",
                "You can't report your own content.");
        }

        if (await OpenReportExistsAsync(reporterId, targetType, target, cancellationToken))
        {
            return Received();
        }

        _dbContext.CommunityReports.Add(new CommunityReport
        {
            ReporterUserId = reporterId,
            TargetType = targetType,
            CommentId = target.CommentId,
            MomentId = target.MomentId,
            ReportedUserId = target.ReportedUserId,
            Reason = reason,
            Details = details,
            SnapshotHandle = target.Handle,
            SnapshotDisplayName = target.DisplayName,
            SnapshotTitle = target.Title,
            SnapshotText = Truncate(target.Text),
            SnapshotAvatarMediaFileId = target.AvatarMediaFileId,
            Status = CommunityReportStatus.Open,
            CreatedAt = DateTimeOffset.UtcNow
        });

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (UniqueConstraintViolation.IsFor(exception, OpenReportIndex))
        {
            // The same report arrived at the same moment, or a retried request
            // after the first had already committed. That one stands, untouched.
            _dbContext.ChangeTracker.Clear();
        }

        return Received();
    }

    // ---- target resolution ----------------------------------------------------

    private sealed record ResolvedTarget(
        Guid ReportedUserId,
        string Handle,
        string DisplayName,
        string? Title,
        string? Text,
        Guid? AvatarMediaFileId,
        Guid? CommentId,
        Guid? MomentId);

    /// <summary>
    /// The target as this reporter can currently see it, with its evidence, in
    /// one query; or null when they cannot see it — for any reason.
    /// </summary>
    private Task<ResolvedTarget?> ResolveAsync(
        Guid reporterId,
        CommunityReportTargetType targetType,
        string? target,
        CancellationToken cancellationToken)
    {
        return targetType switch
        {
            CommunityReportTargetType.Comment => ResolveCommentAsync(reporterId, target, cancellationToken),
            CommunityReportTargetType.Moment => ResolveMomentAsync(reporterId, target, cancellationToken),
            CommunityReportTargetType.Household => ResolveHouseholdAsync(reporterId, target, cancellationToken),
            _ => Task.FromResult<ResolvedTarget?>(null)
        };
    }

    /// <summary>
    /// A Comment the reporter can read on a Moment they can open. The reported
    /// household is the Comment's author: they wrote it.
    /// </summary>
    private async Task<ResolvedTarget?> ResolveCommentAsync(
        Guid reporterId,
        string? target,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(target, out var commentId))
        {
            return null;
        }

        var visibleMoments = _dbContext.PetMemories.VisibleTo(_dbContext, reporterId);
        return await _dbContext.MomentComments
            .VisibleComments(_dbContext, reporterId)
            .Where(comment =>
                comment.Id == commentId
                && visibleMoments.Any(moment => moment.Id == comment.MomentId))
            .Select(comment => new ResolvedTarget(
                comment.AuthorUserId,
                comment.AuthorUser.SocialProfile!.Handle!,
                comment.AuthorUser.SocialProfile.DisplayName!,
                null,
                comment.Body,
                null,
                comment.Id,
                null))
            .SingleOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// A Moment the reporter can open. The reported household is its author —
    /// never a collaborator, never the owner of a pet in it.
    /// </summary>
    private async Task<ResolvedTarget?> ResolveMomentAsync(
        Guid reporterId,
        string? target,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(target, out var momentId))
        {
            return null;
        }

        return await _dbContext.PetMemories
            .VisibleTo(_dbContext, reporterId)
            .Where(moment =>
                moment.Id == momentId
                && moment.AuthorUser.SocialProfile!.Handle != null
                && moment.AuthorUser.SocialProfile.Handle != ""
                && moment.AuthorUser.SocialProfile.DisplayName != null
                && moment.AuthorUser.SocialProfile.DisplayName != "")
            .Select(moment => new ResolvedTarget(
                moment.AuthorUserId,
                moment.AuthorUser.SocialProfile!.Handle!,
                moment.AuthorUser.SocialProfile.DisplayName!,
                moment.Title,
                moment.Caption,
                null,
                null,
                moment.Id))
            .SingleOrDefaultAsync(cancellationToken);
    }

    /// <summary>
    /// A Community Profile the reporter can open by its current handle: Community
    /// on, a complete identity, an Active account, and no block either way.
    /// </summary>
    private async Task<ResolvedTarget?> ResolveHouseholdAsync(
        Guid reporterId,
        string? target,
        CancellationToken cancellationToken)
    {
        var normalized = OwnerHandleRules.Normalize(target);
        if (normalized is null)
        {
            return null;
        }

        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, reporterId);
        return await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                profile.NormalizedHandle == normalized
                && profile.IsSocialEnabled
                && profile.Handle != null
                && profile.Handle != ""
                && profile.DisplayName != null
                && profile.DisplayName != ""
                && profile.User.DeletedAt == null
                && profile.User.Status == UserStatus.Active
                && !blocked.Contains(profile.UserId))
            .Select(profile => new ResolvedTarget(
                profile.UserId,
                profile.Handle!,
                profile.DisplayName!,
                null,
                profile.Bio,
                profile.AvatarMediaFileId,
                null,
                null))
            .SingleOrDefaultAsync(cancellationToken);
    }

    // ---- helpers ----------------------------------------------------------------

    private Task<bool> OpenReportExistsAsync(
        Guid reporterId,
        CommunityReportTargetType targetType,
        ResolvedTarget target,
        CancellationToken cancellationToken)
    {
        return _dbContext.CommunityReports.AnyAsync(
            report => report.ReporterUserId == reporterId
                && report.TargetType == targetType
                && report.CommentId == target.CommentId
                && report.MomentId == target.MomentId
                && report.ReportedUserId == target.ReportedUserId
                && report.Status == CommunityReportStatus.Open,
            cancellationToken);
    }

    /// <summary>The same Community identity commenting requires.</summary>
    private async Task RequireReportingIdentityAsync(Guid reporterId, CancellationToken cancellationToken)
    {
        var state = await _dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == reporterId && user.DeletedAt == null)
            .Select(user => new
            {
                user.Status,
                HasProfile = user.SocialProfile != null
                    && user.SocialProfile.IsSocialEnabled
                    && user.SocialProfile.Handle != null
                    && user.SocialProfile.Handle != ""
                    && user.SocialProfile.DisplayName != null
                    && user.SocialProfile.DisplayName != ""
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (state is null || state.Status != UserStatus.Active)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "account_inactive",
                "This account cannot send reports.");
        }

        if (!state.HasProfile)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "community_profile_required",
                "Set up your Community profile to send reports.");
        }
    }

    private static CommunityReportTargetType ParseTargetType(string? value)
    {
        foreach (var type in new[]
                 {
                     CommunityReportTargetType.Comment,
                     CommunityReportTargetType.Moment,
                     CommunityReportTargetType.Household
                 })
        {
            if (string.Equals(value, type.ToString(), StringComparison.OrdinalIgnoreCase))
            {
                return type;
            }
        }

        throw new ApiException(
            StatusCodes.Status422UnprocessableEntity,
            "report_target_type_invalid",
            "Choose what you're reporting.");
    }

    /// <summary>
    /// Exactly one of the named reasons (case-insensitive, nothing trimmed or
    /// guessed). Anything else — blank, a number, an unknown name — is Unknown, which the shared details rule refuses.
    /// Nothing is ever mapped to Other.
    /// </summary>
    private static CommunityReportReason ParseReason(string? value)
    {
        foreach (var reason in Enum.GetValues<CommunityReportReason>())
        {
            if (reason != CommunityReportReason.Unknown
                && string.Equals(value, reason.ToString(), StringComparison.OrdinalIgnoreCase))
            {
                return reason;
            }
        }

        return CommunityReportReason.Unknown;
    }

    private static string? Truncate(string? text) =>
        text is { Length: > SnapshotTextMaxLength } ? text[..SnapshotTextMaxLength] : text;

    private static CommunityReportReceivedResponse Received() => new(true);

    /// <summary>
    /// The one answer for every target this reporter cannot see, whatever the
    /// reason — the same status, code and words each time.
    /// </summary>
    private static ApiException Unavailable() => new(
        StatusCodes.Status404NotFound,
        "report_target_unavailable",
        "This is no longer available to report.");
}
