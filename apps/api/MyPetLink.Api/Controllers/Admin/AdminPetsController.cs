using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/pets")]
public sealed class AdminPetsController : ApiControllerBase
{
    private readonly IAdminService _adminService;

    public AdminPetsController(IAdminService adminService)
    {
        _adminService = adminService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] Guid? ownerId,
        [FromQuery] string? lifecycleStatus,
        [FromQuery] bool? lostMode,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListPetsAsync(
            query.Page,
            query.PageSize,
            lifecycleStatus,
            lostMode,
            ownerId,
            search,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{petId:guid}")]
    public async Task<IActionResult> Get(Guid petId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetPetAsync(petId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
