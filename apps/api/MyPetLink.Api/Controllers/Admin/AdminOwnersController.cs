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
[Route("api/v1/admin/owners")]
public sealed class AdminOwnersController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAdminOwnerQueryService _ownerQueryService;
    private readonly ICurrentUserService _currentUserService;

    public AdminOwnersController(
        IAdminService adminService,
        IAdminOwnerQueryService ownerQueryService,
        ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _ownerQueryService = ownerQueryService;
        _currentUserService = currentUserService;
    }

    [HttpGet("table")]
    public async Task<IActionResult> Table(
        [FromQuery] AdminOwnerQuery query,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _ownerQueryService.ListAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("counts")]
    public async Task<IActionResult> Counts(
        [FromQuery] AdminOwnerQuery query,
        CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _ownerQueryService.CountAsync(query, cancellationToken), HttpContext));

    [HttpGet("{ownerId:guid}/detail")]
    public async Task<IActionResult> Detail(Guid ownerId, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _ownerQueryService.GetAsync(
            _currentUserService.Current.UserId,
            ownerId,
            cancellationToken), HttpContext));

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] AdminOwnerQuery query,
        [FromQuery] string? format,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _ownerQueryService.ExportAsync(
            _currentUserService.Current.UserId,
            query,
            format,
            ParseIds(ids),
            cancellationToken);
        return File(export.Content, export.ContentType, export.FileName);
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] string? plan,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListOwnersAsync(
            query.Page,
            query.PageSize,
            search,
            plan,
            status,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{ownerId:guid}")]
    public async Task<IActionResult> Get(Guid ownerId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetOwnerAsync(ownerId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    private static IReadOnlyCollection<Guid>? ParseIds(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length > 500) throw InvalidIds("Select at most 500 rows.");
        var ids = new List<Guid>(parts.Length);
        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id))
                throw InvalidIds("The selected rows could not be read. Please reselect them.");
            ids.Add(id);
        }
        return ids;
    }

    private static ApiException InvalidIds(string message) => new(
        StatusCodes.Status400BadRequest,
        "validation_failed",
        "Please check the submitted fields.",
        new Dictionary<string, string[]> { ["ids"] = [message] });
}
