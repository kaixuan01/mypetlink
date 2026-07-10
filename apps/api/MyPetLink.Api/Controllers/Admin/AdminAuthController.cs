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

    public AdminAuthController(IAuthService authService, ICurrentUserService currentUserService)
    {
        _authService = authService;
        _currentUserService = currentUserService;
    }

    [HttpGet("check")]
    public async Task<IActionResult> Check(CancellationToken cancellationToken)
    {
        var response = await _authService.GetAdminAuthCheckAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
