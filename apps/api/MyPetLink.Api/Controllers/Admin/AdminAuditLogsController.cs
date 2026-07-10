using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/audit-logs")]
public sealed class AdminAuditLogsController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminAuditLogsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] Guid? actorId,
        [FromQuery] string? action,
        [FromQuery] string? entity,
        [FromQuery] Guid? entityId,
        [FromQuery] DateTimeOffset? fromDate,
        [FromQuery] DateTimeOffset? toDate,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListAuditLogsAsync(
            query.Page,
            query.PageSize,
            action,
            entity,
            entityId,
            actorId,
            fromDate,
            toDate,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }
}
