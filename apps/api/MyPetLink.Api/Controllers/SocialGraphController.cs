using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// Following and blocking.
///
/// The handle in every path names a TARGET. The actor is always the JWT
/// subject, and there is no route, query or body field through which a caller
/// could name anybody else as the one doing the following.
/// </summary>
[Route("api/v1/social/owners/{handle}")]
public sealed class SocialGraphController : ApiControllerBase
{
    private readonly ISocialGraphService _socialGraph;
    private readonly ICurrentUserService _currentUserService;

    public SocialGraphController(
        ISocialGraphService socialGraph,
        ICurrentUserService currentUserService)
    {
        _socialGraph = socialGraph;
        _currentUserService = currentUserService;
    }

    /// <summary>
    /// The viewer's relationship with a profile, plus its counts.
    ///
    /// Anonymous callers are allowed: the counts are public, and a visitor with
    /// no account still needs the profile to render. They simply have no
    /// relationship to report.
    /// </summary>
    [AllowAnonymous]
    [HttpGet("relationship")]
    public async Task<IActionResult> GetRelationship(
        string handle,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _socialGraph.GetRelationshipAsync(
            _currentUserService.Current.UserId,
            handle,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [HttpPost("follow")]
    [EnableRateLimiting(SocialRateLimitPolicies.Follow)]
    public async Task<IActionResult> Follow(string handle, CancellationToken cancellationToken)
    {
        var response = await _socialGraph.FollowAsync(
            _currentUserService.Current.UserId,
            handle,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [HttpDelete("follow")]
    [EnableRateLimiting(SocialRateLimitPolicies.Follow)]
    public async Task<IActionResult> Unfollow(string handle, CancellationToken cancellationToken)
    {
        var response = await _socialGraph.UnfollowAsync(
            _currentUserService.Current.UserId,
            handle,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [HttpPost("block")]
    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    public async Task<IActionResult> Block(
        string handle,
        [FromBody] BlockOwnerRequest? request,
        CancellationToken cancellationToken)
    {
        var response = await _socialGraph.BlockAsync(
            _currentUserService.Current.UserId,
            handle,
            request?.Reason,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [HttpDelete("block")]
    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    public async Task<IActionResult> Unblock(string handle, CancellationToken cancellationToken)
    {
        var response = await _socialGraph.UnblockAsync(
            _currentUserService.Current.UserId,
            handle,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [AllowAnonymous]
    [HttpGet("followers")]
    public async Task<IActionResult> GetFollowers(
        string handle,
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _socialGraph.GetFollowersAsync(
            _currentUserService.Current.UserId,
            handle,
            cursor,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [AllowAnonymous]
    [HttpGet("following")]
    public async Task<IActionResult> GetFollowing(
        string handle,
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _socialGraph.GetFollowingAsync(
            _currentUserService.Current.UserId,
            handle,
            cursor,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
