using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/dashboard")]
public sealed class AdminDashboardController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminDashboardController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    // TODO: Compute dashboard counts from relational owner, pet, order, proof, and tag data.
    [HttpGet("summary")]
    public Task<IActionResult> Summary(CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/dashboard/summary", cancellationToken);
    }
}
