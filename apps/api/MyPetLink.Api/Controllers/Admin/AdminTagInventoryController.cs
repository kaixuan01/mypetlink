using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/tag-inventory")]
public sealed class AdminTagInventoryController : ApiControllerBase
{
    private const int MaxSelectedIds = 500;

    private readonly IAdminTagInventoryService _inventoryService;
    private readonly ICurrentUserService _currentUserService;

    public AdminTagInventoryController(
        IAdminTagInventoryService inventoryService,
        ICurrentUserService currentUserService)
    {
        _inventoryService = inventoryService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] AdminTagInventoryQuery query,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _inventoryService.ListAsync(query, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost("generate")]
    public async Task<IActionResult> Generate(
        [FromBody] AdminGenerateTagsRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _inventoryService.GenerateAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return StatusCode(StatusCodes.Status201Created, ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("bulk-status")]
    public async Task<IActionResult> BulkStatus(
        [FromBody] AdminTagInventoryBulkActionRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _inventoryService.BulkUpdateFulfilmentAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    // Exports the rows matching the current filters (or, when `ids` is
    // provided, only the selected rows) as CSV or Excel.
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] AdminTagInventoryQuery query,
        [FromQuery] string? format,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _inventoryService.ExportAsync(
            _currentUserService.Current.UserId,
            query,
            format,
            ParseSelectedIds(ids),
            cancellationToken);

        return File(export.Content, export.ContentType, export.FileName);
    }

    // Production workbook for the physical tag manufacturer: only the data
    // required for QR printing and NFC encoding. Owner, pet, order, and
    // internal operational data never appear in this file.
    [HttpGet("manufacturer-export")]
    public async Task<IActionResult> ManufacturerExport(
        [FromQuery] AdminTagInventoryQuery query,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _inventoryService.ExportManufacturerAsync(
            _currentUserService.Current.UserId,
            query,
            ParseSelectedIds(ids),
            cancellationToken);

        return File(export.Content, export.ContentType, export.FileName);
    }

    private static IReadOnlyCollection<Guid>? ParseSelectedIds(string? ids)
    {
        if (string.IsNullOrWhiteSpace(ids))
        {
            return null;
        }

        var parts = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length > MaxSelectedIds)
        {
            throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]>
                {
                    ["ids"] = [$"Select at most {MaxSelectedIds} rows for a selected-row export."]
                });
        }

        var parsed = new List<Guid>(parts.Length);

        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id))
            {
                throw new ApiException(
                    StatusCodes.Status400BadRequest,
                    "validation_failed",
                    "Please check the submitted fields.",
                    new Dictionary<string, string[]>
                    {
                        ["ids"] = ["The selected rows could not be read. Please reselect and try again."]
                    });
            }

            parsed.Add(id);
        }

        return parsed;
    }
}
