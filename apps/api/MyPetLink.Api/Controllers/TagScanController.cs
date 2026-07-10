using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
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

    [HttpGet("{tagCode}")]
    public async Task<IActionResult> Resolve(string tagCode, CancellationToken cancellationToken)
    {
        var context = new TagScanContext(
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers["User-Agent"].ToString(),
            Request.Headers["Referer"].ToString());
        var response = await _tagScanService.ResolveAsync(tagCode, context, cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{tagCode}/scan-location-consent")]
    public async Task<IActionResult> SubmitLocationConsent(
        string tagCode,
        [FromBody] SubmitScanLocationConsentRequest request,
        CancellationToken cancellationToken)
    {
        await _tagScanService.SubmitLocationConsentAsync(tagCode, request, cancellationToken);
        return Ok(ApiEnvelope.Ok(new { accepted = true }, HttpContext));
    }
}
