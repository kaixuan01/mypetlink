using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Moderation taken directly from the Admin Portal, without a report: removing
/// a Moment, Comment or Reply, warning a household, restricting its Community
/// access and lifting it, and — separately and only for serious cases —
/// suspending the whole account.
///
/// <b>Community actions stay Community-only.</b> Removing content, warning and
/// restricting never touch sign-in, the Owner Portal, pets, Share or Safety
/// Profiles, Smart Tags, Lost Mode or orders. Account suspension is the one
/// action that does, and it is a different action, capability and status.
///
/// <b>One transaction each.</b> The change, the household's moderation history
/// entry, one <see cref="AuditLog"/> row and — when something of theirs was
/// removed, they were warned or their Community access was restricted — their
/// notice commit together or not at all, under the same application locks the
/// report actions take (<see cref="CommunityModerationTransaction"/>).
///
/// <b>Never repeated.</b> Removing removed content, lifting a restriction that
/// is not there or suspending a suspended account answers <c>409</c> and
/// writes nothing. A moderator never acts on their own household.
/// </summary>
public sealed class AdminCommunityEnforcementService : SkeletonService, IAdminCommunityEnforcementService
{
    private const string ConflictMessage = "This changed while you were reviewing it. Refresh and try again.";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IOwnerNotificationService _notifications;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public AdminCommunityEnforcementService(
        MyPetLinkDbContext dbContext,
        IOwnerNotificationService notifications,
        IAuditLogService auditLogService,
        TimeProvider? timeProvider = null)
    {
        _dbContext = dbContext;
        _notifications = notifications;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    // ---- Moments ------------------------------------------------------------------

    /// <summary>
    /// Hides a Moment from every public surface (Hidden by MyPetLink). Nothing
    /// is deleted: its author still sees it, marked, and it can be restored.
    /// </summary>
    public async Task<AdminCommunityActionResultResponse> RemoveMomentAsync(
        Guid? currentUserId,
        Guid momentId,
        AdminCommunityRemoveContentRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var reason = CommunityModerationReasons.Parse(request?.Reason);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        var authorId = await RequireCommunityMomentAuthorAsync(momentId, cancellationToken);
        RequireNotOwnHousehold(moderatorId, authorId);

        return await RunAsync([CommunityModerationTransaction.MomentLock(momentId)], async () =>
        {
            var moment = await _dbContext.PetMemories.SingleAsync(item => item.Id == momentId, cancellationToken);
            if (CommunityModeration.IsHidden(moment))
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "content_already_removed",
                    "This Moment has already been removed.");
            }

            var now = _timeProvider.GetUtcNow();
            CommunityModeration.HideMoment(moment, moderatorId, now);
            var action = CommunityModerationHistory.Record(
                _dbContext,
                moment.AuthorUserId,
                CommunityModerationActionType.MomentRemoved,
                reason,
                remark,
                moderatorId,
                now,
                momentId: moment.Id,
                contentSnapshot: CommunityModerationSnapshot.ForMoment(moment.Title, moment.Caption));
            await _notifications.StageModerationNotice(action, cancellationToken);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.MomentHidden,
                CommunityModerationAudit.MomentEntity,
                moment.Id,
                new { hidden = false },
                new { hidden = true, hiddenAt = now, reason = reason.ToString(), remark, moderationActionId = action.Id });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    /// <summary>Puts a removed Moment back wherever its owner's own settings would show it.</summary>
    public async Task<AdminCommunityActionResultResponse> RestoreMomentAsync(
        Guid? currentUserId,
        Guid momentId,
        AdminCommunityReversalRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        var authorId = await RequireCommunityMomentAuthorAsync(momentId, cancellationToken);
        RequireNotOwnHousehold(moderatorId, authorId);

        return await RunAsync([CommunityModerationTransaction.MomentLock(momentId)], async () =>
        {
            var moment = await _dbContext.PetMemories.SingleAsync(item => item.Id == momentId, cancellationToken);
            if (!CommunityModeration.IsHidden(moment))
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "moment_not_hidden",
                    "This Moment isn't removed.");
            }

            var previous = new { hidden = true, hiddenAt = moment.ModeratedAt, hiddenByUserId = moment.ModeratedByUserId };
            CommunityModeration.UnhideMoment(moment);
            var action = CommunityModerationHistory.Record(
                _dbContext,
                moment.AuthorUserId,
                CommunityModerationActionType.MomentRestored,
                reason: null,
                remark,
                moderatorId,
                _timeProvider.GetUtcNow(),
                momentId: moment.Id);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.MomentUnhidden,
                CommunityModerationAudit.MomentEntity,
                moment.Id,
                previous,
                new { hidden = false, remark, moderationActionId = action.Id });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    // ---- Comments and Replies -------------------------------------------------------

    /// <summary>
    /// Removes a Comment or Reply the same way every removal does
    /// (<see cref="MomentCommentRemoval"/>): its text is wiped from the Comment,
    /// its mentions and unread Activity go. The text survives only in the
    /// household's moderation history, for moderators.
    /// </summary>
    public async Task<AdminCommunityActionResultResponse> RemoveCommentAsync(
        Guid? currentUserId,
        Guid commentId,
        AdminCommunityRemoveContentRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var reason = CommunityModerationReasons.Parse(request?.Reason);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        var target = await _dbContext.MomentComments
            .AsNoTracking()
            .Where(item => item.Id == commentId)
            .Select(item => new { item.AuthorUserId, MomentAuthorUserId = item.Moment.AuthorUserId })
            .SingleOrDefaultAsync(cancellationToken)
            ?? throw ContentNotFound();

        // Removing a Comment on your own Moment is something you can already do
        // as its author; doing it as a moderator would record it as MyPetLink's.
        RequireNotOwnHousehold(moderatorId, target.AuthorUserId);
        RequireNotOwnHousehold(moderatorId, target.MomentAuthorUserId);

        return await RunAsync([CommunityModerationTransaction.CommentLock(commentId)], async transaction =>
        {
            var before = await _dbContext.MomentComments
                .AsNoTracking()
                .Where(item => item.Id == commentId)
                .Select(item => new { item.MomentId, item.ParentCommentId, item.Body })
                .SingleAsync(cancellationToken);
            var removed = await MomentCommentRemoval.StageAsync(
                _dbContext,
                _notifications,
                transaction,
                moderatorId,
                commentId,
                cancellationToken);
            if (!removed)
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "content_already_removed",
                    "This comment has already been removed.");
            }

            var now = _timeProvider.GetUtcNow();
            var action = CommunityModerationHistory.Record(
                _dbContext,
                target.AuthorUserId,
                before.ParentCommentId is null
                    ? CommunityModerationActionType.CommentRemoved
                    : CommunityModerationActionType.ReplyRemoved,
                reason,
                remark,
                moderatorId,
                now,
                commentId: commentId,
                contentSnapshot: CommunityModerationSnapshot.ForComment(before.Body));
            await _notifications.StageModerationNotice(action, cancellationToken);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.CommentRemoved,
                CommunityModerationAudit.CommentEntity,
                commentId,
                new { removed = false },
                new
                {
                    removed = true,
                    momentId = before.MomentId,
                    reply = before.ParentCommentId is not null,
                    reason = reason.ToString(),
                    remark,
                    moderationActionId = action.Id
                });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    // ---- Households -----------------------------------------------------------------

    /// <summary>
    /// Warns a household, optionally about one Moment or Comment of theirs.
    /// Each warning is its own history entry; the count is derived from them.
    /// </summary>
    public async Task<AdminCommunityActionResultResponse> IssueWarningAsync(
        Guid? currentUserId,
        Guid ownerId,
        AdminCommunityWarningRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var reason = CommunityModerationReasons.Parse(request?.Reason);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        RequireNotOwnHousehold(moderatorId, ownerId);
        await RequireOwnerAsync(ownerId, cancellationToken);

        if (request?.MomentId is not null && request.CommentId is not null)
        {
            throw ValidationFailed("relatedContent", "Link the warning to one Moment or one comment, not both.");
        }

        // Only the household's own content: a warning can never be pinned to
        // somebody else's Moment or Comment.
        if (request?.MomentId is { } momentId
            && !await _dbContext.PetMemories.AnyAsync(
                item => item.Id == momentId && item.AuthorUserId == ownerId,
                cancellationToken))
        {
            throw NotTheirs();
        }

        if (request?.CommentId is { } commentId
            && !await _dbContext.MomentComments.AnyAsync(
                item => item.Id == commentId && item.AuthorUserId == ownerId,
                cancellationToken))
        {
            throw NotTheirs();
        }

        return await RunAsync([CommunityModerationTransaction.HouseholdLock(ownerId)], async () =>
        {
            var action = CommunityModerationHistory.Record(
                _dbContext,
                ownerId,
                CommunityModerationActionType.WarningIssued,
                reason,
                remark,
                moderatorId,
                _timeProvider.GetUtcNow(),
                momentId: request?.MomentId,
                commentId: request?.CommentId);
            await _notifications.StageModerationNotice(action, cancellationToken);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.WarningIssued,
                CommunityModerationAudit.UserEntity,
                ownerId,
                null,
                new
                {
                    reason = reason.ToString(),
                    remark,
                    momentId = request?.MomentId,
                    commentId = request?.CommentId,
                    moderationActionId = action.Id
                });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    /// <summary>
    /// Restricts a household's Community access for 24 hours, 7 days, 30 days
    /// or with no end date. A restriction already in place is given this new
    /// end instead. A timed restriction ends on its own
    /// (<see cref="CommunityRestrictionExpiryService"/>).
    /// </summary>
    public async Task<AdminCommunityActionResultResponse> RestrictAsync(
        Guid? currentUserId,
        Guid ownerId,
        AdminCommunityRestrictRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var reason = CommunityModerationReasons.Parse(request?.Reason);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        // Validated now, measured from the moment the change is made.
        CommunityRestrictionDurations.EndFrom(request?.Duration, _timeProvider.GetUtcNow());
        RequireNotOwnHousehold(moderatorId, ownerId);

        return await RunAsync([CommunityModerationTransaction.HouseholdLock(ownerId)], async () =>
        {
            var profile = await RequireProfileAsync(ownerId, cancellationToken);
            var now = _timeProvider.GetUtcNow();
            var until = CommunityRestrictionDurations.EndFrom(request?.Duration, now);
            var wasRestricted = CommunityModeration.IsRestricted(profile);
            var previous = new
            {
                restricted = wasRestricted,
                restrictedAt = profile.CommunityRestrictedAt,
                restrictedUntil = profile.CommunityRestrictedUntil,
                communityEnabled = profile.IsSocialEnabled
            };

            if (wasRestricted)
            {
                CommunityModeration.ChangeRestrictionEnd(profile, moderatorId, until);
            }
            else
            {
                CommunityModeration.RestrictHousehold(profile, moderatorId, now, until);
            }

            var action = CommunityModerationHistory.Record(
                _dbContext,
                ownerId,
                CommunityModerationActionType.CommunityRestricted,
                reason,
                remark,
                moderatorId,
                now,
                restrictedUntil: until);
            await _notifications.StageModerationNotice(action, cancellationToken);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.HouseholdRestricted,
                CommunityModerationAudit.HouseholdEntity,
                profile.Id,
                previous,
                new
                {
                    restricted = true,
                    restrictedAt = profile.CommunityRestrictedAt,
                    restrictedUntil = until,
                    communityEnabled = profile.IsSocialEnabled,
                    ownerChoiceKept = profile.CommunityEnabledBeforeRestriction,
                    ownerId,
                    reason = reason.ToString(),
                    remark,
                    moderationActionId = action.Id
                });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    /// <summary>Ends a restriction now and restores the owner's own Community choice.</summary>
    public async Task<AdminCommunityActionResultResponse> LiftRestrictionAsync(
        Guid? currentUserId,
        Guid ownerId,
        AdminCommunityReversalRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        RequireNotOwnHousehold(moderatorId, ownerId);

        return await RunAsync([CommunityModerationTransaction.HouseholdLock(ownerId)], async () =>
        {
            var profile = await RequireProfileAsync(ownerId, cancellationToken);
            if (!CommunityModeration.IsRestricted(profile))
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "household_not_restricted",
                    "This household's Community access isn't restricted.");
            }

            var previous = new
            {
                restricted = true,
                restrictedAt = profile.CommunityRestrictedAt,
                restrictedUntil = profile.CommunityRestrictedUntil,
                restrictedByUserId = profile.CommunityRestrictedByUserId,
                ownerChoice = profile.CommunityEnabledBeforeRestriction
            };
            CommunityModeration.LiftRestriction(profile);
            var action = CommunityModerationHistory.Record(
                _dbContext,
                ownerId,
                CommunityModerationActionType.CommunityRestrictionLifted,
                reason: null,
                remark,
                moderatorId,
                _timeProvider.GetUtcNow());
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.HouseholdRestrictionLifted,
                CommunityModerationAudit.HouseholdEntity,
                profile.Id,
                previous,
                new
                {
                    restricted = false,
                    communityEnabled = profile.IsSocialEnabled,
                    ownerId,
                    remark,
                    moderationActionId = action.Id
                });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    // ---- Account suspension ---------------------------------------------------------

    /// <summary>
    /// Suspends the whole account: sign-in and token refresh stop at once, and
    /// every refresh token is revoked, so the session ends when its current
    /// access token expires. For fraud, scams, security abuse or repeated
    /// severe violations only — a Community violation is a Community
    /// restriction. Finders can still reach the household's pets' Safety
    /// Profiles and Smart Tags: a lost pet's safety never depends on this.
    /// Admin Portal accounts are managed from Access, never here.
    /// </summary>
    public async Task<AdminCommunityActionResultResponse> SuspendAccountAsync(
        Guid? currentUserId,
        Guid ownerId,
        AdminAccountSuspensionRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var reason = CommunityModerationReasons.Parse(request?.Reason);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        RequireNotOwnHousehold(moderatorId, ownerId);

        return await RunAsync([CommunityModerationTransaction.HouseholdLock(ownerId)], async () =>
        {
            var user = await RequireAccountAsync(ownerId, cancellationToken);
            if (user.Status == UserStatus.Suspended)
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "account_already_suspended",
                    "This account is already suspended.");
            }

            if (user.Status != UserStatus.Active)
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "account_not_active",
                    "Only an active account can be suspended.");
            }

            var now = _timeProvider.GetUtcNow();
            user.Status = UserStatus.Suspended;
            user.UpdatedAt = now;
            var revoked = await _dbContext.RefreshTokens
                .Where(token => token.UserId == ownerId && token.RevokedAt == null && token.ExpiresAt > now)
                .ToListAsync(cancellationToken);
            foreach (var token in revoked)
            {
                token.RevokedAt = now;
            }

            var action = CommunityModerationHistory.Record(
                _dbContext,
                ownerId,
                CommunityModerationActionType.AccountSuspended,
                reason,
                remark,
                moderatorId,
                now);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.AccountSuspended,
                CommunityModerationAudit.UserEntity,
                ownerId,
                new { status = nameof(UserStatus.Active) },
                new
                {
                    status = nameof(UserStatus.Suspended),
                    refreshTokensRevoked = revoked.Count,
                    reason = reason.ToString(),
                    remark,
                    moderationActionId = action.Id
                });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    /// <summary>Lets a suspended account sign in again. Nothing else about it changes.</summary>
    public async Task<AdminCommunityActionResultResponse> ReinstateAccountAsync(
        Guid? currentUserId,
        Guid ownerId,
        AdminCommunityReversalRequest? request,
        CancellationToken cancellationToken = default)
    {
        var moderatorId = RequireModerator(currentUserId);
        var remark = CommunityModerationRemarkRules.Normalize(request?.Remark);
        RequireNotOwnHousehold(moderatorId, ownerId);

        return await RunAsync([CommunityModerationTransaction.HouseholdLock(ownerId)], async () =>
        {
            var user = await RequireAccountAsync(ownerId, cancellationToken);
            if (user.Status != UserStatus.Suspended)
            {
                throw new ApiException(
                    StatusCodes.Status409Conflict,
                    "account_not_suspended",
                    "This account isn't suspended.");
            }

            var now = _timeProvider.GetUtcNow();
            user.Status = UserStatus.Active;
            user.UpdatedAt = now;
            var action = CommunityModerationHistory.Record(
                _dbContext,
                ownerId,
                CommunityModerationActionType.AccountReinstated,
                reason: null,
                remark,
                moderatorId,
                now);
            _auditLogService.Append(
                moderatorId,
                ActorType.Admin,
                CommunityModerationAudit.AccountReinstated,
                CommunityModerationAudit.UserEntity,
                ownerId,
                new { status = nameof(UserStatus.Suspended) },
                new { status = nameof(UserStatus.Active), remark, moderationActionId = action.Id });

            await _dbContext.SaveChangesAsync(cancellationToken);
            return Result(action);
        }, cancellationToken);
    }

    // ---- helpers --------------------------------------------------------------------

    private Task<T> RunAsync<T>(
        IReadOnlyList<string> locks,
        Func<Task<T>> work,
        CancellationToken cancellationToken) =>
        CommunityModerationTransaction.RunAsync(_dbContext, locks, work, ConflictMessage, cancellationToken);

    private Task<T> RunAsync<T>(
        IReadOnlyList<string> locks,
        Func<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction?, Task<T>> work,
        CancellationToken cancellationToken) =>
        CommunityModerationTransaction.RunAsync(_dbContext, locks, work, ConflictMessage, cancellationToken);

    /// <summary>
    /// The author of a Moment that was shared — public now, or hidden by
    /// MyPetLink. A private or deleted Moment is not Community content and
    /// reads as not found.
    /// </summary>
    private async Task<Guid> RequireCommunityMomentAuthorAsync(Guid momentId, CancellationToken cancellationToken)
    {
        return await _dbContext.PetMemories
                .AsNoTracking()
                .Where(item => item.Id == momentId
                    && item.DeletedAt == null
                    && (item.Visibility == MemoryVisibility.Public || item.ModeratedAt != null))
                .Select(item => (Guid?)item.AuthorUserId)
                .SingleOrDefaultAsync(cancellationToken)
            ?? throw ContentNotFound();
    }

    private async Task RequireOwnerAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        if (!await _dbContext.Users.AnyAsync(user => user.Id == ownerId && user.DeletedAt == null, cancellationToken))
        {
            throw OwnerNotFound();
        }
    }

    private async Task<OwnerSocialProfile> RequireProfileAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        await RequireOwnerAsync(ownerId, cancellationToken);
        return await _dbContext.OwnerSocialProfiles
                .SingleOrDefaultAsync(profile => profile.UserId == ownerId, cancellationToken)
            ?? throw new ApiException(
                StatusCodes.Status409Conflict,
                "household_unavailable",
                "This household hasn't set up a Community Profile.");
    }

    private async Task<User> RequireAccountAsync(Guid ownerId, CancellationToken cancellationToken)
    {
        var user = await _dbContext.Users
                .Include(item => item.AdminUser)
                .SingleOrDefaultAsync(item => item.Id == ownerId && item.DeletedAt == null, cancellationToken)
            ?? throw OwnerNotFound();

        if (user.AdminUser is { IsActive: true, DisabledAt: null })
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "account_is_admin",
                "Admin Portal accounts are managed from Access, not suspended here.");
        }

        return user;
    }

    private static AdminCommunityActionResultResponse Result(CommunityModerationAction action) =>
        new(action.Id, action.ActionType.ToString(), action.RestrictedUntil);

    private static Guid RequireModerator(Guid? currentUserId) =>
        currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

    private static void RequireNotOwnHousehold(Guid moderatorId, Guid ownerId)
    {
        if (moderatorId == ownerId)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "moderation_conflict_of_interest",
                "Another moderator needs to act on this because it involves your own household.");
        }
    }

    internal static ApiException ContentNotFound() => new(
        StatusCodes.Status404NotFound,
        "community_content_not_found",
        "This Community content could not be found.");

    internal static ApiException OwnerNotFound() => new(
        StatusCodes.Status404NotFound,
        "owner_not_found",
        "This owner could not be found.");

    private static ApiException NotTheirs() => new(
        StatusCodes.Status422UnprocessableEntity,
        "warning_content_not_theirs",
        "A warning can only be linked to this household's own Moment or comment.");

    private static ApiException ValidationFailed(string field, string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { [field] = [message] });
}
