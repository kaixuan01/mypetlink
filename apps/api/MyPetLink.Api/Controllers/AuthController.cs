using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Route("api/v1/auth")]
public sealed class AuthController : ApiControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    // TODO: Validate Google ID tokens, create/update users, and issue JWT/refresh tokens.
    [AllowAnonymous]
    [HttpPost("google")]
    public Task<IActionResult> Google([FromBody] GoogleLoginRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_authService, "POST /api/v1/auth/google", cancellationToken);
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_authService, "POST /api/v1/auth/refresh", cancellationToken);
    }

    [Authorize]
    [HttpPost("logout")]
    public Task<IActionResult> Logout([FromBody] LogoutRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_authService, "POST /api/v1/auth/logout", cancellationToken);
    }

    [Authorize]
    [HttpGet("me")]
    public Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_authService, "GET /api/v1/auth/me", cancellationToken);
    }
}
