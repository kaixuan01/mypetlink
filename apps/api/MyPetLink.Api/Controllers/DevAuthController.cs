using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

// DEVELOPMENT-ONLY test authentication helper.
//
// This exists solely so local and CI-style E2E testing can create Owner/Admin
// sessions without driving the real Google OAuth popup. It is NOT a real login
// method and is NOT part of the product:
//   - Every action returns 404 unless ASPNETCORE_ENVIRONMENT=Development.
//   - It reuses the same token service as Google login; it does not bypass JWT
//     validation or any downstream authorization.
//   - There is no production configuration switch that can enable it.
// Do not surface this in customer-facing UI or production docs.
[AllowAnonymous]
[Route("api/v1/dev")]
public sealed class DevAuthController : ApiControllerBase
{
    private readonly IAuthService _authService;
    private readonly IWebHostEnvironment _environment;

    public DevAuthController(IAuthService authService, IWebHostEnvironment environment)
    {
        _authService = authService;
        _environment = environment;
    }

    [HttpPost("test-login")]
    public async Task<IActionResult> TestLogin(
        [FromBody] DevTestLoginRequest request,
        CancellationToken cancellationToken)
    {
        // Outside Development the endpoint behaves as if it does not exist.
        if (!_environment.IsDevelopment())
        {
            return NotFound(ApiEnvelope.Error(HttpContext, "not_found", "Not found."));
        }

        var response = await _authService.SignInWithDevTestUserAsync(
            request,
            GetAuthClientContext(),
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
}
