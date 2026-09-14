using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/auth")]
public sealed class AdminAuthController : ApiControllerBase
{
    private readonly IAuthService _authService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IAdminAccessManagementService _accessManagement;

    public AdminAuthController(
        IAuthService authService,
        ICurrentUserService currentUserService,
        IAdminAccessManagementService accessManagement)
    {
        _authService = authService;
        _currentUserService = currentUserService;
        _accessManagement = accessManagement;
    }

    [HttpGet("check")]
    public async Task<IActionResult> Check(CancellationToken cancellationToken)
    {
        // The roles and permissions travel with the access check so the portal
        // has one authoritative answer per session start, from the same
        // database read the API itself authorizes against.
        var access = await _accessManagement.GetMyAccessAsync(cancellationToken);

        var response = await _authService.GetAdminAuthCheckAsync(
            _currentUserService.Current.UserId,
            access,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
