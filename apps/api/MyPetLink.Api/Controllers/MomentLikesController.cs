using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// Liking a Moment.
///
/// The route names the Moment; the person doing the liking is the JWT subject
/// and cannot be named by the caller. Both verbs answer with the Moment's like
/// state as it now stands, so a control settles on the server's answer rather
/// than on its own optimistic guess.
/// </summary>
[Authorize]
[Route("api/v1/social/moments/{momentId:guid}")]
public sealed class MomentLikesController : ApiControllerBase
{
    private readonly IMomentLikeService _likes;
    private readonly ICurrentUserService _currentUserService;

    public MomentLikesController(
        IMomentLikeService likes,
        ICurrentUserService currentUserService)
    {
        _likes = likes;
        _currentUserService = currentUserService;
    }

    [HttpPost("like")]
    [EnableRateLimiting(SocialRateLimitPolicies.Like)]
    public async Task<IActionResult> Like(Guid momentId, CancellationToken cancellationToken)
    {
        var response = await _likes.LikeAsync(
            _currentUserService.Current.UserId,
            momentId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpDelete("like")]
    [EnableRateLimiting(SocialRateLimitPolicies.Withdraw)]
    public async Task<IActionResult> Unlike(Guid momentId, CancellationToken cancellationToken)
    {
        var response = await _likes.UnlikeAsync(
            _currentUserService.Current.UserId,
            momentId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
