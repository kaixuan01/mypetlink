using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// The seller identity printed on every document. Admin-only: it carries the
/// bank account customers pay into.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/business-identity")]
public sealed class AdminBusinessIdentityController : ApiControllerBase
{
    private readonly IBusinessIdentityService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminBusinessIdentityController(
        IBusinessIdentityService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetAsync(cancellationToken), HttpContext));

    [HttpPut]
    public async Task<IActionResult> Update(
        [FromBody] UpdateBusinessIdentityRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateAsync(_currentUser.Current.UserId, request, cancellationToken),
            HttpContext));
}
