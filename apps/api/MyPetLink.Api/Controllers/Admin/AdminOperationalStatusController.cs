using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// Read-only operational status. There is no write endpoint by design:
/// infrastructure configuration is owned by deployment, not by Admin Portal.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/operational-status")]
public sealed class AdminOperationalStatusController : ApiControllerBase
{
    private readonly IAdminOperationalStatusService _status;

    public AdminOperationalStatusController(IAdminOperationalStatusService status)
    {
        _status = status;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var response = await _status.GetAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
