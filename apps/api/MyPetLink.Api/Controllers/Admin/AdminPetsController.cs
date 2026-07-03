using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/pets")]
public sealed class AdminPetsController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminPetsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    // TODO: Filter by lifecycle and Lost Mode; Lost Mode remains a flag, not a lifecycle state.
    [HttpGet]
    public Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] Guid? ownerId,
        [FromQuery] string? lifecycleStatus,
        [FromQuery] bool? lostMode,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/pets", cancellationToken);
    }
}
