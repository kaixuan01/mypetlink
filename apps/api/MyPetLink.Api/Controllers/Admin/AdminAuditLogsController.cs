using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
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

    // TODO: Add audit log search by actor, entity, action, and date range.
    [HttpGet]
    public Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? actorType,
        [FromQuery] Guid? actorId,
        [FromQuery] string? action,
        [FromQuery] string? entity,
        [FromQuery] Guid? entityId,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/audit-logs", cancellationToken);
    }
}
