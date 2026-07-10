using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/owners")]
public sealed class AdminOwnersController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminOwnersController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] string? plan,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListOwnersAsync(
            query.Page,
            query.PageSize,
            search,
            plan,
            status,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{ownerId:guid}")]
    public async Task<IActionResult> Get(Guid ownerId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetOwnerAsync(ownerId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
