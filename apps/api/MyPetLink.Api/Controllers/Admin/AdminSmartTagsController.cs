using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/tags")]
public sealed class AdminSmartTagsController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ICurrentUserService _currentUserService;

    public AdminSmartTagsController(IAdminService adminService, ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? type,
        [FromQuery] Guid? petId,
        [FromQuery] Guid? ownerId,
        [FromQuery] Guid? orderId,
        [FromQuery] string? batchNumber,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListTagsAsync(
            query.Page,
            query.PageSize,
            status,
            type,
            petId,
            ownerId,
            orderId,
            batchNumber,
            search,
            inventoryOnly: false,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{tagId:guid}")]
    public async Task<IActionResult> Get(Guid tagId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetTagAsync(tagId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{tagId:guid}/disable")]
    public Task<IActionResult> Disable(Guid tagId, CancellationToken cancellationToken)
    {
        return RunTagActionAsync(tagId, "disable", null, cancellationToken);
    }

    [HttpPost("{tagId:guid}/mark-lost")]
    public Task<IActionResult> MarkLost(Guid tagId, CancellationToken cancellationToken)
    {
        return RunTagActionAsync(tagId, "mark-lost", null, cancellationToken);
    }

    [HttpPost("{tagId:guid}/replace")]
    public Task<IActionResult> Replace(Guid tagId, CancellationToken cancellationToken)
    {
        return RunTagActionAsync(tagId, "replace", null, cancellationToken);
    }

    [HttpPost("{tagId:guid}/archive")]
    public Task<IActionResult> Archive(Guid tagId, CancellationToken cancellationToken)
    {
        return RunTagActionAsync(tagId, "archive", null, cancellationToken);
    }

    [HttpPost("{tagId:guid}/restore")]
    public Task<IActionResult> Restore(Guid tagId, CancellationToken cancellationToken)
    {
        return RunTagActionAsync(tagId, "restore", null, cancellationToken);
    }

    private async Task<IActionResult> RunTagActionAsync(
        Guid tagId,
        string action,
        string? reason,
        CancellationToken cancellationToken)
    {
        var response = await _adminService.UpdateTagStatusAsync(
            _currentUserService.Current.UserId,
            tagId,
            action,
            reason,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
