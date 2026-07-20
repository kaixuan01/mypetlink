using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/promotions")]
public sealed class AdminPromotionsController : ApiControllerBase
{
    private readonly ITagCatalogService _catalogService;
    private readonly ICurrentUserService _currentUserService;

    public AdminPromotionsController(ITagCatalogService catalogService, ICurrentUserService currentUserService)
    {
        _catalogService = catalogService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] AdminPromotionQuery query, CancellationToken cancellationToken)
    {
        var (items, total) = await _catalogService.ListPromotionsAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPromotionRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, ApiEnvelope.Ok(await _catalogService.CreatePromotionAsync(
            _currentUserService.Current.UserId, request, cancellationToken), HttpContext));

    [HttpPut("{promotionId:guid}")]
    public async Task<IActionResult> Update(Guid promotionId, [FromBody] UpsertPromotionRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _catalogService.UpdatePromotionAsync(
            _currentUserService.Current.UserId, promotionId, request, cancellationToken), HttpContext));
}
