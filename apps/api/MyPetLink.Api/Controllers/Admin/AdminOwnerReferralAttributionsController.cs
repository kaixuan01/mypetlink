using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/referral-attributions")]
public sealed class AdminOwnerReferralAttributionsController : ApiControllerBase
{
    private readonly IOwnerReferralAttributionService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminOwnerReferralAttributionsController(
        IOwnerReferralAttributionService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    [Authorize(Policy = AuthorizationPolicies.SalesPerformance)]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] string? search,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListAsync(
            query.Page, query.PageSize, search, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{userId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.SalesPerformance)]
    public async Task<IActionResult> Get(Guid userId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetAsync(userId, cancellationToken), HttpContext));

    [HttpPut("{userId:guid}")]
    [Authorize(Policy = AuthorizationPolicies.SalesAdministration)]
    public async Task<IActionResult> Correct(
        Guid userId,
        [FromBody] CorrectOwnerReferralAttributionRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.CorrectAsync(
            _currentUser.Current.UserId, userId, request, cancellationToken), HttpContext));
}
