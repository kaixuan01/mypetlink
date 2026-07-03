using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin")]
public sealed class AdminTagInventoryController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAuditLogService _auditLogService;

    public AdminTagInventoryController(IAdminService adminService, IAuditLogService auditLogService)
    {
        _adminService = adminService;
        _auditLogService = auditLogService;
    }

    // TODO: Generate secure random MPL-XXXX-XXXX retail tag codes and export manufacturer CSV.
    [HttpPost("tags/generate")]
    public async Task<IActionResult> Generate([FromBody] GenerateTagCodesRequest request, CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("GenerateTagCodes", "SmartTagBatch", null, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/tags/generate", cancellationToken);
    }

    [HttpGet("tag-batches/{batchNo}/export")]
    public Task<IActionResult> Export(string batchNo, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/tag-batches/{batchNo}/export", cancellationToken);
    }
}
