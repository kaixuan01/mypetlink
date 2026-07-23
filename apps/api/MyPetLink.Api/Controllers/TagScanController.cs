using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
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
    [EnableRateLimiting(SmartTagRateLimitPolicies.PublicTagScan)]
    public Task<IActionResult> ResolveLegacy(string tagCode, CancellationToken cancellationToken)
    {
        return ResolveTrusted(tagCode, TagScanSource.Legacy, cancellationToken);
    }

    [HttpGet("{tagCode}/qr")]
    [EnableRateLimiting(SmartTagRateLimitPolicies.PublicTagScan)]
    public Task<IActionResult> ResolveQr(string tagCode, CancellationToken cancellationToken)
    {
        return ResolveTrusted(tagCode, TagScanSource.Qr, cancellationToken);
    }

    [HttpGet("{tagCode}/nfc")]
    [EnableRateLimiting(SmartTagRateLimitPolicies.PublicTagScan)]
    public Task<IActionResult> ResolveNfc(string tagCode, CancellationToken cancellationToken)
    {
        return ResolveTrusted(tagCode, TagScanSource.Nfc, cancellationToken);
    }

    private async Task<IActionResult> ResolveTrusted(
        string tagCode,
        TagScanSource source,
        CancellationToken cancellationToken)
    {
        var context = new TagScanContext(
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            Request.Headers["User-Agent"].ToString(),
            Request.Headers["Referer"].ToString());
        var response = await _tagScanService.ResolveAsync(
            tagCode,
            source,
            context,
            cancellationToken);

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
