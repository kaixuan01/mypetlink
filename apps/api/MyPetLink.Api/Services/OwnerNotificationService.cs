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
/// In-app activity: who followed you, and who liked your Moment.
///
/// <b>In-app only.</b> No email of any kind is produced here, and none should
/// be: social email is a new consent category and an abuse amplifier — a
/// mass-follow script becomes a mass-mail script — and it is worth deciding
/// with engagement data in hand rather than in advance.
///
/// <b>Rows carry ids, never identity.</b> A notification stores who acted and
/// what they acted on; the name, handle and avatar are resolved at read time
/// from the actor's current public social profile. That is what stops an
/// account that has left social, or that has since blocked the recipient, from
/// keeping a usable identity alive inside somebody else's activity list.
///
/// <b>Writes are staged, not saved.</b> The follow and like services call
/// <see cref="StageFollowNotification"/> and friends and then save once, so the
/// interaction and its notification commit together. A failed follow cannot
/// leave phantom activity behind, because there was never a second save to
/// succeed on its own.
/// </summary>
public sealed class OwnerNotificationService : SkeletonService, IOwnerNotificationService
{
    /// <summary>
    /// Rows older than this are expected to be pruned. Nothing prunes them yet
    /// — see docs/architecture/social-foundation.md — so every read here is
    /// cursor-paged and bounded rather than relying on the table staying small.
    /// </summary>
    public const int RetentionDays = 90;

    private readonly MyPetLinkDbContext _dbContext;
    private readonly CloudflareR2Options _r2Options;

    public OwnerNotificationService(
        MyPetLinkDbContext dbContext,
        IOptions<CloudflareR2Options> r2Options)
    {
        _dbContext = dbContext;
        _r2Options = r2Options.Value;
    }

    // ---- writes, staged onto the caller's unit of work ------------------

    /// <summary>
    /// Stages "X started following you" for the account being followed.
    ///
    /// Nothing is written for following yourself, and nothing is written when
    /// an unread one from the same account is already waiting — a follow,
    /// unfollow and refollow inside an afternoon should be one line in somebody's
    /// activity, not three. A previously READ one does not suppress a new row:
    /// a real later follow deserves to be seen.
    /// </summary>
    public async Task StageFollowNotification(
        Guid actorId,
        Guid recipientId,
        CancellationToken cancellationToken = default)
    {
        if (actorId == recipientId)
        {
            return;
        }

        var alreadyWaiting = await _dbContext.OwnerNotifications.AnyAsync(
            item => item.RecipientUserId == recipientId
                && item.ActorUserId == actorId
                && item.Type == OwnerNotificationType.NewFollower
                && item.ReadAt == null,
            cancellationToken);

        if (alreadyWaiting)
        {
            return;
        }

        _dbContext.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = recipientId,
            ActorUserId = actorId,
            Type = OwnerNotificationType.NewFollower
        });
    }

    /// <summary>
    /// Stages the removal of an unread "started following you" after an
    /// unfollow.
    ///
    /// An activity list that still says somebody started following you, when
    /// they no longer do, is simply wrong. A notification the recipient has
    /// already READ is left alone: it described something that really happened
    /// at the time, and rewriting history they have seen is worse than leaving
    /// it.
    /// </summary>
    public async Task StageFollowNotificationWithdrawal(
        Guid actorId,
        Guid recipientId,
        CancellationToken cancellationToken = default)
    {
        var unread = await _dbContext.OwnerNotifications
            .Where(item => item.RecipientUserId == recipientId
                && item.ActorUserId == actorId
                && item.Type == OwnerNotificationType.NewFollower
                && item.ReadAt == null)
            .ToListAsync(cancellationToken);

        _dbContext.OwnerNotifications.RemoveRange(unread);
    }

    public async Task StageLikeNotification(
        Guid actorId,
        Guid recipientId,
        Guid momentId,
        Guid? subjectPetId,
        CancellationToken cancellationToken = default)
    {
        if (actorId == recipientId)
        {
            // Liking your own Moment is allowed — it is a harmless way to mark
            // a favourite — but it is not news to you.
            return;
        }

        var alreadyWaiting = await _dbContext.OwnerNotifications.AnyAsync(
            item => item.RecipientUserId == recipientId
                && item.ActorUserId == actorId
                && item.MomentId == momentId
                && item.Type == OwnerNotificationType.MomentLiked
                && item.ReadAt == null,
            cancellationToken);

        if (alreadyWaiting)
        {
            return;
        }

        _dbContext.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = recipientId,
            ActorUserId = actorId,
            MomentId = momentId,
            SubjectPetId = subjectPetId,
            Type = OwnerNotificationType.MomentLiked
        });
    }

    public async Task StageLikeNotificationWithdrawal(
        Guid actorId,
        Guid momentId,
        CancellationToken cancellationToken = default)
    {
        var unread = await _dbContext.OwnerNotifications
            .Where(item => item.ActorUserId == actorId
                && item.MomentId == momentId
                && item.Type == OwnerNotificationType.MomentLiked
                && item.ReadAt == null)
            .ToListAsync(cancellationToken);

        _dbContext.OwnerNotifications.RemoveRange(unread);
    }

    // ---- reads ----------------------------------------------------------

    public async Task<OwnerNotificationPageResponse> GetAsync(
        Guid? currentUserId,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        var recipientId = RequireUserId(currentUserId);
        var take = SocialCursor.ClampPageSize(pageSize);
        var position = SocialCursor.TryDecode(cursor);

        var query = VisibleNotifications(recipientId);

        if (position is not null)
        {
            query = query.Where(item =>
                item.CreatedAt < position.PublishedAt
                || (item.CreatedAt == position.PublishedAt
                    && item.Id.CompareTo(position.Id) < 0));
        }

        var rows = await query
            .OrderByDescending(item => item.CreatedAt)
            .ThenByDescending(item => item.Id)
            .Take(take + 1)
            .Select(item => new
            {
                item.Id,
                item.Type,
                item.CreatedAt,
                item.ReadAt,
                ActorUserId = item.ActorUserId!.Value,
                ActorHandle = item.ActorUser!.SocialProfile!.Handle!,
                ActorDisplayName = item.ActorUser.SocialProfile.DisplayName!,
                ActorAvatar = item.ActorUser.SocialProfile.AvatarMediaFile,
                item.MomentId,
                MomentTitle = item.Moment != null ? item.Moment.Title : null,
                PetName = item.SubjectPet != null ? item.SubjectPet.Name : null,
                PetSlug = item.SubjectPet != null ? item.SubjectPet.Slug : null
            })
            .ToListAsync(cancellationToken);

        var hasMore = rows.Count > take;
        var page = hasMore ? rows.Take(take).ToList() : rows;

        var subjectNames = await LoadMomentSubjectNamesAsync(
            page.Where(row => row.MomentId.HasValue).Select(row => row.MomentId!.Value).ToArray(),
            cancellationToken);

        var last = page.Count > 0 ? page[^1] : null;

        return new OwnerNotificationPageResponse(
            page
                .Select(row => new OwnerNotificationResponse(
                    row.Id,
                    row.Type.ToString(),
                    row.CreatedAt,
                    row.ReadAt.HasValue,
                    new PublicOwnerAttributionResponse(
                        row.ActorHandle,
                        row.ActorDisplayName,
                        MediaDerivatives.ResolveOriginalUrl(row.ActorAvatar, _r2Options.PublicBaseUrl),
                        MediaDerivatives.ResolveThumbnailUrl(row.ActorAvatar, _r2Options.PublicBaseUrl)),
                    row.PetName,
                    row.PetSlug,
                    row.MomentId,
                    row.MomentTitle,
                    row.MomentId.HasValue && subjectNames.TryGetValue(row.MomentId.Value, out var names)
                        ? names
                        : Array.Empty<string>()))
                .ToArray(),
            hasMore && last is not null
                ? new SocialCursor(last.CreatedAt, last.Id).Encode()
                : null,
            await CountUnreadAsync(recipientId, cancellationToken));
    }

    public async Task<OwnerNotificationSummaryResponse> GetUnreadSummaryAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var recipientId = RequireUserId(currentUserId);

        return new OwnerNotificationSummaryResponse(
            await CountUnreadAsync(recipientId, cancellationToken));
    }

    /// <summary>
    /// Marks activity read for the caller, and only for the caller.
    ///
    /// The recipient is the JWT subject; ids that belong to somebody else
    /// simply match nothing. There is no route by which one account can mark
    /// another's notifications read.
    /// </summary>
    public async Task<OwnerNotificationSummaryResponse> MarkReadAsync(
        Guid? currentUserId,
        MarkNotificationsReadRequest? request,
        CancellationToken cancellationToken = default)
    {
        var recipientId = RequireUserId(currentUserId);
        var ids = request?.NotificationIds;

        var query = _dbContext.OwnerNotifications
            .Where(item => item.RecipientUserId == recipientId && item.ReadAt == null);

        if (ids is { Count: > 0 })
        {
            var requested = ids.Distinct().ToArray();
            query = query.Where(item => requested.Contains(item.Id));
        }

        var unread = await query.ToListAsync(cancellationToken);
        var readAt = DateTimeOffset.UtcNow;

        foreach (var notification in unread)
        {
            notification.ReadAt = readAt;
        }

        if (unread.Count > 0)
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return new OwnerNotificationSummaryResponse(
            await CountUnreadAsync(recipientId, cancellationToken));
    }

    /// <summary>
    /// Counted through exactly the filters the list applies.
    ///
    /// A badge saying three over a list showing one is a bug the recipient
    /// notices immediately, so the cost of the join is worth paying. It rides
    /// the filtered index on (RecipientUserId, ReadAt) and, in practice, over
    /// the handful of rows a person has not read yet.
    /// </summary>
    private Task<int> CountUnreadAsync(Guid recipientId, CancellationToken cancellationToken)
    {
        return VisibleNotifications(recipientId)
            .Where(item => item.ReadAt == null)
            .CountAsync(cancellationToken);
    }

    /// <summary>
    /// The notifications this recipient may currently see.
    ///
    /// Three things remove one: an actor who has left social, an actor whose
    /// social identity is incomplete, and a block in either direction. The block
    /// case is the one that matters — activity must never become the back door
    /// that hands somebody a blocked account's handle and a link to their
    /// profile.
    /// </summary>
    private IQueryable<OwnerNotification> VisibleNotifications(Guid recipientId)
    {
        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, recipientId);

        return _dbContext.OwnerNotifications
            .AsNoTracking()
            .Where(item =>
                item.RecipientUserId == recipientId
                && item.ActorUserId != null
                && item.ActorUser!.DeletedAt == null
                && item.ActorUser.SocialProfile != null
                && item.ActorUser.SocialProfile.IsSocialEnabled
                && item.ActorUser.SocialProfile.Handle != null
                && item.ActorUser.SocialProfile.DisplayName != null
                && !blocked.Contains(item.ActorUserId.Value));
    }

    /// <summary>
    /// The pets each liked Moment is about, so the copy can say "your Moment of
    /// Mochi &amp; Coco". Batched, and gated the same way every other social
    /// projection gates a subject.
    /// </summary>
    private async Task<Dictionary<Guid, string[]>> LoadMomentSubjectNamesAsync(
        IReadOnlyCollection<Guid> momentIds,
        CancellationToken cancellationToken)
    {
        if (momentIds.Count == 0)
        {
            return new Dictionary<Guid, string[]>();
        }

        var rows = await _dbContext.MomentPets
            .AsNoTracking()
            .Where(subject => momentIds.Contains(subject.MomentId))
            .Where(subject =>
                subject.Pet.DeletedAt == null
                && subject.Pet.SocialProfile != null
                && subject.Pet.SocialProfile.IsSocialEnabled)
            .OrderBy(subject => subject.CreatedAt)
            .Select(subject => new
            {
                subject.MomentId,
                subject.Pet.Name,
                IsPrimarySubject = subject.Pet.Id == subject.Moment.PetId
            })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(row => row.MomentId)
            .ToDictionary(
                group => group.Key,
                group => group
                    .OrderByDescending(row => row.IsPrimarySubject)
                    .Select(row => row.Name)
                    .ToArray());
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }
}
