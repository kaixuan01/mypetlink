using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/orders")]
public sealed class OrdersController : ApiControllerBase
{
    private readonly IOrderService _orderService;

    public OrdersController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    // TODO: Create portal-purchased tags bound to active owned pets and keep payment manual.
    [HttpGet]
    public Task<IActionResult> List([FromQuery] PagedQuery query, [FromQuery] string? status, [FromQuery] string? paymentStatus, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_orderService, "GET /api/v1/orders", cancellationToken);
    }

    [HttpGet("{orderNumber}")]
    public Task<IActionResult> Get(string orderNumber, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_orderService, "GET /api/v1/orders/{orderNumber}", cancellationToken);
    }

    [HttpPost]
    public Task<IActionResult> Create([FromBody] CreateTagOrderRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_orderService, "POST /api/v1/orders", cancellationToken);
    }

    [HttpPost("{orderNumber}/payment-proof")]
    public Task<IActionResult> UploadPaymentProof(string orderNumber, [FromBody] UploadPaymentProofRequest request, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_orderService, "POST /api/v1/orders/{orderNumber}/payment-proof", cancellationToken);
    }

    [HttpPost("{orderNumber}/cancel")]
    public Task<IActionResult> Cancel(string orderNumber, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_orderService, "POST /api/v1/orders/{orderNumber}/cancel", cancellationToken);
    }

    [HttpGet("{orderNumber}/receipt")]
    public Task<IActionResult> Receipt(string orderNumber, CancellationToken cancellationToken)
    {
        return PlaceholderAsync(_orderService, "GET /api/v1/orders/{orderNumber}/receipt", cancellationToken);
    }
}
