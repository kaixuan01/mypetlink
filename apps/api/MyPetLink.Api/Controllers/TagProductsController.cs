using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[AllowAnonymous]
[Route("api/v1/tag-products")]
public sealed class TagProductsController : ApiControllerBase
{
    private readonly ITagCatalogService _catalogService;

    public TagProductsController(ITagCatalogService catalogService)
    {
        _catalogService = catalogService;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.ListPublicAsync(cancellationToken), HttpContext));

    [HttpGet("{slug}")]
    public async Task<IActionResult> Get(string slug, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.GetPublicAsync(slug, cancellationToken), HttpContext));
}
