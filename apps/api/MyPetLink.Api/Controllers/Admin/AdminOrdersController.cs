using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/orders")]
public sealed class AdminOrdersController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IAuditLogService _auditLogService;

    public AdminOrdersController(IAdminService adminService, IAuditLogService auditLogService)
    {
        _adminService = adminService;
        _auditLogService = auditLogService;
    }

    // TODO: Implement admin order filters and enforce the documented fulfillment transition matrix.
    [HttpGet]
    public Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? paymentStatus,
        [FromQuery] string? search,
        [FromQuery] Guid? ownerId,
        [FromQuery] Guid? petId,
        CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/orders", cancellationToken);
    }

    [HttpGet("{orderId:guid}")]
    public Task<IActionResult> Get(Guid orderId, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_adminService, "GET /api/v1/admin/orders/{orderId}", cancellationToken);
    }

    [HttpPost("{orderId:guid}/confirm-payment")]
    public async Task<IActionResult> ConfirmPayment(Guid orderId, CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("ConfirmPayment", "TagOrder", orderId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/orders/{orderId}/confirm-payment", cancellationToken);
    }

    [HttpPost("{orderId:guid}/reject-payment-proof")]
    public async Task<IActionResult> RejectPaymentProof(
        Guid orderId,
        [FromBody] ReviewPaymentProofRequest request,
        CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("RejectPaymentProof", "TagOrder", orderId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/orders/{orderId}/reject-payment-proof", cancellationToken);
    }

    [HttpPost("{orderId:guid}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid orderId,
        [FromBody] UpdateOrderStatusRequest request,
        CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("UpdateOrderStatus", "TagOrder", orderId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/orders/{orderId}/status", cancellationToken);
    }

    [HttpPost("{orderId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid orderId, CancellationToken cancellationToken)
    {
        await _auditLogService.RecordAsync("CancelOrder", "TagOrder", orderId, cancellationToken);
        return await PlaceholderAsync(_adminService, "POST /api/v1/admin/orders/{orderId}/cancel", cancellationToken);
    }
}
