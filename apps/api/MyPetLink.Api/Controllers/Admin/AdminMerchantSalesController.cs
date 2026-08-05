using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

// Merchant Sales is Admin-only. There is no merchant-facing surface: a merchant
// never signs in, so none of these routes have an owner or public counterpart.

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/merchants")]
public sealed class AdminMerchantsController : ApiControllerBase
{
    private readonly IMerchantSalesService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantsController(IMerchantSalesService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        [FromQuery] Guid? salespersonId,
        [FromQuery] string? state,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListMerchantsAsync(
            query.Page, query.PageSize, search, isActive, salespersonId, state, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetMerchantAsync(id, cancellationToken), HttpContext));

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] UpsertMerchantRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.CreateMerchantAsync(_currentUser.Current.UserId, request, cancellationToken),
            HttpContext));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id, [FromBody] UpsertMerchantRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateMerchantAsync(_currentUser.Current.UserId, id, request, cancellationToken),
            HttpContext));

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.SetMerchantActiveAsync(
                _currentUser.Current.UserId, id, true, request?.ConcurrencyToken, cancellationToken),
            HttpContext));

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.SetMerchantActiveAsync(
                _currentUser.Current.UserId, id, false, request?.ConcurrencyToken, cancellationToken),
            HttpContext));
}

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/salespersons")]
public sealed class AdminSalespersonsController : ApiControllerBase
{
    private readonly IMerchantSalesService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminSalespersonsController(IMerchantSalesService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListSalespersonsAsync(
            query.Page, query.PageSize, search, isActive, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetSalespersonAsync(id, cancellationToken), HttpContext));

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] UpsertSalespersonRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.CreateSalespersonAsync(_currentUser.Current.UserId, request, cancellationToken),
            HttpContext));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id, [FromBody] UpsertSalespersonRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateSalespersonAsync(_currentUser.Current.UserId, id, request, cancellationToken),
            HttpContext));

    [HttpPost("{id:guid}/activate")]
    public async Task<IActionResult> Activate(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.SetSalespersonActiveAsync(
                _currentUser.Current.UserId, id, true, request?.ConcurrencyToken, cancellationToken),
            HttpContext));

    [HttpPost("{id:guid}/deactivate")]
    public async Task<IActionResult> Deactivate(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.SetSalespersonActiveAsync(
                _currentUser.Current.UserId, id, false, request?.ConcurrencyToken, cancellationToken),
            HttpContext));
}

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/quotations")]
public sealed class AdminMerchantQuotationsController : ApiControllerBase
{
    private readonly IMerchantSalesService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantQuotationsController(
        IMerchantSalesService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] MerchantQuotationStatus? status,
        [FromQuery] Guid? merchantId,
        [FromQuery] Guid? salespersonId,
        [FromQuery] DateTimeOffset? fromDate,
        [FromQuery] DateTimeOffset? toDate,
        [FromQuery] bool? expired,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListQuotationsAsync(
            query.Page, query.PageSize, search, status, merchantId, salespersonId,
            fromDate, toDate, expired, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetQuotationAsync(id, cancellationToken), HttpContext));

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] UpsertQuotationRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.CreateQuotationAsync(_currentUser.Current.UserId, request, cancellationToken),
            HttpContext));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id, [FromBody] UpsertQuotationRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateQuotationAsync(_currentUser.Current.UserId, id, request, cancellationToken),
            HttpContext));

    [HttpPost("{id:guid}/send")]
    public Task<IActionResult> Send(Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        TransitionAsync(id, MerchantQuotationStatus.Sent, request, cancellationToken);

    [HttpPost("{id:guid}/accept")]
    public Task<IActionResult> Accept(Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        TransitionAsync(id, MerchantQuotationStatus.Accepted, request, cancellationToken);

    [HttpPost("{id:guid}/reject")]
    public Task<IActionResult> Reject(Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        TransitionAsync(id, MerchantQuotationStatus.Rejected, request, cancellationToken);

    [HttpPost("{id:guid}/expire")]
    public Task<IActionResult> Expire(Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        TransitionAsync(id, MerchantQuotationStatus.Expired, request, cancellationToken);

    [HttpPost("{id:guid}/cancel")]
    public Task<IActionResult> Cancel(Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        TransitionAsync(id, MerchantQuotationStatus.Cancelled, request, cancellationToken);

    [HttpPost("{id:guid}/convert")]
    public async Task<IActionResult> Convert(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.ConvertQuotationAsync(
                _currentUser.Current.UserId, id, request?.ConcurrencyToken, cancellationToken),
            HttpContext));

    private async Task<IActionResult> TransitionAsync(
        Guid id,
        MerchantQuotationStatus target,
        ConcurrencyTokenRequest? request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.TransitionQuotationAsync(
                _currentUser.Current.UserId, id, target, request?.ConcurrencyToken, cancellationToken),
            HttpContext));
}

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/orders")]
public sealed class AdminMerchantOrdersController : ApiControllerBase
{
    private readonly IMerchantSalesService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantOrdersController(IMerchantSalesService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] MerchantOrderPaymentStatus? paymentStatus,
        [FromQuery] Guid? merchantId,
        [FromQuery] Guid? salespersonId,
        [FromQuery] DateTimeOffset? fromDate,
        [FromQuery] DateTimeOffset? toDate,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListMerchantOrdersAsync(
            query.Page, query.PageSize, search, paymentStatus, merchantId, salespersonId,
            fromDate, toDate, cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetMerchantOrderAsync(id, cancellationToken), HttpContext));

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.CancelMerchantOrderAsync(
                _currentUser.Current.UserId, id, request?.ConcurrencyToken, cancellationToken),
            HttpContext));
}
