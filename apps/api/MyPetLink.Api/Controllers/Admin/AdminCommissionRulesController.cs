using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/commission-rules")]
public sealed class AdminCommissionRulesController : ApiControllerBase
{
    private readonly ICommissionRuleService _service;
    private readonly ICurrentUserService _currentUser;

    public AdminCommissionRulesController(
        ICommissionRuleService service,
        ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PagedQuery query,
        [FromQuery] Guid? salespersonId,
        [FromQuery] bool? isActive,
        CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListAsync(
            query.Page, query.PageSize, salespersonId, isActive, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] UpsertCommissionRuleRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.CreateAsync(
                _currentUser.Current.UserId, request, cancellationToken),
            HttpContext));

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromBody] UpsertCommissionRuleRequest request,
        CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _service.UpdateAsync(
                _currentUser.Current.UserId, id, request, cancellationToken),
            HttpContext));
}
