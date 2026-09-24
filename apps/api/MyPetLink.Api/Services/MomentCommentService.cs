using System.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// Household-authored, plain-text comments on public Moments.
///
/// Reads and counts share <see cref="SocialVisibility.VisibleComments"/>.
/// Creates require a complete Community identity. Deletes retain only the row's
/// identity and ordering fields and scrub the body in the same transaction as
/// Activity cleanup.
/// </summary>
public sealed class MomentCommentService : SkeletonService, IMomentCommentService
{
    public const int PageSize = 20;
    public static readonly TimeSpan DuplicateWindow = TimeSpan.FromSeconds(60);

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IOwnerNotificationService _notifications;
    private readonly CloudflareR2Options _r2Options;

    public MomentCommentService(
        MyPetLinkDbContext dbContext,
        IOwnerNotificationService notifications,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _r2Options = r2Options.Value;
    }

    public async Task<MomentCommentPageResponse> GetAsync(
        Guid momentId,
        Guid? viewerId,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        var moment = await RequireVisibleMomentAsync(momentId, viewerId, cancellationToken);
        var take = SocialCursor.ClampPageSize(pageSize, PageSize);
        var position = SocialCursor.TryDecode(cursor);
        var query = _dbContext.MomentComments
            .VisibleComments(_dbContext, viewerId)
            .Where(comment => comment.MomentId == momentId);

        if (position is not null)
        {
            query = query.Where(comment =>
                comment.CreatedAt < position.PublishedAt
                || (comment.CreatedAt == position.PublishedAt
                    && comment.Id.CompareTo(position.Id) < 0));
        }

        var ordered = query
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Take(take + 1);
        var rows = await Project(ordered)
            .ToListAsync(cancellationToken);
        var hasMore = rows.Count > take;
        var page = hasMore ? rows.Take(take).ToList() : rows;
        var last = page.Count > 0 ? page[^1] : null;

        return new MomentCommentPageResponse(
            page.Select(row => ToResponse(row, viewerId, moment.AuthorUserId)).ToArray(),
            hasMore && last is not null
                ? new SocialCursor(last.CreatedAt, last.Id).Encode()
                : null,
            await CountVisibleAsync(momentId, viewerId, cancellationToken),
            await BuildViewerAsync(viewerId, cancellationToken));
    }

    public async Task<CreateMomentCommentResponse> CreateAsync(
        Guid? currentUserId,
        Guid momentId,
        CreateMomentCommentRequest? request,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var body = MomentCommentBodyRules.RequireValid(request?.Body);
        await RequireCommentingIdentityAsync(actorId, cancellationToken);
        var moment = await RequireVisibleMomentAsync(momentId, actorId, cancellationToken);
        // SQL Server takes one transaction-scoped application lock per
        // author/Moment pair before checking the retry window. That avoids the
        // shared-range-lock conversion deadlock a plain Serializable
        // read-then-insert can produce, and also serializes unread Activity
        // coalescing for this pair. It does not impose a permanent uniqueness
        // rule: the same text may be posted again after the retry window.
        // Non-SQL relational providers keep Serializable as a safe fallback;
        // the in-memory provider used by unit tests keeps the service recheck.
        // Production enables SQL connection retries. EF refuses commands in a
        // user transaction unless the execution strategy owns the entire
        // unit, so the lock, retry-window read, comment and Activity write all
        // run inside one retriable delegate. Clearing the tracker makes a
        // second attempt independent from an abandoned first attempt.
        var commentId = Guid.Empty;
        var strategy = _dbContext.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            _dbContext.ChangeTracker.Clear();
            await using IDbContextTransaction? transaction = _dbContext.Database.IsRelational()
                ? await _dbContext.Database.BeginTransactionAsync(
                    _dbContext.Database.IsSqlServer()
                        ? IsolationLevel.ReadCommitted
                        : IsolationLevel.Serializable,
                    cancellationToken)
                : null;

            if (transaction is not null && _dbContext.Database.IsSqlServer())
            {
                await AcquireCommentPairLockAsync(
                    transaction,
                    actorId,
                    momentId,
                    cancellationToken);
            }

            var now = DateTimeOffset.UtcNow;
            var duplicate = await _dbContext.MomentComments
                .Where(comment => comment.AuthorUserId == actorId
                    && comment.MomentId == momentId
                    && comment.DeletedAt == null
                    && comment.CreatedAt >= now - DuplicateWindow
                    && comment.Body == body)
                .OrderByDescending(comment => comment.CreatedAt)
                .ThenByDescending(comment => comment.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (duplicate is not null)
            {
                commentId = duplicate.Id;
            }
            else
            {
                var comment = new MomentComment
                {
                    MomentId = momentId,
                    AuthorUserId = actorId,
                    Body = body,
                    CreatedAt = now
                };
                commentId = comment.Id;
                _dbContext.MomentComments.Add(comment);
                await _notifications.StageCommentNotification(
                    actorId,
                    moment.AuthorUserId,
                    momentId,
                    moment.PetId,
                    comment.Id,
                    cancellationToken);
                await _dbContext.SaveChangesAsync(cancellationToken);
            }

            if (transaction is not null)
            {
                await transaction.CommitAsync(cancellationToken);
            }
        });

        var response = await LoadResponseAsync(
            commentId, actorId, moment.AuthorUserId, cancellationToken);

        return new CreateMomentCommentResponse(
            response,
            await CountVisibleAsync(momentId, actorId, cancellationToken));
    }

    public async Task<DeleteMomentCommentResponse> DeleteAsync(
        Guid? currentUserId,
        Guid momentId,
        Guid commentId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var comment = await _dbContext.MomentComments
            .Where(item => item.Id == commentId && item.MomentId == momentId)
            .Select(item => new
            {
                Entity = item,
                MomentAuthorUserId = item.Moment.AuthorUserId
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (comment is null
            || (comment.Entity.AuthorUserId != actorId
                && comment.MomentAuthorUserId != actorId))
        {
            throw CommentNotFound();
        }

        if (!comment.Entity.DeletedAt.HasValue)
        {
            comment.Entity.Body = "";
            comment.Entity.DeletedAt = DateTimeOffset.UtcNow;
            comment.Entity.DeletedByUserId = actorId;

            await _notifications.StageCommentNotificationWithdrawal(
                comment.Entity.AuthorUserId,
                momentId,
                commentId,
                cancellationToken);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return new DeleteMomentCommentResponse(
            commentId,
            await CountVisibleAsync(momentId, actorId, cancellationToken));
    }

    private async Task<VisibleMoment> RequireVisibleMomentAsync(
        Guid momentId,
        Guid? viewerId,
        CancellationToken cancellationToken)
    {
        var moment = await _dbContext.PetMemories
            .VisibleTo(_dbContext, viewerId)
            .Where(item => item.Id == momentId)
            .Select(item => new VisibleMoment(item.AuthorUserId, item.PetId))
            .SingleOrDefaultAsync(cancellationToken);

        return moment ?? throw MomentNotFound();
    }

    private async Task RequireCommentingIdentityAsync(
        Guid actorId,
        CancellationToken cancellationToken)
    {
        var state = await _dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == actorId && user.DeletedAt == null)
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
                "This account cannot comment.");
        }

        if (!state.HasProfile)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "community_profile_required",
                "Set up your Community profile to comment.");
        }
    }

    private async Task<MomentCommentViewerResponse> BuildViewerAsync(
        Guid? viewerId,
        CancellationToken cancellationToken)
    {
        if (!viewerId.HasValue)
        {
            return new MomentCommentViewerResponse(false, "signIn", null);
        }

        var profile = await _dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == viewerId.Value
                && user.DeletedAt == null
                && user.Status == UserStatus.Active
                && user.SocialProfile != null
                && user.SocialProfile.IsSocialEnabled
                && user.SocialProfile.Handle != null
                && user.SocialProfile.Handle != ""
                && user.SocialProfile.DisplayName != null
                && user.SocialProfile.DisplayName != "")
            .Select(user => new
            {
                user.SocialProfile!.Handle,
                user.SocialProfile.DisplayName,
                Avatar = user.SocialProfile.AvatarMediaFile
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (profile is null)
        {
            return new MomentCommentViewerResponse(false, "communityProfile", null);
        }

        return new MomentCommentViewerResponse(
            true,
            null,
            new PublicOwnerAttributionResponse(
                profile.Handle!,
                profile.DisplayName!,
                MediaDerivatives.ResolveOriginalUrl(profile.Avatar, _r2Options.PublicBaseUrl),
                MediaDerivatives.ResolveThumbnailUrl(profile.Avatar, _r2Options.PublicBaseUrl)));
    }

    private Task<int> CountVisibleAsync(
        Guid momentId,
        Guid? viewerId,
        CancellationToken cancellationToken)
    {
        return _dbContext.MomentComments
            .VisibleComments(_dbContext, viewerId)
            .CountAsync(comment => comment.MomentId == momentId, cancellationToken);
    }

    private async Task AcquireCommentPairLockAsync(
        IDbContextTransaction transaction,
        Guid actorId,
        Guid momentId,
        CancellationToken cancellationToken)
    {
        var connection = _dbContext.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var command = connection.CreateCommand();
        command.Transaction = transaction.GetDbTransaction();
        command.CommandText = """
            DECLARE @result int;
            EXEC @result = sys.sp_getapplock
                @Resource = @resource,
                @LockMode = N'Exclusive',
                @LockOwner = N'Transaction',
                @LockTimeout = 10000;
            SELECT @result;
            """;

        var parameter = command.CreateParameter();
        parameter.ParameterName = "@resource";
        parameter.DbType = DbType.String;
        parameter.Size = 255;
        parameter.Value = $"mypetlink:moment-comment:{actorId:N}:{momentId:N}";
        command.Parameters.Add(parameter);

        var result = Convert.ToInt32(
            await command.ExecuteScalarAsync(cancellationToken),
            System.Globalization.CultureInfo.InvariantCulture);
        if (result < 0)
        {
            throw new ApiException(
                StatusCodes.Status503ServiceUnavailable,
                "comment_temporarily_unavailable",
                "We couldn’t post your comment right now. Please try again.");
        }
    }

    private async Task<MomentCommentResponse> LoadResponseAsync(
        Guid commentId,
        Guid viewerId,
        Guid momentAuthorUserId,
        CancellationToken cancellationToken)
    {
        var source = _dbContext.MomentComments
            .AsNoTracking()
            .Where(comment => comment.Id == commentId);
        var row = await Project(source).SingleAsync(cancellationToken);
        return ToResponse(row, viewerId, momentAuthorUserId);
    }

    private static IQueryable<CommentProjection> Project(IQueryable<MomentComment> query)
    {
        return query.Select(comment => new CommentProjection(
            comment.Id,
            comment.Body,
            comment.CreatedAt,
            comment.AuthorUserId,
            comment.AuthorUser.SocialProfile!.Handle!,
            comment.AuthorUser.SocialProfile.DisplayName!,
            comment.AuthorUser.SocialProfile.AvatarMediaFile));
    }

    private MomentCommentResponse ToResponse(
        CommentProjection row,
        Guid? viewerId,
        Guid momentAuthorUserId)
    {
        var action = viewerId == row.AuthorUserId
            ? "delete"
            : viewerId == momentAuthorUserId
                ? "remove"
                : null;

        return new MomentCommentResponse(
            row.Id,
            row.Body,
            row.CreatedAt,
            new PublicOwnerAttributionResponse(
                row.Handle,
                row.DisplayName,
                MediaDerivatives.ResolveOriginalUrl(row.Avatar, _r2Options.PublicBaseUrl),
                MediaDerivatives.ResolveThumbnailUrl(row.Avatar, _r2Options.PublicBaseUrl)),
            action);
    }

    private static Guid RequireUserId(Guid? currentUserId) =>
        currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

    private static ApiException MomentNotFound() => new(
        StatusCodes.Status404NotFound,
        "social_moment_not_found",
        "This Moment is not available.");

    private static ApiException CommentNotFound() => new(
        StatusCodes.Status404NotFound,
        "comment_not_found",
        "This comment is not available.");

    private sealed record VisibleMoment(Guid AuthorUserId, Guid PetId);

    private sealed record CommentProjection(
        Guid Id,
        string Body,
        DateTimeOffset CreatedAt,
        Guid AuthorUserId,
        string Handle,
        string DisplayName,
        MediaFile? Avatar);
}
