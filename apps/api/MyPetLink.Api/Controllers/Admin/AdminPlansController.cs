using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/plans")]
public sealed class AdminPlansController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminPlansController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var response = await _adminService.ListPlansAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
