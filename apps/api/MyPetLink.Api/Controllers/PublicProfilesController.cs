using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/public")]
public sealed class PublicProfilesController : ApiControllerBase
{
    private readonly IPublicProfileService _publicProfileService;
    private readonly IPublicProfileSocialCardRenderer _socialCardRenderer;

    public PublicProfilesController(
        IPublicProfileService publicProfileService,
        IPublicProfileSocialCardRenderer socialCardRenderer)
    {
        _publicProfileService = publicProfileService;
        _socialCardRenderer = socialCardRenderer;
    }

    [HttpGet("pets/{publicSlug}")]
    public async Task<IActionResult> GetByPublicSlug(string publicSlug, CancellationToken cancellationToken)
    {
        SetDynamicProfileResponseHeaders();
        var response = await _publicProfileService.GetByPublicSlugAsync(publicSlug, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("profiles/{publicCode}")]
    public async Task<IActionResult> GetByPublicCode(string publicCode, CancellationToken cancellationToken)
    {
        SetDynamicProfileResponseHeaders();
        var response = await _publicProfileService.GetByPublicSlugAsync(publicCode, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("pets/{publicSlug}/social")]
    public async Task<IActionResult> GetSocialMetadata(
        string publicSlug,
        CancellationToken cancellationToken)
    {
        SetDynamicProfileResponseHeaders();
        var response = await _publicProfileService.GetSocialByPublicSlugAsync(publicSlug, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("pets/{publicSlug}/social-card.jpg")]
    [Produces("image/jpeg")]
    public async Task<IActionResult> GetSocialCard(
        string publicSlug,
        [FromQuery(Name = "v")] string? requestedVersion,
        CancellationToken cancellationToken)
    {
        var profile = await _publicProfileService.GetSocialByPublicSlugAsync(publicSlug, cancellationToken);
        var entityTag = $"\"{profile.PublicProfileVersion}\"";

        // This origin endpoint is consumed by the Pages Function, which owns
        // the versioned public cache after revalidating profile visibility.
        // Keeping the origin response out of shared caches prevents an old
        // direct API URL from outliving a later private/archive change.
        Response.Headers.CacheControl = "private, no-store";
        Response.Headers.ETag = entityTag;
        Response.Headers["X-Public-Profile-Version"] = profile.PublicProfileVersion;

        if (Request.Headers.IfNoneMatch.Any(value =>
                string.Equals(value, entityTag, StringComparison.Ordinal)))
        {
            return StatusCode(StatusCodes.Status304NotModified);
        }

        // A stale or missing query version is safe: the current public projection
        // remains the authority, and the response always contains the current card.
        _ = requestedVersion;
        var jpeg = await _socialCardRenderer.RenderAsync(profile, cancellationToken);
        return File(jpeg, "image/jpeg");
    }

    private void SetDynamicProfileResponseHeaders()
    {
        // Pet details can change immediately after an owner save. Keep these
        // restricted public projections out of browser and intermediary caches;
        // versioned social-card images retain their separate cache policy.
        Response.Headers.CacheControl = "no-store";
    }
}
