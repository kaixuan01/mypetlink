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
[Route("api/v1/admin/pets")]
public sealed class AdminPetsController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAdminPetProfileQueryService _petProfileQueryService;
    private readonly ICurrentUserService _currentUserService;

    public AdminPetsController(
        IAdminService adminService,
        IAdminPetProfileQueryService petProfileQueryService,
        ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _petProfileQueryService = petProfileQueryService;
        _currentUserService = currentUserService;
    }

    [HttpGet("table")]
    public async Task<IActionResult> Table(
        [FromQuery] AdminPetProfileQuery query,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _petProfileQueryService.ListAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("counts")]
    public async Task<IActionResult> Counts(
        [FromQuery] AdminPetProfileQuery query,
        CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(
            await _petProfileQueryService.CountByStatusAsync(query, cancellationToken),
            HttpContext));

    [HttpGet("{petId:guid}/detail")]
    public async Task<IActionResult> Detail(Guid petId, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _petProfileQueryService.GetAsync(petId, cancellationToken), HttpContext));

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] AdminPetProfileQuery query,
        [FromQuery] string? format,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _petProfileQueryService.ExportAsync(
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
        [FromQuery] Guid? ownerId,
        [FromQuery] string? lifecycleStatus,
        [FromQuery] bool? lostMode,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListPetsAsync(
            query.Page,
            query.PageSize,
            lifecycleStatus,
            lostMode,
            ownerId,
            search,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{petId:guid}")]
    public async Task<IActionResult> Get(Guid petId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetPetAsync(petId, cancellationToken);
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
