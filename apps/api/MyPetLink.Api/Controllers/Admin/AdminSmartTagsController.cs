using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
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
    private readonly IAuditLogService _auditLogService;

    public AdminSmartTagsController(IAdminService adminService, IAuditLogService auditLogService)
    {
        _adminService = adminService;
        _auditLogService = auditLogService;
    }

    // TODO: Search/filter smart tag registry and reject unsafe status transitions.
    [HttpGet]
    public Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] Guid? petId,
        [FromQuery] Guid? ownerId,
        [FromQuery] string? batchNo,
        [FromQuery] string? tagCode,
        [FromQuery] bool? hasNfc,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/tags", cancellationToken);
    }

    [HttpPost("{tagId:guid}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid tagId,
        [FromBody] UpdateSmartTagStatusRequest request,
        CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("UpdateTagStatus", "SmartTag", tagId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/tags/{tagId}/status", cancellationToken);
    }

    [HttpPost("{tagId:guid}/archive")]
    public async Task<IActionResult> Archive(Guid tagId, CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("ArchiveTag", "SmartTag", tagId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/tags/{tagId}/archive", cancellationToken);
    }

    [HttpPost("{tagId:guid}/restore")]
    public async Task<IActionResult> Restore(Guid tagId, CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("RestoreTag", "SmartTag", tagId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/tags/{tagId}/restore", cancellationToken);
    }
}
