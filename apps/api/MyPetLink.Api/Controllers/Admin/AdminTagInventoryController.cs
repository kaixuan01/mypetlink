using System.Text;
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
[Route("api/v1/admin/tag-inventory")]
public sealed class AdminTagInventoryController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ICurrentUserService _currentUserService;

    public AdminTagInventoryController(IAdminService adminService, ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? batchNumber,
        [FromQuery] string? status,
        [FromQuery] string? tagType,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListTagsAsync(
            query.Page,
            query.PageSize,
            status,
            tagType,
            petId: null,
            ownerId: null,
            orderId: null,
            batchNumber,
            search,
            inventoryOnly: true,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate(
        [FromBody] AdminGenerateTagsRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _adminService.GenerateTagInventoryAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return StatusCode(StatusCodes.Status201Created, ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] string? batchNumber,
        CancellationToken cancellationToken)
    {
        var (fileName, csv) = await _adminService.ExportTagInventoryCsvAsync(batchNumber, cancellationToken);
        return File(Encoding.UTF8.GetBytes(csv), "text/csv", fileName);
    }
}
