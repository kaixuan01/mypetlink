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

        // Liking does not require a Community Profile, but Activity cannot
        // safely render an actor without one. The like still succeeds; only the
        // unusable notification is withheld.
        if (!await HasUsableCommunityIdentity(actorId, cancellationToken))
        {
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

    public async Task StageCommentNotification(
        Guid actorId,
        Guid recipientId,
        Guid momentId,
        Guid subjectPetId,
        Guid commentId,
        CancellationToken cancellationToken = default)
    {
        if (actorId == recipientId)
        {
            return;
        }

        var waiting = await _dbContext.OwnerNotifications.SingleOrDefaultAsync(
            item => item.RecipientUserId == recipientId
                && item.ActorUserId == actorId
                && item.MomentId == momentId
                && item.Type == OwnerNotificationType.MomentCommented
                && item.ReadAt == null,
            cancellationToken);

        if (waiting is not null)
        {
            waiting.CommentId = commentId;
            waiting.CreatedAt = DateTimeOffset.UtcNow;
            return;
        }

        _dbContext.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = recipientId,
            ActorUserId = actorId,
            MomentId = momentId,
            CommentId = commentId,
            SubjectPetId = subjectPetId,
            Type = OwnerNotificationType.MomentCommented
        });
    }

    public async Task StageCommentNotificationWithdrawal(
        Guid actorId,
        Guid momentId,
        Guid commentId,
        CancellationToken cancellationToken = default)
    {
        var waiting = await _dbContext.OwnerNotifications
            .Where(item => item.ActorUserId == actorId
                && item.MomentId == momentId
                && item.CommentId == commentId
                && item.Type == OwnerNotificationType.MomentCommented
                && item.ReadAt == null)
            .ToListAsync(cancellationToken);

        if (waiting.Count == 0)
        {
            return;
        }

        var latest = await _dbContext.MomentComments
            .Where(comment => comment.AuthorUserId == actorId
                && comment.MomentId == momentId
                && comment.Id != commentId
                && comment.DeletedAt == null)
            .OrderByDescending(comment => comment.CreatedAt)
            .ThenByDescending(comment => comment.Id)
            .Select(comment => (Guid?)comment.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (latest.HasValue)
        {
            foreach (var notification in waiting)
            {
                notification.CommentId = latest.Value;
            }
        }
        else
        {
            _dbContext.OwnerNotifications.RemoveRange(waiting);
        }
    }

    /// <summary>
    /// Stages "X invited Mochi to collaborate on a Moment" for the invitee.
    /// Shown only while that collaboration is still Pending and unexpired.
    /// </summary>
    public Task StageCollaborationRequested(
        Guid collaborationId,
        Guid authorId,
        Guid inviteeId,
        Guid momentId,
        Guid firstRequestedPetId,
        CancellationToken cancellationToken = default)
    {
        _dbContext.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = inviteeId,
            ActorUserId = authorId,
            MomentId = momentId,
            SubjectPetId = firstRequestedPetId,
            CollaborationId = collaborationId,
            Type = OwnerNotificationType.MomentCollaborationRequested
        });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Stages "X joined your Moment" for the author. Shown only while that
    /// collaboration is still Accepted.
    /// </summary>
    public Task StageCollaborationAccepted(
        Guid collaborationId,
        Guid inviteeId,
        Guid authorId,
        Guid momentId,
        Guid firstAcceptedPetId,
        CancellationToken cancellationToken = default)
    {
        _dbContext.OwnerNotifications.Add(new OwnerNotification
        {
            RecipientUserId = authorId,
            ActorUserId = inviteeId,
            MomentId = momentId,
            SubjectPetId = firstAcceptedPetId,
            CollaborationId = collaborationId,
            Type = OwnerNotificationType.MomentCollaborationAccepted
        });
        return Task.CompletedTask;
    }

    /// <summary>
    /// Stages the removal of a collaboration's UNREAD activity of the given
    /// kinds. Read rows stay as history; read-time state filtering keeps them
    /// out of the list once the collaboration no longer says what they say.
    /// </summary>
    public async Task StageCollaborationWithdrawal(
        Guid collaborationId,
        IReadOnlyCollection<OwnerNotificationType> types,
        CancellationToken cancellationToken = default)
    {
        var unread = await _dbContext.OwnerNotifications
            .Where(item => item.CollaborationId == collaborationId
                && types.Contains(item.Type)
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
                CommentId = item.Comment != null && item.Comment.DeletedAt == null
                    ? item.CommentId
                    : null,
                MomentTitle = item.Moment != null ? item.Moment.Title : null,
                item.CollaborationId,
                PetName = item.SubjectPet != null ? item.SubjectPet.Name : null,
                PetSlug = item.SubjectPet != null ? item.SubjectPet.Slug : null
            })
            .ToListAsync(cancellationToken);

        var hasMore = rows.Count > take;
        var page = hasMore ? rows.Take(take).ToList() : rows;

        var subjectNames = await LoadMomentSubjectNamesAsync(
            page.Where(row => row.MomentId.HasValue).Select(row => row.MomentId!.Value).ToArray(),
            cancellationToken);
        var collaborationPets = await LoadCollaborationPetNamesAsync(
            page.Where(row => row.CollaborationId.HasValue)
                .Select(row => (row.CollaborationId!.Value, row.Type))
                .ToArray(),
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
                    row.CommentId,
                    row.MomentTitle,
                    row.CollaborationId.HasValue
                        && collaborationPets.TryGetValue(row.CollaborationId.Value, out var petNames)
                        ? petNames
                        : Array.Empty<string>(),
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
    /// Four things remove one: an actor who has left social, an actor whose
    /// social identity is incomplete, an actor whose account is not Active
    /// (the same rule that takes their Community Profile, Moments and Comments
    /// off Community), and a block in either direction. All four are read-time:
    /// rows are never deleted for them, so reinstatement restores the history. The block
    /// case is the one that matters — activity must never become the back door
    /// that hands somebody a blocked account's handle and a link to their
    /// profile.
    /// </summary>
    private IQueryable<OwnerNotification> VisibleNotifications(Guid recipientId)
    {
        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, recipientId);
        var now = DateTimeOffset.UtcNow;
        var visibleMoments = _dbContext.PetMemories.SociallyVisible();

        return _dbContext.OwnerNotifications
            .AsNoTracking()
            .Where(item =>
                item.RecipientUserId == recipientId
                && item.ActorUserId != null
                && item.ActorUser!.DeletedAt == null
                && item.ActorUser.Status == UserStatus.Active
                && item.ActorUser.SocialProfile != null
                && item.ActorUser.SocialProfile.IsSocialEnabled
                && item.ActorUser.SocialProfile.Handle != null
                && item.ActorUser.SocialProfile.Handle != ""
                && item.ActorUser.SocialProfile.DisplayName != null
                && item.ActorUser.SocialProfile.DisplayName != ""
                && item.Type != OwnerNotificationType.Unknown
                && (item.Type == OwnerNotificationType.NewFollower
                    || item.Type == OwnerNotificationType.MomentLiked
                    || item.Type == OwnerNotificationType.MomentCommented
                    // Collaboration activity says what its collaboration is
                    // right now, or nothing: an invitation only while it can
                    // still be answered, a join only while it still stands.
                    || (item.Type == OwnerNotificationType.MomentCollaborationRequested
                        && item.Collaboration != null
                        && item.Collaboration.Status == MomentCollaborationStatus.Pending
                        && item.Collaboration.ExpiresAt > now
                        && item.Collaboration.InviteeUserId == recipientId
                        && visibleMoments.Any(moment => moment.Id == item.Collaboration.MomentId))
                    || (item.Type == OwnerNotificationType.MomentCollaborationAccepted
                        && item.Collaboration != null
                        && item.Collaboration.Status == MomentCollaborationStatus.Accepted))
                && !blocked.Contains(item.ActorUserId.Value));
    }

    private Task<bool> HasUsableCommunityIdentity(
        Guid actorId,
        CancellationToken cancellationToken)
    {
        return _dbContext.Users.AnyAsync(user =>
            user.Id == actorId
            && user.DeletedAt == null
            && user.Status == UserStatus.Active
            && user.SocialProfile != null
            && user.SocialProfile.IsSocialEnabled
            && user.SocialProfile.Handle != null
            && user.SocialProfile.Handle != ""
            && user.SocialProfile.DisplayName != null
            && user.SocialProfile.DisplayName != "",
            cancellationToken);
    }

    /// <summary>
    /// The pets each liked Moment is about, so the copy can say "your Moment of
    /// Mochi &amp; Coco". Batched, and gated the same way every other social
    /// projection gates a subject.
    /// </summary>
    private async Task<Dictionary<Guid, string[]>> LoadCollaborationPetNamesAsync(
        IReadOnlyCollection<(Guid CollaborationId, OwnerNotificationType Type)> rows,
        CancellationToken cancellationToken)
    {
        if (rows.Count == 0)
        {
            return new Dictionary<Guid, string[]>();
        }

        var ids = rows.Select(row => row.CollaborationId).Distinct().ToArray();
        var accepted = rows
            .Where(row => row.Type == OwnerNotificationType.MomentCollaborationAccepted)
            .Select(row => row.CollaborationId)
            .ToHashSet();

        var pets = await _dbContext.MomentCollaborationPets
            .AsNoTracking()
            .Where(item => ids.Contains(item.CollaborationId))
            .OrderBy(item => item.Pet.Name)
            .Select(item => new { item.CollaborationId, item.Pet.Name, item.IsAccepted })
            .ToListAsync(cancellationToken);

        return pets
            .GroupBy(item => item.CollaborationId)
            .ToDictionary(
                group => group.Key,
                group => group
                    // A join names the pets that joined; an invitation, the
                    // pets it asked about.
                    .Where(item => !accepted.Contains(group.Key) || item.IsAccepted)
                    .Select(item => item.Name)
                    .ToArray());
    }

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
            // "Your Moment of ..." names the author's own pets.
            .Where(subject => momentIds.Contains(subject.MomentId) && subject.CollaborationId == null)
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
