using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/settings")]
public sealed class AdminSettingsController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminSettingsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    // Read-only in Phase 1: editable settings need audited writes and are a
    // documented follow-up.
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var response = await _adminService.GetSettingsAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
