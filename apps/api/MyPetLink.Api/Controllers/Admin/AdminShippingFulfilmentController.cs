using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/shipping-fulfilment")]
public sealed class AdminShippingFulfilmentController : ApiControllerBase
{
    private readonly IShippingFulfilmentService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminShippingFulfilmentController(
        IShippingFulfilmentService service,
        ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetAdminAsync(cancellationToken), HttpContext));

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings(
        [FromBody] UpdateShippingSettingsRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateSettingsAsync(_currentUser.Current.UserId, request, cancellationToken),
            HttpContext));

    [HttpGet("courier-options")]
    public async Task<IActionResult> CourierOptions(CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.ListActiveCourierOptionsAsync(cancellationToken),
            HttpContext));

    [HttpPost("couriers")]
    public async Task<IActionResult> CreateCourier(
        [FromBody] CreateShippingCourierRequest request,
        CancellationToken cancellationToken) =>
        StatusCode(201, ApiEnvelope.Ok(
            await _service.CreateCourierAsync(_currentUser.Current.UserId, request, cancellationToken),
            HttpContext));

    [HttpPut("couriers/{courierId:guid}")]
    public async Task<IActionResult> UpdateCourier(
        Guid courierId,
        [FromBody] UpdateShippingCourierRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateCourierAsync(_currentUser.Current.UserId, courierId, request, cancellationToken),
            HttpContext));

    [HttpPost("couriers/{courierId:guid}/active")]
    public async Task<IActionResult> SetCourierActive(
        Guid courierId,
        [FromBody] SetShippingCourierActiveRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.SetCourierActiveAsync(_currentUser.Current.UserId, courierId, request, cancellationToken),
            HttpContext));

    [HttpPost("couriers/{courierId:guid}/default")]
    public async Task<IActionResult> SetDefaultCourier(
        Guid courierId,
        [FromBody] SetDefaultShippingCourierRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.SetDefaultCourierAsync(_currentUser.Current.UserId, courierId, request, cancellationToken),
            HttpContext));
}
