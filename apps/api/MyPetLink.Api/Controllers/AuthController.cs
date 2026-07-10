using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
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

    [AllowAnonymous]
    [HttpPost("google")]
    public async Task<IActionResult> Google([FromBody] GoogleLoginRequest request, CancellationToken cancellationToken)
    {
        var response = await _authService.SignInWithGoogleAsync(
            request,
            GetAuthClientContext(),
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest request, CancellationToken cancellationToken)
    {
        var response = await _authService.RefreshAsync(
            request,
            GetAuthClientContext(),
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest request, CancellationToken cancellationToken)
    {
        await _authService.LogoutAsync(request, GetAuthClientContext(), cancellationToken);
        return NoContent();
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var response = await _authService.GetCurrentSessionAsync(
            UserIdFromClaims(),
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    private AuthClientContext GetAuthClientContext()
    {
        var userAgent = Request.Headers.TryGetValue("User-Agent", out var values)
            ? values.ToString()
            : null;

        return new AuthClientContext(HttpContext.Connection.RemoteIpAddress?.ToString(), userAgent);
    }

    private Guid? UserIdFromClaims()
    {
        var current = HttpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return Guid.TryParse(current, out var userId) ? userId : null;
    }
}
