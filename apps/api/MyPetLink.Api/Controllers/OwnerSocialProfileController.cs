using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// The signed-in owner's own social identity.
///
/// Every route here is "me": the subject is the JWT subject, and there is no
/// user id, owner id or actor id anywhere in a path, query or body. A handle in
/// a URL is an address, never a grant — nothing on this controller acts on an
/// account other than the caller's own.
/// </summary>
[Authorize]
[Route("api/v1/social/me")]
public sealed class OwnerSocialProfileController : ApiControllerBase
{
    private readonly IOwnerSocialProfileService _socialProfileService;
    private readonly ICurrentUserService _currentUserService;

    public OwnerSocialProfileController(
        IOwnerSocialProfileService socialProfileService,
        ICurrentUserService currentUserService)
    {
        _socialProfileService = socialProfileService;
        _currentUserService = currentUserService;
    }

    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile(CancellationToken cancellationToken)
    {
        var response = await _socialProfileService.GetAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("profile")]
    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    public async Task<IActionResult> UpdateProfile(
        [FromBody] UpdateOwnerSocialProfileRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _socialProfileService.UpdateAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("handle")]
    [EnableRateLimiting(SocialRateLimitPolicies.ProfileMutation)]
    public async Task<IActionResult> ClaimHandle(
        [FromBody] ClaimOwnerHandleRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _socialProfileService.ClaimHandleAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}

/// <summary>
/// Handle availability.
///
/// Separate from the "me" routes above because it asks about a name rather than
/// about the caller, and because it needs its own, tighter limit: it is the one
/// endpoint that answers questions about handles nobody has claimed, which makes
/// it the natural place to enumerate from.
/// </summary>
[Authorize]
[Route("api/v1/social/handles")]
public sealed class OwnerHandleAvailabilityController : ApiControllerBase
{
    private readonly IOwnerSocialProfileService _socialProfileService;
    private readonly ICurrentUserService _currentUserService;

    public OwnerHandleAvailabilityController(
        IOwnerSocialProfileService socialProfileService,
        ICurrentUserService currentUserService)
    {
        _socialProfileService = socialProfileService;
        _currentUserService = currentUserService;
    }

    [HttpGet("{handle}/available")]
    [EnableRateLimiting(SocialRateLimitPolicies.HandleAvailability)]
    public async Task<IActionResult> CheckAvailability(
        string handle,
        CancellationToken cancellationToken)
    {
        // Never cached anywhere: an availability answer goes stale the moment
        // somebody claims the name, and a cached "available" would send a person
        // into a claim that then fails.
        Response.Headers.CacheControl = "no-store";

        var response = await _socialProfileService.CheckHandleAvailabilityAsync(
            _currentUserService.Current.UserId,
            handle,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
