using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/orders")]
public sealed class OrdersController : ApiControllerBase
{
    private readonly IOrderService _orderService;
    private readonly IOrderDocumentService _orderDocumentService;
    private readonly ICurrentUserService _currentUserService;

    public OrdersController(
        IOrderService orderService,
        IOrderDocumentService orderDocumentService,
        ICurrentUserService currentUserService)
    {
        _orderService = orderService;
        _orderDocumentService = orderDocumentService;
        _currentUserService = currentUserService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? status,
        [FromQuery] string? paymentStatus,
        [FromQuery] Guid? petId,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _orderService.ListAsync(
            _currentUserService.Current.UserId,
            query.Page,
            query.PageSize,
            status,
            paymentStatus,
            petId,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{orderNumber}")]
    public async Task<IActionResult> Get(string orderNumber, CancellationToken cancellationToken)
    {
        var response = await _orderService.GetAsync(
            _currentUserService.Current.UserId,
            orderNumber,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateTagOrderRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _orderService.CreateAsync(
            _currentUserService.Current.UserId,
            request,
            cancellationToken);

        return CreatedAtAction(
            nameof(Get),
            new { orderNumber = response.Order.OrderNumber },
            ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderNumber}/payment-proof")]
    public async Task<IActionResult> UploadPaymentProof(
        string orderNumber,
        [FromBody] UploadPaymentProofRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _orderService.SubmitPaymentProofAsync(
            _currentUserService.Current.UserId,
            orderNumber,
            request,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    [HttpPost("{orderNumber}/cancel")]
    public async Task<IActionResult> Cancel(string orderNumber, CancellationToken cancellationToken)
    {
        var response = await _orderService.CancelAsync(
            _currentUserService.Current.UserId,
            orderNumber,
            cancellationToken);

        return Ok(ApiEnvelope.Ok(response, HttpContext));
    }

    // Order Summary PDF: available in any state (before payment is confirmed).
    [HttpGet("{orderNumber}/summary.pdf")]
    public async Task<IActionResult> SummaryPdf(string orderNumber, CancellationToken cancellationToken)
    {
        var document = await _orderDocumentService.GetOwnerSummaryAsync(
            _currentUserService.Current.UserId,
            orderNumber,
            cancellationToken);

        return File(document.Content, document.ContentType, document.FileName);
    }

    // Official Receipt PDF: only after payment is confirmed (service enforces).
    [HttpGet("{orderNumber}/receipt.pdf")]
    public async Task<IActionResult> ReceiptPdf(string orderNumber, CancellationToken cancellationToken)
    {
        var document = await _orderDocumentService.GetOwnerReceiptAsync(
            _currentUserService.Current.UserId,
            orderNumber,
            cancellationToken);

        return File(document.Content, document.ContentType, document.FileName);
    }
}
