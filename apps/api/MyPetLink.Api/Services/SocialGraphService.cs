using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

/// <summary>
/// Following and blocking, between accounts.
///
/// The graph is owner-to-owner. A pet is the subject of the content and the
/// identity on a Smart Tag; the household is who you subscribe to. That also
/// means one Moment is one row in any later feed however many pets it features.
///
/// <b>The actor is always the JWT subject.</b> No method takes an actor id from
/// a caller: a handle in a path names a target, never a grant.
///
/// <b>Social blocking is not safety blocking.</b> Nothing in this class touches
/// <c>QrSafetyService</c>, <c>TagScanService</c>, or any finder route. Somebody
/// who has blocked you socially must still reach your Safety Profile when they
/// find your lost pet — that is the entire product, and it cannot be
/// collateral damage from a social argument.
/// </summary>
public sealed class SocialGraphService : SkeletonService, ISocialGraphService
{
    private const string FollowUniqueIndexName = "IX_OwnerFollows_FollowerUserId_FollowedUserId";
    private const string BlockUniqueIndexName = "IX_OwnerBlocks_BlockerUserId_BlockedUserId";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;
    private readonly IOwnerNotificationService _notifications;

    public SocialGraphService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options,
        IOwnerNotificationService notifications)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
        _notifications = notifications;
    }

    public async Task<OwnerRelationshipResponse> FollowAsync(
        Guid? currentUserId,
        string handle,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var target = await LoadFollowTargetAsync(handle, cancellationToken);

        if (target.UserId == actorId)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "cannot_follow_self",
                "You can't follow your own profile.");
        }

        if (!target.AllowFollowers)
        {
            throw new ApiException(
                StatusCodes.Status403Forbidden,
                "followers_not_allowed",
                "This profile isn't accepting new followers.");
        }

        if (await IsBlockedEitherWayAsync(actorId, target.UserId, cancellationToken))
        {
            // Deliberately the same answer the blocked party would get for an
            // unavailable profile. Telling someone they have been blocked is
            // itself a message, and not one the blocker chose to send.
            throw ProfileUnavailable();
        }

        var alreadyFollowing = await _dbContext.OwnerFollows.AnyAsync(
            follow => follow.FollowerUserId == actorId && follow.FollowedUserId == target.UserId,
            cancellationToken);

        if (!alreadyFollowing)
        {
            _dbContext.OwnerFollows.Add(new OwnerFollow
            {
                FollowerUserId = actorId,
                FollowedUserId = target.UserId
            });

            // Staged onto the same unit of work: the follow and "X started
            // following you" commit together, so a failed follow cannot leave
            // activity behind describing something that did not happen.
            await _notifications.StageFollowNotification(
                actorId, target.UserId, cancellationToken);

            try
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException exception)
                when (UniqueConstraintViolation.IsFor(exception, FollowUniqueIndexName))
            {
                // Two concurrent follows. The index decided; both callers are
                // now following, which is what each of them asked for.
                _dbContext.ChangeTracker.Clear();
            }
        }

        return await GetRelationshipAsync(actorId, handle, cancellationToken);
    }

    public async Task<OwnerRelationshipResponse> UnfollowAsync(
        Guid? currentUserId,
        string handle,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var targetId = await ResolveUserIdAsync(handle, cancellationToken);

        var existing = await _dbContext.OwnerFollows.SingleOrDefaultAsync(
            follow => follow.FollowerUserId == actorId && follow.FollowedUserId == targetId,
            cancellationToken);

        // Idempotent: unfollowing something you do not follow is a no-op, not an
        // error. A double tap must not produce a failure.
        if (existing is not null)
        {
            _dbContext.OwnerFollows.Remove(existing);

            // An activity list that still says somebody started following you,
            // when they no longer do, is simply wrong.
            await _notifications.StageFollowNotificationWithdrawal(
                actorId, targetId, cancellationToken);

            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return await GetRelationshipAsync(actorId, handle, cancellationToken);
    }

    /// <summary>
    /// Blocks another account.
    ///
    /// Removes any follow in BOTH directions in the same transaction as the
    /// block row: leaving one behind would let the blocked account keep seeing
    /// content in a later feed, which is precisely what blocking is for.
    /// </summary>
    public async Task<OwnerRelationshipResponse> BlockAsync(
        Guid? currentUserId,
        string handle,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var targetId = await ResolveUserIdAsync(handle, cancellationToken);

        if (targetId == actorId)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "cannot_block_self",
                "You can't block your own profile.");
        }

        var alreadyBlocked = await _dbContext.OwnerBlocks.AnyAsync(
            block => block.BlockerUserId == actorId && block.BlockedUserId == targetId,
            cancellationToken);

        if (!alreadyBlocked)
        {
            _dbContext.OwnerBlocks.Add(new OwnerBlock
            {
                BlockerUserId = actorId,
                BlockedUserId = targetId,
                Reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim()
            });
        }

        var follows = await _dbContext.OwnerFollows
            .Where(follow =>
                (follow.FollowerUserId == actorId && follow.FollowedUserId == targetId)
                || (follow.FollowerUserId == targetId && follow.FollowedUserId == actorId))
            .ToListAsync(cancellationToken);

        _dbContext.OwnerFollows.RemoveRange(follows);

        try
        {
            // One SaveChanges: the block and the removals land together or not
            // at all.
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception)
            when (UniqueConstraintViolation.IsFor(exception, BlockUniqueIndexName))
        {
            _dbContext.ChangeTracker.Clear();
        }

        return await GetRelationshipAsync(actorId, handle, cancellationToken);
    }

    public async Task<OwnerRelationshipResponse> UnblockAsync(
        Guid? currentUserId,
        string handle,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var targetId = await ResolveUserIdAsync(handle, cancellationToken);

        var existing = await _dbContext.OwnerBlocks.SingleOrDefaultAsync(
            block => block.BlockerUserId == actorId && block.BlockedUserId == targetId,
            cancellationToken);

        if (existing is not null)
        {
            _dbContext.OwnerBlocks.Remove(existing);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        // Unblocking does not restore the follows it removed. Re-following is an
        // act each side should take deliberately.
        return await GetRelationshipAsync(actorId, handle, cancellationToken);
    }

    /// <summary>
    /// The viewer's relationship with a profile, plus its counts.
    ///
    /// <b>Counts are computed, not stored.</b> A denormalised counter is only
    /// correct if something maintains it in the same transaction as the row it
    /// counts, and at soft-launch scale an indexed COUNT over
    /// <c>IX_OwnerFollows_FollowedUserId_CreatedAt</c> is a seek over a few
    /// hundred rows. Correctness with no drift beats a cached number that can be
    /// wrong. Revisit if a single account passes roughly 10,000 followers or the
    /// profile query shows the count as a measurable cost.
    /// </summary>
    public async Task<OwnerRelationshipResponse> GetRelationshipAsync(
        Guid? currentUserId,
        string handle,
        CancellationToken cancellationToken = default)
    {
        var targetId = await ResolveUserIdAsync(handle, cancellationToken);
        var viewerId = currentUserId;

        var followerCount = await _dbContext.OwnerFollows
            .CountAsync(follow => follow.FollowedUserId == targetId, cancellationToken);
        var followingCount = await _dbContext.OwnerFollows
            .CountAsync(follow => follow.FollowerUserId == targetId, cancellationToken);
        var allowsFollowers = await _dbContext.OwnerSocialProfiles.AnyAsync(
            profile => profile.UserId == targetId && profile.AllowFollowers,
            cancellationToken);

        if (!viewerId.HasValue)
        {
            // A visitor with no session may not follow anything — but the page
            // still needs to know whether following is on offer here, so it can
            // show the way in rather than nothing at all.
            return new OwnerRelationshipResponse(
                IsSelf: false,
                IsFollowing: false,
                IsFollowedBy: false,
                HasBlocked: false,
                CanFollow: false,
                allowsFollowers,
                followerCount,
                followingCount);
        }

        var isSelf = viewerId.Value == targetId;
        var isFollowing = !isSelf && await _dbContext.OwnerFollows.AnyAsync(
            follow => follow.FollowerUserId == viewerId.Value && follow.FollowedUserId == targetId,
            cancellationToken);
        var isFollowedBy = !isSelf && await _dbContext.OwnerFollows.AnyAsync(
            follow => follow.FollowerUserId == targetId && follow.FollowedUserId == viewerId.Value,
            cancellationToken);
        var hasBlocked = !isSelf && await _dbContext.OwnerBlocks.AnyAsync(
            block => block.BlockerUserId == viewerId.Value && block.BlockedUserId == targetId,
            cancellationToken);
        var blockedEitherWay = !isSelf
            && await IsBlockedEitherWayAsync(viewerId.Value, targetId, cancellationToken);

        return new OwnerRelationshipResponse(
            isSelf,
            isFollowing,
            isFollowedBy,
            hasBlocked,
            CanFollow: !isSelf && !blockedEitherWay && allowsFollowers,
            // Not narrowed by a block: this says what the profile offers, and a
            // blocked viewer already learns nothing from it that the profile
            // page does not show them anyway.
            allowsFollowers,
            followerCount,
            followingCount);
    }

    public Task<SocialAccountPageResponse> GetFollowersAsync(
        Guid? currentUserId,
        string handle,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        return ListAccountsAsync(currentUserId, handle, cursor, pageSize, followers: true, cancellationToken);
    }

    public Task<SocialAccountPageResponse> GetFollowingAsync(
        Guid? currentUserId,
        string handle,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        return ListAccountsAsync(currentUserId, handle, cursor, pageSize, followers: false, cancellationToken);
    }

    private async Task<SocialAccountPageResponse> ListAccountsAsync(
        Guid? currentUserId,
        string handle,
        string? cursor,
        int? pageSize,
        bool followers,
        CancellationToken cancellationToken)
    {
        var targetId = await ResolveUserIdAsync(handle, cancellationToken);
        var viewerId = currentUserId;
        var take = SocialCursor.ClampPageSize(pageSize);
        var position = SocialCursor.TryDecode(cursor);

        var query = _dbContext.OwnerFollows
            .AsNoTracking()
            .Where(follow => followers
                ? follow.FollowedUserId == targetId
                : follow.FollowerUserId == targetId);

        if (position is not null)
        {
            query = query.Where(follow =>
                follow.CreatedAt < position.PublishedAt
                || (follow.CreatedAt == position.PublishedAt
                    && follow.Id.CompareTo(position.Id) < 0));
        }

        // The other end of each edge, and only if it is itself a live social
        // profile. A deleted or switched-off account must not be listed.
        var rows = await query
            .OrderByDescending(follow => follow.CreatedAt)
            .ThenByDescending(follow => follow.Id)
            .Select(follow => new
            {
                follow.Id,
                follow.CreatedAt,
                Account = followers ? follow.FollowerUser : follow.FollowedUser
            })
            .Where(row =>
                row.Account.DeletedAt == null
                && row.Account.SocialProfile != null
                && row.Account.SocialProfile.IsSocialEnabled
                && row.Account.SocialProfile.Handle != null
                && row.Account.SocialProfile.DisplayName != null
                // Both directions of a block: neither party appears in the
                // other's lists, from either side.
                && (viewerId == null
                    || !SocialBlocks
                        .BlockedAccountIds(_dbContext, viewerId.Value)
                        .Contains(row.Account.Id)))
            .Take(take + 1)
            .Select(row => new
            {
                row.Id,
                row.CreatedAt,
                AccountId = row.Account.Id,
                Handle = row.Account.SocialProfile!.Handle!,
                DisplayName = row.Account.SocialProfile.DisplayName!,
                Avatar = row.Account.SocialProfile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        var hasMore = rows.Count > take;
        var page = hasMore ? rows.Take(take).ToList() : rows;

        var followedByViewer = viewerId.HasValue && page.Count > 0
            ? (await _dbContext.OwnerFollows
                .AsNoTracking()
                .Where(follow =>
                    follow.FollowerUserId == viewerId.Value
                    && page.Select(row => row.AccountId).Contains(follow.FollowedUserId))
                .Select(follow => follow.FollowedUserId)
                .ToListAsync(cancellationToken))
                .ToHashSet()
            : new HashSet<Guid>();

        var last = page.Count > 0 ? page[^1] : null;

        return new SocialAccountPageResponse(
            page
                .Select(row => new SocialAccountSummaryResponse(
                    row.Handle,
                    row.DisplayName,
                    MediaDerivatives.ResolveThumbnailUrl(row.Avatar, _r2Options.PublicBaseUrl),
                    followedByViewer.Contains(row.AccountId),
                    viewerId.HasValue && viewerId.Value == row.AccountId))
                .ToArray(),
            hasMore && last is not null
                ? new SocialCursor(last.CreatedAt, last.Id).Encode()
                : null);
    }

    /// <summary>
    /// The accounts this caller has blocked.
    ///
    /// The only list in the product that a block puts somebody ON rather than
    /// takes them off. It exists so a block stays reversible: without it the
    /// single route back to Unblock is a remembered handle, and search
    /// deliberately hides blocked accounts from the person who blocked them.
    ///
    /// Readable only by the blocker, about their own blocks. Nobody can ask who
    /// has blocked them — that question is the one a block exists not to answer.
    /// </summary>
    public async Task<SocialAccountPageResponse> GetBlockedAccountsAsync(
        Guid? currentUserId,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        var take = SocialCursor.ClampPageSize(pageSize);
        var position = SocialCursor.TryDecode(cursor);

        var query = _dbContext.OwnerBlocks
            .AsNoTracking()
            .Where(block => block.BlockerUserId == actorId);

        if (position is not null)
        {
            query = query.Where(block =>
                block.CreatedAt < position.PublishedAt
                || (block.CreatedAt == position.PublishedAt
                    && block.Id.CompareTo(position.Id) < 0));
        }

        var rows = await query
            .OrderByDescending(block => block.CreatedAt)
            .ThenByDescending(block => block.Id)
            // Deliberately NOT filtered on the blocked account still being
            // social. Somebody who switched social off while blocked must still
            // be reachable here, or the block becomes permanent by accident.
            .Where(block => block.BlockedUser.DeletedAt == null)
            .Take(take + 1)
            .Select(block => new
            {
                block.Id,
                block.CreatedAt,
                AccountId = block.BlockedUserId,
                Handle = block.BlockedUser.SocialProfile!.Handle,
                DisplayName = block.BlockedUser.SocialProfile.DisplayName,
                Avatar = block.BlockedUser.SocialProfile.AvatarMediaFile
            })
            .ToListAsync(cancellationToken);

        var hasMore = rows.Count > take;
        var page = hasMore ? rows.Take(take).ToList() : rows;
        var last = page.Count > 0 ? page[^1] : null;

        return new SocialAccountPageResponse(
            page
                .Select(row => new SocialAccountSummaryResponse(
                    row.Handle ?? "",
                    // An account with no social identity left still has to be
                    // nameable here, or its row becomes an unlabelled button.
                    row.DisplayName ?? "This account",
                    MediaDerivatives.ResolveThumbnailUrl(row.Avatar, _r2Options.PublicBaseUrl),
                    IsFollowing: false,
                    IsSelf: false))
                .ToArray(),
            hasMore && last is not null
                ? new SocialCursor(last.CreatedAt, last.Id).Encode()
                : null);
    }

    /// <summary>
    /// True when either account blocks the other. Blocking is stored
    /// one-directional and enforced symmetrically.
    /// </summary>
    private Task<bool> IsBlockedEitherWayAsync(
        Guid first,
        Guid second,
        CancellationToken cancellationToken)
    {
        return SocialBlocks
            .BlockedAccountIds(_dbContext, first)
            .AnyAsync(blocked => blocked == second, cancellationToken);
    }

    private async Task<FollowTarget> LoadFollowTargetAsync(
        string handle,
        CancellationToken cancellationToken)
    {
        var normalized = OwnerHandleRules.Normalize(handle) ?? throw ProfileUnavailable();

        var target = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                profile.NormalizedHandle == normalized
                && profile.IsSocialEnabled
                && profile.Handle != null
                && profile.DisplayName != null
                && profile.User.DeletedAt == null
                && profile.User.Status == UserStatus.Active)
            .Select(profile => new FollowTarget(profile.UserId, profile.AllowFollowers))
            .SingleOrDefaultAsync(cancellationToken);

        return target ?? throw ProfileUnavailable();
    }

    private async Task<Guid> ResolveUserIdAsync(string handle, CancellationToken cancellationToken)
    {
        var normalized = OwnerHandleRules.Normalize(handle) ?? throw ProfileUnavailable();

        var userId = await _dbContext.OwnerSocialProfiles
            .AsNoTracking()
            .Where(profile =>
                profile.NormalizedHandle == normalized
                && profile.IsSocialEnabled
                && profile.User.DeletedAt == null)
            .Select(profile => (Guid?)profile.UserId)
            .SingleOrDefaultAsync(cancellationToken);

        return userId ?? throw ProfileUnavailable();
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }

    /// <summary>
    /// One message for "not there" and for "blocked". A blocked account must not
    /// be able to tell the difference: the distinction would itself be a
    /// notification the blocker never chose to send.
    /// </summary>
    private static ApiException ProfileUnavailable()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "social_profile_not_found",
            "This profile is not available.");
    }

    private sealed record FollowTarget(Guid UserId, bool AllowFollowers);
}
