using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

/// <summary>
/// Explore and search.
///
/// Anonymous, like the rest of the public social read surface: somebody who
/// followed a shared link should be able to look around before deciding whether
/// to join. A session changes exactly two things here — which accounts are
/// excluded for a block, and whether each card already shows "Following". It
/// never widens what is returned.
/// </summary>
[AllowAnonymous]
[Route("api/v1/social")]
public sealed class SocialDiscoveryController : ApiControllerBase
{
    private readonly ISocialDiscoveryService _discovery;
    private readonly ICurrentUserService _currentUserService;

    public SocialDiscoveryController(
        ISocialDiscoveryService discovery,
        ICurrentUserService currentUserService)
    {
        _discovery = discovery;
        _currentUserService = currentUserService;
    }

    [HttpGet("explore/pets")]
    public async Task<IActionResult> GetSuggestedPets(
        [FromQuery] string? species,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _discovery.GetSuggestedPetsAsync(
            _currentUserService.Current.UserId,
            species,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("explore/moments")]
    public async Task<IActionResult> GetLatestMoments(
        [FromQuery] string? species,
        [FromQuery] string? cursor,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _discovery.GetLatestMomentsAsync(
            _currentUserService.Current.UserId,
            species,
            cursor,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("explore/species")]
    public async Task<IActionResult> GetSpecies(CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _discovery.GetSpeciesAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// Pets by name, and households by handle or social display name.
    ///
    /// Rate limited under the shared social-search policy: this is the one
    /// social endpoint that answers questions about names nobody has been shown
    /// yet, which makes it the natural place to enumerate from.
    /// </summary>
    [HttpGet("search")]
    [EnableRateLimiting(SocialRateLimitPolicies.Search)]
    public async Task<IActionResult> Search(
        [FromQuery] string? q,
        [FromQuery] string? type,
        [FromQuery] string? species,
        [FromQuery] int? limit,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _discovery.SearchAsync(
            _currentUserService.Current.UserId,
            q,
            type,
            species,
            limit,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
