using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/owner/profile")]
public sealed class OwnerProfileController : ApiControllerBase
{
    private readonly IOwnerProfileService _ownerProfileService;
    private readonly ICurrentUserService _currentUserService;

    public OwnerProfileController(
        IOwnerProfileService ownerProfileService,
        ICurrentUserService currentUserService)
    {
        _ownerProfileService = ownerProfileService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var response = await _ownerProfileService.GetAsync(
            _currentUserService.Current.UserId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut]
    public async Task<IActionResult> Update(
        [FromBody] UpdateOwnerProfileRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _ownerProfileService.UpdateAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
