using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/settings")]
public sealed class AdminSettingsController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAuditLogService _auditLogService;

    public AdminSettingsController(IAdminService adminService, IAuditLogService auditLogService)
    {
        _adminService = adminService;
        _auditLogService = auditLogService;
    }

    // TODO: Expose read-only settings first; future edits must audit old/new values.
    [HttpGet]
    public Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/settings", cancellationToken);
    }

    [HttpPatch]
    public async Task<IActionResult> Patch([FromBody] UpdateAppSettingsRequest request, CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("UpdateSettings", "AppSetting", null, cancellationToken);
        return await PlaceholderAsync(_adminService, "PATCH /api/v1/admin/settings", cancellationToken);
    }
}
