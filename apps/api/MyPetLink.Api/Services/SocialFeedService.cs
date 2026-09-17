using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;

namespace MyPetLink.Api.Services;

/// <summary>
/// The home feed.
///
/// It answers one question — <i>what have the pet families I follow shared
/// recently?</i> — and it answers it chronologically. There is no ranking, no
/// engagement weighting and no model deciding what somebody sees; a Moment is
/// in the feed because of a relationship the reader chose, and it is where it
/// is because of when it was published. That is the whole contract, and it is
/// the reason a reader can always tell why something is in front of them.
///
/// Your own public Moments are included. Following yourself would be a strange
/// thing to ask of somebody, and a feed that omits what you just shared reads
/// as broken — you go looking for your own Moment and it is not there.
///
/// <b>Discoverability does not gate this.</b> A household that has switched
/// discovery off has said "do not put me in Explore or search results"; it has
/// not said "hide my Moments from the people who already follow me". Those are
/// different decisions and this feed respects the first without inventing the
/// second.
/// </summary>
public sealed class SocialFeedService : SkeletonService, ISocialFeedService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly SocialMomentProjection _momentCards;

    public SocialFeedService(
        MyPetLinkDbContext dbContext,
        SocialMomentProjection momentCards)
    {
        _dbContext = dbContext;
        _momentCards = momentCards;
    }

    public async Task<SocialFeedPageResponse> GetFeedAsync(
        Guid? currentUserId,
        string? cursor,
        int? pageSize,
        CancellationToken cancellationToken = default)
    {
        var actorId = currentUserId ?? throw new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");

        // One query, resolved by the database. Deliberately NOT "load my
        // follows, materialise the ids, then fetch Moments for them": that
        // turns a seek into a round trip whose size grows with the follow list,
        // and it filters in memory what SQL Server can filter on an index.
        var blocked = SocialBlocks.BlockedAccountIds(_dbContext, actorId);

        var query = _dbContext.PetMemories
            .SociallyVisible()
            .Where(moment =>
                moment.AuthorUserId == actorId
                || _dbContext.OwnerFollows.Any(follow =>
                    follow.FollowerUserId == actorId
                    && follow.FollowedUserId == moment.AuthorUserId))
            // Blocking removes follows in both directions when it happens, so
            // this is belt as well as braces — but a feed is exactly the wrong
            // place to rely on a cleanup having run.
            .Where(moment => !blocked.Contains(moment.AuthorUserId));

        var page = await _momentCards.PageAsync(
            query,
            cursor,
            pageSize,
            actorId,
            cancellationToken,
            SocialCursor.FeedPageSize);

        // Asked separately from the page, and deliberately as an existence
        // check rather than a count: an empty feed means one of two unrelated
        // things — nobody followed yet, or nobody followed has posted lately —
        // and telling a person who follows a dozen families to go and follow
        // somebody is the worse of the two mistakes. Any() against the follow
        // index is a seek; it does not grow with the follow list, and it does
        // not touch the Moment query above.
        var hasFollowing = await _dbContext.OwnerFollows
            .AsNoTracking()
            .AnyAsync(follow => follow.FollowerUserId == actorId, cancellationToken);

        return new SocialFeedPageResponse(page.Items, page.NextCursor, hasFollowing);
    }
}
