using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/public/tags")]
public sealed class TagScanController : ApiControllerBase
{
    private readonly ITagScanService _tagScanService;

    public TagScanController(ITagScanService tagScanService)
    {
        _tagScanService = tagScanService;
    }

    // TODO: Resolve physical tag state and record scan analytics without precise location unless consent is explicit.
    [HttpGet("{tagCode}")]
    public Task<IActionResult> Resolve(string tagCode, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_tagScanService, "GET /api/v1/public/tags/{tagCode}", cancellationToken);
    }

    [HttpPost("{tagCode}/scan-location-consent")]
    public Task<IActionResult> SubmitLocationConsent(
        string tagCode,
        [FromBody] SubmitScanLocationConsentRequest request,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_tagScanService, "POST /api/v1/public/tags/{tagCode}/scan-location-consent", cancellationToken);
    }
}
