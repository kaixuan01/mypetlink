using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// The signed-in owner's home feed.
///
/// Authenticated on purpose, unlike the rest of the public social read surface:
/// a feed is made entirely of relationships the caller chose, so there is
/// nothing for a visitor without a session to be shown. The subject is always
/// the JWT subject — there is no path, query or body field naming whose feed
/// to build.
/// </summary>
[Authorize]
[Route("api/v1/social/feed")]
public sealed class SocialFeedController : ApiControllerBase
{
    private readonly ISocialFeedService _feed;
    private readonly ICurrentUserService _currentUserService;

    public SocialFeedController(
        ISocialFeedService feed,
        ICurrentUserService currentUserService)
    {
        _feed = feed;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> GetFeed(
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        // A feed changes with every follow, unfollow, block and new Moment, and
        // it is specific to one person. Nothing may hold a copy of it.
        Response.Headers.CacheControl = "no-store";

        var response = await _feed.GetFeedAsync(
            _currentUserService.Current.UserId,
            cursor,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
