using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/delivery-rates")]
public sealed class AdminDeliveryRatesController : ApiControllerBase
{
    private readonly IDeliveryService _service;
    private readonly ICurrentUserService _currentUser;
    public AdminDeliveryRatesController(IDeliveryService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.ListRatesAsync(cancellationToken), HttpContext));

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertDeliveryRateRequest request, CancellationToken cancellationToken) =>
        StatusCode(201, ApiEnvelope.Ok(await _service.CreateRateAsync(_currentUser.Current.UserId, request, cancellationToken), HttpContext));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertDeliveryRateRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.UpdateRateAsync(_currentUser.Current.UserId, id, request, cancellationToken), HttpContext));
}
