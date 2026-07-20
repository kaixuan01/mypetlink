using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/tag-products")]
public sealed class AdminTagProductsController : ApiControllerBase
{
    private readonly ITagCatalogService _catalogService;
    private readonly ICurrentUserService _currentUserService;

    public AdminTagProductsController(ITagCatalogService catalogService, ICurrentUserService currentUserService)
    {
        _catalogService = catalogService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] AdminTagProductQuery query, CancellationToken cancellationToken)
    {
        var (items, total) = await _catalogService.ListAdminAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{productId:guid}")]
    public async Task<IActionResult> Get(Guid productId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.GetAdminAsync(productId, cancellationToken), HttpContext));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertTagProductRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, ApiEnvelope.Ok(await _catalogService.CreateProductAsync(
            _currentUserService.Current.UserId, request, cancellationToken), HttpContext));

    [HttpPut("{productId:guid}")]
    public async Task<IActionResult> Update(Guid productId, [FromBody] UpsertTagProductRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.UpdateProductAsync(
            _currentUserService.Current.UserId, productId, request, cancellationToken), HttpContext));

    [HttpPost("{productId:guid}/archive")]
    public async Task<IActionResult> Archive(Guid productId, [FromBody] ArchiveCatalogRecordRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.ArchiveProductAsync(
            _currentUserService.Current.UserId, productId, request.ConcurrencyToken, cancellationToken), HttpContext));

    [HttpPost("{productId:guid}/variants")]
    public async Task<IActionResult> CreateVariant(Guid productId, [FromBody] UpsertTagProductVariantRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, ApiEnvelope.Ok(await _catalogService.CreateVariantAsync(
            _currentUserService.Current.UserId, productId, request, cancellationToken), HttpContext));

    [HttpPut("variants/{variantId:guid}")]
    public async Task<IActionResult> UpdateVariant(Guid variantId, [FromBody] UpsertTagProductVariantRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.UpdateVariantAsync(
            _currentUserService.Current.UserId, variantId, request, cancellationToken), HttpContext));

    [HttpPost("variants/{variantId:guid}/archive")]
    public async Task<IActionResult> ArchiveVariant(Guid variantId, [FromBody] ArchiveCatalogRecordRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.ArchiveVariantAsync(
            _currentUserService.Current.UserId, variantId, request.ConcurrencyToken, cancellationToken), HttpContext));
}
