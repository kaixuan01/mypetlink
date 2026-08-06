using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

// Admin-only. Allocation exposes physical tag codes so an operator can check a
// carton against the system; nothing here has a merchant-facing counterpart,
// and no public route reaches inventory allocation.

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/orders/{merchantOrderId:guid}")]
public sealed class AdminMerchantFulfilmentController : ApiControllerBase
{
    private readonly IMerchantFulfilmentService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantFulfilmentController(
        IMerchantFulfilmentService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    // --- Reading -----------------------------------------------------------

    [HttpGet("allocation")]
    public async Task<IActionResult> GetAllocation(
        Guid merchantOrderId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.GetAllocationSummaryAsync(merchantOrderId, cancellationToken),
            HttpContext));

    [HttpGet("allocation/tags")]
    public async Task<IActionResult> ListAllocatedTags(
        Guid merchantOrderId,
        [FromQuery] bool includeReleased,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.ListAllocatedTagsAsync(
                merchantOrderId, includeReleased, cancellationToken),
            HttpContext));

    /// <summary>
    /// Only inventory that would pass allocation right now. The same rule runs
    /// again inside the allocating transaction, so a stale list can never turn
    /// into a bad allocation.
    /// </summary>
    [HttpGet("allocation/eligible-inventory")]
    public async Task<IActionResult> ListEligibleInventory(
        Guid merchantOrderId,
        [FromQuery] Guid merchantOrderItemId,
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] Guid? batchId,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListEligibleInventoryAsync(
            merchantOrderId, merchantOrderItemId, search, batchId,
            query.Page, query.PageSize, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("fulfilment")]
    public async Task<IActionResult> GetFulfilment(
        Guid merchantOrderId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.GetFulfilmentAsync(merchantOrderId, cancellationToken), HttpContext));

    [HttpGet("delivery-order")]
    public async Task<IActionResult> GetDeliveryOrder(
        Guid merchantOrderId, CancellationToken cancellationToken)
    {
        var document = await _service.GetDeliveryOrderAsync(merchantOrderId, cancellationToken);
        return document is null
            ? NotFound(ApiEnvelope.Error(
                HttpContext,
                "delivery_order_not_ready",
                "No delivery order has been issued for this merchant order yet."))
            : Ok(ApiEnvelope.Ok(document, HttpContext));
    }

    // --- Allocation --------------------------------------------------------

    [HttpPost("allocation")]
    public async Task<IActionResult> Allocate(
        Guid merchantOrderId,
        [FromBody] AllocateMerchantInventoryRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.AllocateAsync(
                _currentUser.Current.UserId, merchantOrderId, request, cancellationToken),
            HttpContext));

    [HttpPost("allocation/auto")]
    public async Task<IActionResult> AutoAllocate(
        Guid merchantOrderId,
        [FromBody] AutoAllocateMerchantInventoryRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.AutoAllocateAsync(
                _currentUser.Current.UserId, merchantOrderId, request, cancellationToken),
            HttpContext));

    [HttpPost("allocation/release")]
    public async Task<IActionResult> Release(
        Guid merchantOrderId,
        [FromBody] ReleaseMerchantInventoryRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.ReleaseAsync(
                _currentUser.Current.UserId, merchantOrderId, request, cancellationToken),
            HttpContext));

    // --- Fulfilment --------------------------------------------------------

    [HttpPost("fulfilment/preparing")]
    public async Task<IActionResult> MarkPreparing(
        Guid merchantOrderId,
        [FromBody] MerchantFulfilmentTransitionRequest? request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.MarkPreparingAsync(
                _currentUser.Current.UserId, merchantOrderId,
                request ?? new MerchantFulfilmentTransitionRequest(), cancellationToken),
            HttpContext));

    [HttpPost("fulfilment/ready-to-ship")]
    public async Task<IActionResult> MarkReadyToShip(
        Guid merchantOrderId,
        [FromBody] MerchantFulfilmentTransitionRequest? request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.MarkReadyToShipAsync(
                _currentUser.Current.UserId, merchantOrderId,
                request ?? new MerchantFulfilmentTransitionRequest(), cancellationToken),
            HttpContext));

    [HttpPost("delivery-order")]
    public async Task<IActionResult> IssueDeliveryOrder(
        Guid merchantOrderId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.IssueDeliveryOrderAsync(
                _currentUser.Current.UserId, merchantOrderId, cancellationToken),
            HttpContext));

    [HttpPost("fulfilment/shipped")]
    public async Task<IActionResult> MarkShipped(
        Guid merchantOrderId,
        [FromBody] MarkMerchantOrderShippedRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.MarkShippedAsync(
                _currentUser.Current.UserId, merchantOrderId, request, cancellationToken),
            HttpContext));

    [HttpPost("fulfilment/delivered")]
    public async Task<IActionResult> MarkDelivered(
        Guid merchantOrderId,
        [FromBody] MerchantFulfilmentTransitionRequest? request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.MarkDeliveredAsync(
                _currentUser.Current.UserId, merchantOrderId,
                request ?? new MerchantFulfilmentTransitionRequest(), cancellationToken),
            HttpContext));
}
