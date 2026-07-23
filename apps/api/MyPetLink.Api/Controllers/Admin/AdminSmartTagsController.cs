using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/tags")]
public sealed class AdminSmartTagsController : ApiControllerBase
{
    private const int MaxSelectedIds = 500;
    private readonly IAdminSmartTagService _smartTagService;
    private readonly ICurrentUserService _currentUserService;

    public AdminSmartTagsController(IAdminSmartTagService smartTagService, ICurrentUserService currentUserService)
    {
        _smartTagService = smartTagService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] AdminSmartTagQuery query, CancellationToken cancellationToken)
    {
        var (items, total) = await _smartTagService.ListAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("counts")]
    public async Task<IActionResult> Counts([FromQuery] AdminSmartTagQuery query, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.CountByStatusAsync(query, cancellationToken), HttpContext));

    [HttpGet("{tagId:guid}")]
    public async Task<IActionResult> Get(Guid tagId, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.GetAsync(tagId, cancellationToken), HttpContext));

    [HttpGet("{tagId:guid}/scans")]
    public async Task<IActionResult> Scans(
        Guid tagId,
        [FromQuery] string? source,
        CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.ListScansAsync(
            _currentUserService.Current.UserId, tagId, source, cancellationToken), HttpContext));

    [HttpGet("{tagId:guid}/scans/export")]
    public async Task<IActionResult> ExportScans(
        Guid tagId,
        [FromQuery] string? source,
        [FromQuery] string? format,
        CancellationToken cancellationToken)
    {
        var export = await _smartTagService.ExportScansAsync(
            _currentUserService.Current.UserId,
            tagId,
            source,
            format,
            cancellationToken);
        return File(export.Content, export.ContentType, export.FileName);
    }

    [HttpPost("{tagId:guid}/disable")]
    public Task<IActionResult> Disable(Guid tagId, [FromBody] AdminSmartTagActionRequest? request, CancellationToken cancellationToken)
        => RunAction(tagId, "disable", request?.Reason, cancellationToken);

    [HttpPost("{tagId:guid}/mark-lost")]
    public Task<IActionResult> MarkLost(Guid tagId, [FromBody] AdminSmartTagActionRequest? request, CancellationToken cancellationToken)
        => RunAction(tagId, "mark-lost", request?.Reason, cancellationToken);

    [HttpPost("{tagId:guid}/archive")]
    public Task<IActionResult> Archive(Guid tagId, [FromBody] AdminSmartTagActionRequest? request, CancellationToken cancellationToken)
        => RunAction(tagId, "archive", request?.Reason, cancellationToken);

    [HttpPost("{tagId:guid}/restore")]
    public Task<IActionResult> Restore(Guid tagId, [FromBody] AdminSmartTagActionRequest? request, CancellationToken cancellationToken)
        => RunAction(tagId, "restore", request?.Reason, cancellationToken);

    [HttpPost("{tagId:guid}/reactivate")]
    public Task<IActionResult> Reactivate(Guid tagId, [FromBody] AdminSmartTagActionRequest? request, CancellationToken cancellationToken)
        => RunAction(tagId, "reactivate", request?.Reason, cancellationToken);

    [HttpPost("{tagId:guid}/assignment/claim")]
    public async Task<IActionResult> Claim(Guid tagId, [FromBody] AdminSmartTagClaimRequest request, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.ClaimAsync(
            _currentUserService.Current.UserId, tagId, request, cancellationToken), HttpContext));

    [HttpPost("{tagId:guid}/assignment/pet")]
    public async Task<IActionResult> AssignPet(Guid tagId, [FromBody] AdminSmartTagAssignPetRequest request, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.AssignPetAsync(
            _currentUserService.Current.UserId, tagId, request, cancellationToken), HttpContext));

    [HttpPost("{tagId:guid}/assignment/unassign-pet")]
    public async Task<IActionResult> UnassignPet(Guid tagId, [FromBody] AdminSmartTagUnassignPetRequest request, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.UnassignPetAsync(
            _currentUserService.Current.UserId, tagId, request, cancellationToken), HttpContext));

    [HttpPost("{tagId:guid}/assignment/transfer")]
    public async Task<IActionResult> TransferOwnership(Guid tagId, [FromBody] AdminSmartTagTransferRequest request, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.TransferOwnershipAsync(
            _currentUserService.Current.UserId, tagId, request, cancellationToken), HttpContext));

    [HttpPost("bulk-status")]
    public async Task<IActionResult> BulkStatus([FromBody] AdminSmartTagBulkActionRequest request, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.BulkUpdateAsync(
            _currentUserService.Current.UserId, request, cancellationToken), HttpContext));

    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] AdminSmartTagQuery query,
        [FromQuery] string? format,
        [FromQuery] string? ids,
        CancellationToken cancellationToken)
    {
        var export = await _smartTagService.ExportAsync(
            _currentUserService.Current.UserId, query, format, ParseIds(ids), cancellationToken);
        return File(export.Content, export.ContentType, export.FileName);
    }

    private async Task<IActionResult> RunAction(Guid tagId, string action, string? reason, CancellationToken cancellationToken)
        => Ok(ApiEnvelope.Ok(await _smartTagService.UpdateStatusAsync(
            _currentUserService.Current.UserId, tagId, action, reason, cancellationToken), HttpContext));

    private static IReadOnlyCollection<Guid>? ParseIds(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var parts = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length > MaxSelectedIds) throw InvalidIds($"Select at most {MaxSelectedIds} rows.");
        var ids = new List<Guid>(parts.Length);
        foreach (var part in parts)
        {
            if (!Guid.TryParse(part, out var id)) throw InvalidIds("The selected rows could not be read. Please reselect them.");
            ids.Add(id);
        }
        return ids;
    }

    private static ApiException InvalidIds(string message) => new(
        StatusCodes.Status400BadRequest, "validation_failed", "Please check the submitted fields.",
        new Dictionary<string, string[]> { ["ids"] = [message] });
}
