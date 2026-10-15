using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[Route("api/v1/public/partner-stores")]
public sealed class PublicPartnerStoresController(MerchantDirectoryService service) : ApiControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PagedQuery query,
        [FromQuery, MaxLength(160)] string? search, CancellationToken ct)
    {
        NoCache();
        var (items, total) = await service.ListPublicAsync(query.Page, query.PageSize, search, null, ct);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{publicCode}")]
    public async Task<IActionResult> Get(string publicCode, CancellationToken ct)
    {
        NoCache();
        if (publicCode.Length != 32 || !publicCode.All(Uri.IsHexDigit)) return Unavailable();
        var (items, _) = await service.ListPublicAsync(1, 1, null, publicCode, ct);
        var store = items.SingleOrDefault();
        return store is null ? Unavailable() : Ok(ApiEnvelope.Ok(store, HttpContext));
    }

    private void NoCache()
    {
        Response.Headers.CacheControl = "no-store, no-cache, max-age=0, must-revalidate";
        Response.Headers["CDN-Cache-Control"] = "no-store";
        Response.Headers["Cloudflare-CDN-Cache-Control"] = "no-store";
    }
    private IActionResult Unavailable() => NotFound(ApiEnvelope.Error(
        HttpContext, "partner_store_not_found", "That store is not available."));
}
