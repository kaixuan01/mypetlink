using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/sample-experience")]
public sealed class AdminSampleExperienceController : ApiControllerBase
{
    private readonly IAdminSampleExperienceService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminSampleExperienceController(
        IAdminSampleExperienceService service,
        ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetAsync(cancellationToken), HttpContext));

    [HttpPut]
    public async Task<IActionResult> Update(
        [FromBody] UpdateSampleExperienceRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.UpdateAsync(
            _currentUser.Current.UserId,
            request,
            cancellationToken), HttpContext));
}
