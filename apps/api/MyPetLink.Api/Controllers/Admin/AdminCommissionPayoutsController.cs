using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

[Authorize(Policy = AdminCapabilities.PayoutsView)]
[Route("api/v1/admin/merchant-sales/commission-payouts")]
public sealed class AdminCommissionPayoutsController : ApiControllerBase
{
    private readonly ICommissionPayoutService _service;
    private readonly ICommissionPayoutStatementService _statements;
    private readonly ICurrentUserService _currentUser;

    public AdminCommissionPayoutsController(
        ICommissionPayoutService service,
        ICommissionPayoutStatementService statements,
        ICurrentUserService currentUser)
    {
        _service = service;
        _statements = statements;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] CommissionPayoutQuery query, CancellationToken cancellationToken)
    {
        var (items, total) = await _service.ListAsync(query, cancellationToken);
        return Ok(ApiEnvelope.Ok(items, HttpContext, query.Page, query.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.GetAsync(id, cancellationToken), HttpContext));

    [HttpGet("{id:guid}/statement")]
    [Authorize(Policy = AdminCapabilities.PayoutsView)]
    public async Task<IActionResult> Statement(Guid id, CancellationToken cancellationToken)
    {
        var document = await _statements.GetStatementAsync(id, cancellationToken);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpPost]
    [Authorize(Policy = AdminCapabilities.PayoutsManage)]
    public async Task<IActionResult> Prepare(
        [FromBody] PrepareCommissionPayoutRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.PrepareAsync(
            _currentUser.Current.UserId, request, cancellationToken), HttpContext));

    [HttpPost("{id:guid}/mark-paid")]
    [Authorize(Policy = AdminCapabilities.PayoutsSettle)]
    public async Task<IActionResult> MarkPaid(Guid id,
        [FromBody] MarkCommissionPayoutPaidRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.MarkPaidAsync(
            _currentUser.Current.UserId, id, request, cancellationToken), HttpContext));

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = AdminCapabilities.PayoutsManage)]
    public async Task<IActionResult> Cancel(Guid id,
        [FromBody] CancelCommissionPayoutRequest request, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(await _service.CancelAsync(
            _currentUser.Current.UserId, id, request, cancellationToken), HttpContext));
}
