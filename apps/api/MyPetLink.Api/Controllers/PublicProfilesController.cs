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

    public PublicProfilesController(IPublicProfileService publicProfileService)
    {
        _publicProfileService = publicProfileService;
    }

    [HttpGet("pets/{publicSlug}")]
    public async Task<IActionResult> GetByPublicSlug(string publicSlug, CancellationToken cancellationToken)
    {
        var response = await _publicProfileService.GetByPublicSlugAsync(publicSlug, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("profiles/{publicCode}")]
    public async Task<IActionResult> GetByPublicCode(string publicCode, CancellationToken cancellationToken)
    {
        var response = await _publicProfileService.GetByPublicSlugAsync(publicCode, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
