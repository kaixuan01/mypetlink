using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/owners")]
public sealed class AdminOwnersController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminOwnersController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    // TODO: Add owner search, status filters, and FK-based pet/order counts.
    [HttpGet]
    public Task<IActionResult> List([FromQuery] PagedQuery query, [FromQuery] string? search, [FromQuery] string? status, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/owners", cancellationToken);
    }
}
