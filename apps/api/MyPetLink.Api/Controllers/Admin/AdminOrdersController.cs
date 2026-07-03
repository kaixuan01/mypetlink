using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/orders")]
public sealed class AdminOrdersController : ApiControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ICurrentUserService _currentUserService;

    public AdminOrdersController(IAdminService adminService, ICurrentUserService currentUserService)
    {
        _adminService = adminService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? paymentStatus,
        [FromQuery] Guid? petId,
        [FromQuery] Guid? ownerId,
        [FromQuery] string? tagType,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _adminService.ListOrdersAsync(
            query.Page,
            query.PageSize,
            status,
            paymentStatus,
            petId,
            ownerId,
            tagType,
            search,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{orderId:guid}")]
    public async Task<IActionResult> Get(Guid orderId, CancellationToken cancellationToken)
    {
        var response = await _adminService.GetOrderAsync(orderId, cancellationToken);
        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderId:guid}/confirm-payment")]
    public async Task<IActionResult> ConfirmPayment(Guid orderId, CancellationToken cancellationToken)
    {
        var response = await _adminService.ConfirmPaymentAsync(
            _currentUserService.Current.UserId,
            orderId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderId:guid}/reject-payment-proof")]
    public async Task<IActionResult> RejectPaymentProof(
        Guid orderId,
        [FromBody] RejectPaymentProofRequest? request,
        CancellationToken cancellationToken)
    {
        var response = await _adminService.RejectPaymentProofAsync(
            _currentUserService.Current.UserId,
            orderId,
            request?.Reason,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderId:guid}/mark-preparing")]
    public async Task<IActionResult> MarkPreparing(Guid orderId, CancellationToken cancellationToken)
    {
        var response = await _adminService.MarkOrderPreparingAsync(
            _currentUserService.Current.UserId,
            orderId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderId:guid}/mark-shipped")]
    public async Task<IActionResult> MarkShipped(
        Guid orderId,
        [FromBody] MarkOrderShippedRequest? request,
        CancellationToken cancellationToken)
    {
        var response = await _adminService.MarkOrderShippedAsync(
            _currentUserService.Current.UserId,
            orderId,
            request?.TrackingNumber,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderId:guid}/mark-delivered")]
    public async Task<IActionResult> MarkDelivered(Guid orderId, CancellationToken cancellationToken)
    {
        var response = await _adminService.MarkOrderDeliveredAsync(
            _currentUserService.Current.UserId,
            orderId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    // Compatibility route matching the documented V1 contract; dispatches to the
    // same transition logic as the explicit mark-* routes.
    [HttpPost("{orderId:guid}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid orderId,
        [FromBody] UpdateOrderStatusRequest request,
        CancellationToken cancellationToken)
    {
        var userId = _currentUserService.Current.UserId;
        var response = request.Status switch
        {
            OrderStatus.PreparingTag => await _adminService.MarkOrderPreparingAsync(userId, orderId, cancellationToken),
            OrderStatus.Shipped => await _adminService.MarkOrderShippedAsync(userId, orderId, request.TrackingNumber, cancellationToken),
            OrderStatus.Delivered => await _adminService.MarkOrderDeliveredAsync(userId, orderId, cancellationToken),
            _ => throw new ApiException(
                StatusCodes.Status400BadRequest,
                "validation_failed",
                "Please check the submitted fields.",
                new Dictionary<string, string[]>
                {
                    ["status"] = ["Only PreparingTag, Shipped, or Delivered are supported here."]
                })
        };

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid orderId, CancellationToken cancellationToken)
    {
        var response = await _adminService.CancelOrderAsync(
            _currentUserService.Current.UserId,
            orderId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }
}
