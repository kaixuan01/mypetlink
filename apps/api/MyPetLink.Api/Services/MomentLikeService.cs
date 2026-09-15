using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Likes on Moments.
///
/// A like is performed by the authenticated account and recorded against the
/// Moment. It is not recorded against a pet: pets are the subject of content,
/// not actors in the graph, and a like is a person's gesture.
///
/// The database decides, not this class. The unique index on
/// <c>(MomentId, UserId)</c> is the sole authority on "already liked", so a
/// double tap, a retry, and two devices at once all converge on one row.
/// Unliking something that was never liked is a no-op rather than an error, for
/// the same reason: the caller asked for a state, and that state is the result.
///
/// Counts are computed with an indexed COUNT rather than stored on the Moment.
/// There is no counter column to drift out of step with the rows, and the unique
/// index makes the count a seek. Revisit if a single Moment passes roughly
/// 10,000 likes, or if a listing shows the count as a measurable cost.
/// </summary>
public sealed class MomentLikeService : SkeletonService, IMomentLikeService
{
    private const string LikeUniqueIndexName = "IX_MomentLikes_MomentId_UserId";

    private readonly MyPetLinkDbContext _dbContext;

    public MomentLikeService(MyPetLinkDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<MomentLikeResponse> LikeAsync(
        Guid? currentUserId,
        Guid momentId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);
        await RequireLikeableMomentAsync(actorId, momentId, cancellationToken);

        var alreadyLiked = await _dbContext.MomentLikes.AnyAsync(
            like => like.MomentId == momentId && like.UserId == actorId,
            cancellationToken);

        if (!alreadyLiked)
        {
            _dbContext.MomentLikes.Add(new MomentLike
            {
                MomentId = momentId,
                UserId = actorId
            });

            try
            {
                await _dbContext.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException exception)
                when (UniqueConstraintViolation.IsFor(exception, LikeUniqueIndexName))
            {
                // Two taps arriving together. The index decided; the caller's
                // Moment is liked, which is what they asked for.
                _dbContext.ChangeTracker.Clear();
            }
        }

        return await GetAsync(actorId, momentId, cancellationToken);
    }

    public async Task<MomentLikeResponse> UnlikeAsync(
        Guid? currentUserId,
        Guid momentId,
        CancellationToken cancellationToken = default)
    {
        var actorId = RequireUserId(currentUserId);

        var existing = await _dbContext.MomentLikes.SingleOrDefaultAsync(
            like => like.MomentId == momentId && like.UserId == actorId,
            cancellationToken);

        // Deliberately not gated on the Moment still being socially visible. An
        // owner who switches a Moment to private, and a viewer who is blocked
        // afterwards, must both still be able to take a like back — withdrawing
        // is never the thing to refuse.
        if (existing is not null)
        {
            _dbContext.MomentLikes.Remove(existing);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return await GetAsync(actorId, momentId, cancellationToken);
    }

    public async Task<MomentLikeResponse> GetAsync(
        Guid? currentUserId,
        Guid momentId,
        CancellationToken cancellationToken = default)
    {
        var likeCount = await _dbContext.MomentLikes
            .CountAsync(like => like.MomentId == momentId, cancellationToken);

        var viewerHasLiked = currentUserId.HasValue
            && await _dbContext.MomentLikes.AnyAsync(
                like => like.MomentId == momentId && like.UserId == currentUserId.Value,
                cancellationToken);

        return new MomentLikeResponse(momentId, likeCount, viewerHasLiked);
    }

    /// <summary>
    /// A Moment may be liked only where it may be seen.
    ///
    /// Asks <see cref="SocialVisibility"/> the same question the public listings
    /// ask, then refuses a viewer either side of a block. Both refusals give the
    /// identical answer a Moment that does not exist gives: an account that has
    /// been blocked must not be able to discover that by probing a like.
    /// </summary>
    private async Task RequireLikeableMomentAsync(
        Guid actorId,
        Guid momentId,
        CancellationToken cancellationToken)
    {
        var authorUserId = await _dbContext.PetMemories
            .SociallyVisible()
            .Where(moment => moment.Id == momentId)
            .Select(moment => (Guid?)moment.AuthorUserId)
            .SingleOrDefaultAsync(cancellationToken);

        if (!authorUserId.HasValue)
        {
            throw MomentUnavailable();
        }

        if (authorUserId.Value == actorId)
        {
            return;
        }

        var blocked = await SocialBlocks
            .BlockedAccountIds(_dbContext, actorId)
            .AnyAsync(id => id == authorUserId.Value, cancellationToken);

        if (blocked)
        {
            throw MomentUnavailable();
        }
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }

    private static ApiException MomentUnavailable()
    {
        return new ApiException(
            StatusCodes.Status404NotFound,
            "moment_not_found",
            "This Moment is not available.");
    }
}
