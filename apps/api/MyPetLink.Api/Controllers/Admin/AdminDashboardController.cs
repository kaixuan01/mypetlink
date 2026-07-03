using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
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

    [HttpGet]
    [HttpGet("summary")]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var response = await _adminService.GetDashboardAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
