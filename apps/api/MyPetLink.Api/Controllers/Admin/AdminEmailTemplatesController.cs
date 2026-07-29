using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// Per-template email enablement. The global delivery switch is reported in
/// the response but is owned by application configuration and cannot be
/// changed here.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/email-templates")]
public sealed class AdminEmailTemplatesController : ApiControllerBase
{
    private readonly IAdminEmailTemplateService _templates;
    private readonly ICurrentUserService _currentUserService;

    public AdminEmailTemplatesController(
        IAdminEmailTemplateService templates,
        ICurrentUserService currentUserService)
    {
        _templates = templates;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var response = await _templates.ListAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("{messageType}")]
    public async Task<IActionResult> Update(
        string messageType,
        [FromBody] UpdateEmailTemplateRequest request,
        CancellationToken cancellationToken)
    {
        var adminUserId = _currentUserService.Current.UserId
            ?? throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "unauthorized",
                "Authentication is required.");
        var response = await _templates.SetEnabledAsync(
            messageType,
            request,
            adminUserId,
            cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
