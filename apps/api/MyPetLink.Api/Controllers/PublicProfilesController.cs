using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/public/profiles")]
public sealed class PublicProfilesController : ApiControllerBase
{
    private readonly IPublicProfileService _publicProfileService;

    public PublicProfilesController(IPublicProfileService publicProfileService)
    {
        _publicProfileService = publicProfileService;
    }

    // TODO: Build privacy-gated public profile projections by publicCode only.
    [HttpGet("{publicCode}")]
    public Task<IActionResult> Get(string publicCode, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_publicProfileService, "GET /api/v1/public/profiles/{publicCode}", cancellationToken);
    }
}
