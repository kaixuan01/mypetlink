using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

// Read-only Plans endpoints. Plan definitions are seeded configuration and
// cannot be edited through the API; owner-plan rows are usage projections.
[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/plans")]
public sealed class AdminPlansController : ApiControllerBase
{
    private readonly IAdminPlanQueryService _planQueryService;
    private readonly ICurrentUserService _currentUserService;

    public AdminPlansController(
        IAdminPlanQueryService planQueryService,
        ICurrentUserService currentUserService)
    {
        _planQueryService = planQueryService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> Definitions(CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(
            await _planQueryService.ListDefinitionsAsync(cancellationToken), HttpContext));

    [HttpGet("owners")]
    public async Task<IActionResult> Owners(
        [FromQuery] AdminOwnerPlanQuery query,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _planQueryService.ListOwnersAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("owners/counts")]
    public async Task<IActionResult> OwnerCounts(
        [FromQuery] AdminOwnerPlanQuery query,
        CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _planQueryService.CountAsync(query, cancellationToken), HttpContext));

    [HttpGet("owners/{ownerId:guid}/detail")]
    public async Task<IActionResult> OwnerDetail(Guid ownerId, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _planQueryService.GetOwnerAsync(
            _currentUserService.Current.UserId, ownerId, cancellationToken), HttpContext));

    [HttpGet("owners/export")]
    public async Task<IActionResult> Export(
        [FromQuery] AdminOwnerPlanQuery query,
        [FromQuery] string? format,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _planQueryService.ExportAsync(
            _currentUserService.Current.UserId,
            query,
            format,
            ParseIds(ids),
            cancellationToken);
        return File(export.Content, export.ContentType, export.FileName);
    }

    private static IReadOnlyCollection<Guid>? ParseIds(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (parts.Length > 500)
        {
            throw InvalidIds("Select at most 500 rows.");
        }

        var ids = new List<Guid>(parts.Length);

        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id))
            {
                throw InvalidIds("The selected rows could not be read. Please reselect them.");
            }

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
