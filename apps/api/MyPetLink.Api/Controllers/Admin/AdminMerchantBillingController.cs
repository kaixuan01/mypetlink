using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

// Admin-only, like the rest of Merchant Sales. A merchant never signs in, so
// there is no merchant-facing counterpart to any of these routes — invoices and
// receipts reach them as email attachments, never as a link they can open.

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/invoices")]
public sealed class AdminMerchantInvoicesController : ApiControllerBase
{
    private readonly IMerchantBillingService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantInvoicesController(
        IMerchantBillingService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] Guid? merchantId,
        [FromQuery] DateTimeOffset? fromDate,
        [FromQuery] DateTimeOffset? toDate,
        [FromQuery] string? merchantOrderIds,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListInvoicesAsync(
            query.Page, query.PageSize, search, ParseStatus(status), merchantId,
            fromDate, toDate, ParseIds(merchantOrderIds), cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetInvoiceAsync(id, cancellationToken), HttpContext));

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.CancelInvoiceAsync(
                _currentUser.Current.UserId, id, request?.ConcurrencyToken, cancellationToken),
            HttpContext));

    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> RecordPayment(
        Guid id, [FromBody] RecordMerchantPaymentRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.RecordPaymentAsync(
                _currentUser.Current.UserId, id, request, cancellationToken),
            HttpContext));

    private static MerchantInvoiceStatus? ParseStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        return Enum.TryParse<MerchantInvoiceStatus>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new ApiException(400, "validation_failed", "Please check the submitted fields.",
                new Dictionary<string, string[]> { ["status"] = ["That invoice status is not valid."] });
    }

    /// <summary>Unparseable entries are ignored rather than failing the page.</summary>
    private static IReadOnlyCollection<Guid> ParseIds(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(part => Guid.TryParse(part, out var parsed) ? parsed : (Guid?)null)
                .Where(parsed => parsed.HasValue)
                .Select(parsed => parsed!.Value)
                .ToArray();
}

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/orders/{merchantOrderId:guid}/invoice")]
public sealed class AdminMerchantOrderInvoiceController : ApiControllerBase
{
    private readonly IMerchantBillingService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantOrderInvoiceController(
        IMerchantBillingService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    /// <summary>
    /// Issues the order's invoice. Calling it again returns the invoice that
    /// already exists rather than billing the merchant twice.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Issue(
        Guid merchantOrderId,
        [FromBody] IssueMerchantInvoiceRequest? request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.IssueInvoiceAsync(
                _currentUser.Current.UserId,
                merchantOrderId,
                request ?? new IssueMerchantInvoiceRequest(),
                cancellationToken),
            HttpContext));
}

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales/commissions")]
public sealed class AdminSalesCommissionsController : ApiControllerBase
{
    private readonly IMerchantBillingService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminSalesCommissionsController(
        IMerchantBillingService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] Guid? salespersonId,
        [FromQuery] string? status,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListCommissionsAsync(
            query.Page, query.PageSize, salespersonId, ParseStatus(status), cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost("{id:guid}/mark-paid")]
    public async Task<IActionResult> MarkPaid(
        Guid id, [FromBody] ConcurrencyTokenRequest? request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.MarkCommissionPaidAsync(
                _currentUser.Current.UserId, id, request?.ConcurrencyToken, cancellationToken),
            HttpContext));

    private static SalesCommissionStatus? ParseStatus(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        return Enum.TryParse<SalesCommissionStatus>(value, ignoreCase: true, out var parsed)
            ? parsed
            : throw new ApiException(400, "validation_failed", "Please check the submitted fields.",
                new Dictionary<string, string[]> { ["status"] = ["That commission status is not valid."] });
    }
}

/// <summary>
/// Read-only projections for the Merchant Sales workspace: the overview
/// counters, and the email state of a page of documents in one request.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales")]
public sealed class AdminMerchantSalesOverviewController : ApiControllerBase
{
    private readonly IMerchantSalesOverviewService _service;

    public AdminMerchantSalesOverviewController(IMerchantSalesOverviewService service)
    {
        _service = service;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetOverviewAsync(cancellationToken), HttpContext));

    [HttpGet("email-status")]
    public async Task<IActionResult> EmailStatus(
        [FromQuery] string? quotationIds,
        [FromQuery] string? invoiceIds,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.GetEmailStatusesAsync(
                ParseIds(quotationIds), ParseIds(invoiceIds), cancellationToken),
            HttpContext));

    /// <summary>Unparseable entries are ignored rather than failing the page.</summary>
    private static IReadOnlyCollection<Guid> ParseIds(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? []
            : value
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(part => Guid.TryParse(part, out var parsed) ? parsed : (Guid?)null)
                .Where(parsed => parsed.HasValue)
                .Select(parsed => parsed!.Value)
                .ToArray();
}
