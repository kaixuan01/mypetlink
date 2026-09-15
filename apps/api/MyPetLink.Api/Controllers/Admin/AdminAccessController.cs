using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// Access Management — the people who can use the Admin Portal.
///
/// Every action names the capability it needs. The Admin Portal hides what an
/// operator cannot do, but these policies are what actually decide: calling
/// one of these routes directly without the capability returns 403.
/// </summary>
[Authorize(Policy = AdminCapabilities.AdminUsersView)]
[Route("api/v1/admin/access/users")]
public sealed class AdminAccessUsersController : ApiControllerBase
{
    private readonly IAdminAccessManagementService _accessManagement;

    public AdminAccessUsersController(IAdminAccessManagementService accessManagement)
    {
        _accessManagement = accessManagement;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] Guid? roleId,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _accessManagement.ListUsersAsync(
            query.Page, query.PageSize, search, status, roleId, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{adminUserId:guid}")]
    public async Task<IActionResult> Get(Guid adminUserId, CancellationToken cancellationToken)
    {
        var response = await _accessManagement.GetUserAsync(adminUserId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("{adminUserId:guid}/roles")]
    [Authorize(Policy = AdminCapabilities.AdminUsersManage)]
    public async Task<IActionResult> UpdateRoles(
        Guid adminUserId,
        [FromBody] UpdateAdminUserRolesRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _accessManagement.UpdateUserRolesAsync(
            adminUserId, request, cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{adminUserId:guid}/activate")]
    [Authorize(Policy = AdminCapabilities.AdminUsersManage)]
    public async Task<IActionResult> Activate(
        Guid adminUserId,
        [FromBody] SetAdminUserActiveRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _accessManagement.SetUserActiveAsync(
            adminUserId, isActive: true, request, cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{adminUserId:guid}/deactivate")]
    [Authorize(Policy = AdminCapabilities.AdminUsersManage)]
    public async Task<IActionResult> Deactivate(
        Guid adminUserId,
        [FromBody] SetAdminUserActiveRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _accessManagement.SetUserActiveAsync(
            adminUserId, isActive: false, request, cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}

/// <summary>Roles — reusable sets of permissions that admin users are given.</summary>
[Authorize(Policy = AdminCapabilities.AdminRolesView)]
[Route("api/v1/admin/access/roles")]
public sealed class AdminAccessRolesController : ApiControllerBase
{
    private readonly IAdminAccessManagementService _accessManagement;

    public AdminAccessRolesController(IAdminAccessManagementService accessManagement)
    {
        _accessManagement = accessManagement;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        var response = await _accessManagement.ListRolesAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("capabilities")]
    public async Task<IActionResult> Capabilities(CancellationToken cancellationToken)
    {
        var response = await _accessManagement.GetCapabilityCatalogAsync(cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpGet("{roleId:guid}")]
    public async Task<IActionResult> Get(Guid roleId, CancellationToken cancellationToken)
    {
        var response = await _accessManagement.GetRoleAsync(roleId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost]
    [Authorize(Policy = AdminCapabilities.AdminRolesManage)]
    public async Task<IActionResult> Create(
        [FromBody] CreateAdminRoleRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _accessManagement.CreateRoleAsync(request, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPut("{roleId:guid}")]
    [Authorize(Policy = AdminCapabilities.AdminRolesManage)]
    public async Task<IActionResult> Update(
        Guid roleId,
        [FromBody] UpdateAdminRoleRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _accessManagement.UpdateRoleAsync(roleId, request, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpDelete("{roleId:guid}")]
    [Authorize(Policy = AdminCapabilities.AdminRolesManage)]
    public async Task<IActionResult> Delete(Guid roleId, CancellationToken cancellationToken)
    {
        await _accessManagement.DeleteRoleAsync(roleId, cancellationToken);
        return NoContent();
    }
}
