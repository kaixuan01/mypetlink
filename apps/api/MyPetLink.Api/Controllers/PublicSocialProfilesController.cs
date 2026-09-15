using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// The anonymous social read surface.
///
/// Anonymous on purpose: a shared profile link has to work for someone without
/// an account, which is most of the people who will ever follow one. Everything
/// returned here is already gated by the owner's and the pet's social switches,
/// so there is nothing an account would be entitled to that a visitor is not.
/// </summary>
[AllowAnonymous]
[Route("api/v1/public")]
public sealed class PublicSocialProfilesController : ApiControllerBase
{
    private readonly IPublicSocialProfileService _socialProfiles;
    private readonly ICurrentUserService _currentUserService;

    public PublicSocialProfilesController(
        IPublicSocialProfileService socialProfiles,
        ICurrentUserService currentUserService)
    {
        _socialProfiles = socialProfiles;
        _currentUserService = currentUserService;
    }

    [HttpGet("owners/{handle}")]
    public async Task<IActionResult> GetOwnerProfile(
        string handle,
        CancellationToken cancellationToken)
    {
        // A profile can be switched off at any moment, so it must not be held in
        // a browser or intermediary cache.
        Response.Headers.CacheControl = "no-store";

        var response = await _socialProfiles.GetOwnerProfileAsync(handle, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// Where a handle currently points, so the edge can redirect a request for a
    /// handle an account used to hold rather than serving a dead link.
    /// </summary>
    [HttpGet("owners/{handle}/resolve")]
    public async Task<IActionResult> ResolveHandle(
        string handle,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _socialProfiles.ResolveHandleAsync(handle, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("owners/{handle}/moments")]
    public async Task<IActionResult> GetOwnerMoments(
        string handle,
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        // The caller, when there is one, is used for a single thing: reporting
        // which Moments they have already liked. It never widens what a listing
        // returns — a signed-in visitor sees exactly what a stranger sees.
        var response = await _socialProfiles.GetOwnerMomentsAsync(
            handle,
            cursor,
            limit,
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("pets/{publicSlug}/moments")]
    public async Task<IActionResult> GetPetMoments(
        string publicSlug,
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _socialProfiles.GetPetMomentsAsync(
            publicSlug,
            cursor,
            limit,
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
