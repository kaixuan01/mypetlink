using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers;

[Authorize]
[Route("api/v1/delivery")]
public sealed class DeliveryController : ApiControllerBase
{
    private readonly IDeliveryService _deliveryService;
    public DeliveryController(IDeliveryService deliveryService) => _deliveryService = deliveryService;

    [HttpGet("states")]
    public IActionResult States() => Ok(ApiEnvelope.Ok(_deliveryService.ListStates(), HttpContext));

    [HttpPost("quote")]
    public async Task<IActionResult> Quote([FromBody] DeliveryQuoteRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _deliveryService.QuoteAsync(request, cancellationToken), HttpContext));
}
