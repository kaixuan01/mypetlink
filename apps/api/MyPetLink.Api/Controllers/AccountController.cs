using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/account")]
public sealed class AccountController : ApiControllerBase
{
    private readonly IAuthService _authService;

    public AccountController(IAuthService authService)
    {
        _authService = authService;
    }

    // TODO: Update owner profile defaults and privacy settings for the current user.
    [HttpPatch("owner-profile")]
    public Task<IActionResult> UpdateOwnerProfile(
        [FromBody] UpdateOwnerProfileRequest request,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_authService, "PATCH /api/v1/account/owner-profile", cancellationToken);
    }
}
