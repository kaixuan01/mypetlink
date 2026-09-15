using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AdminCapabilities.OwnersView)]
[Route("api/v1/admin/owners")]
public sealed class AdminOwnersController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAdminOwnerQueryService _ownerQueryService;
    private readonly IOwnerHandleService _ownerHandleService;
    private readonly ICurrentUserService _currentUserService;

    public AdminOwnersController(
        IAdminService adminService,
        IAdminOwnerQueryService ownerQueryService,
        IOwnerHandleService ownerHandleService,
        ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _ownerQueryService = ownerQueryService;
        _ownerHandleService = ownerHandleService;
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
    [Authorize(Policy = AdminCapabilities.OwnersExport)]
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

    [HttpPost("{ownerId:guid}/welcome-email/retry")]
    [Authorize(Policy = AdminCapabilities.OwnersManage)]
    public async Task<IActionResult> RetryWelcomeEmail(
        Guid ownerId,
        CancellationToken cancellationToken)
    {
        var response = await _adminService.RetryOwnerWelcomeEmailAsync(
            _currentUserService.Current.UserId,
            ownerId,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// The owner's social handle, and whether it is a protected name.
    /// </summary>
    [HttpGet("{ownerId:guid}/social-handle")]
    public async Task<IActionResult> GetSocialHandle(
        Guid ownerId,
        CancellationToken cancellationToken)
    {
        Response.Headers.CacheControl = "no-store";

        var response = await _ownerHandleService.GetOwnerHandleAsync(ownerId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    /// <summary>
    /// Assigns a reserved handle — a brand or route name no owner can claim — to
    /// this owner's social profile.
    ///
    /// Behind its own capability rather than <c>owners.manage</c>: helping an
    /// owner with their account and handing out the MyPetLink identity itself
    /// are different powers, and no built-in role template is granted this one,
    /// so it starts as Super Admin only.
    ///
    /// This is a separate route from the owner's own handle endpoint on purpose.
    /// The self-service path has no parameter that could widen it, so there is
    /// nothing a normal client could send to reach this behaviour.
    /// </summary>
    [HttpPost("{ownerId:guid}/social-handle")]
    [Authorize(Policy = AdminCapabilities.OwnerSocialHandleAssign)]
    public async Task<IActionResult> AssignSocialHandle(
        Guid ownerId,
        [FromBody] AssignReservedHandleRequest request,
        CancellationToken cancellationToken)
    {
        await _ownerHandleService.AssignReservedHandleAsync(
            _currentUserService.Current.UserId!.Value,
            ownerId,
            request.Handle,
            request.ConfirmReassign,
            cancellationToken);

        var response = await _ownerHandleService.GetOwnerHandleAsync(ownerId, cancellationToken);
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
