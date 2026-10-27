using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

/// <summary>
/// Consignment settlement statements and partner remittances. Every endpoint needs
/// the settlement view capability; writing needs its own capability as well.
/// </summary>
[ApiController]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[Authorize(Policy = AdminCapabilities.ConsignmentSettlementsView)]
[Route("api/v1/admin/merchant-sales/consignment-settlements")]
public sealed class AdminConsignmentSettlementsController(ConsignmentService service, ICurrentUserService current) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PagedQuery q, Guid? merchantId, string? status, string? attention, CancellationToken ct)
    {
        var (items, total) = await service.SettlementsAsync(q.Page, q.PageSize, merchantId, status, attention, ct);
        return Ok(ApiEnvelope.Ok(items, HttpContext, q.Page, q.PageSize, total));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.GetSettlementAsync(id, ct), HttpContext));

    [HttpGet("{id:guid}/statement.csv")]
    public async Task<IActionResult> Statement(Guid id, CancellationToken ct) =>
        File(await service.SettlementStatementCsvAsync(current.Current.UserId, id, ct), "text/csv; charset=utf-8", "Consignment-settlement-statement.csv");

    [HttpPost("{id:guid}/receipts")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSettlementsRecordReceipt)]
    public async Task<IActionResult> RecordReceipt(Guid id, RecordConsignmentSettlementReceiptRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.RecordSettlementReceiptAsync(current.Current.UserId, id, r, ct), HttpContext));

    [HttpPost("{id:guid}/receipts/{receiptId:guid}/void")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSettlementsRecordReceipt)]
    public async Task<IActionResult> VoidReceipt(Guid id, Guid receiptId, VoidConsignmentSettlementReceiptRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.VoidSettlementReceiptAsync(current.Current.UserId, id, receiptId, r, ct), HttpContext));

    [HttpPost("{id:guid}/resolve-attribution")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSettlementsResolve)]
    public async Task<IActionResult> ResolveAttribution(Guid id, ResolveConsignmentAttributionRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ResolveSettlementAttributionAsync(current.Current.UserId, id, r, ct), HttpContext));

    [HttpPost("{id:guid}/recalculate")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSettlementsResolve)]
    public async Task<IActionResult> Recalculate(Guid id, RecalculateConsignmentSettlementRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.RecalculateSettlementAsync(current.Current.UserId, id, r, ct), HttpContext));
}

/// <summary>
/// A salesperson's recorded commission terms. Reading them is commission accounting;
/// recording or ending them changes what future sales earn, so it needs rule management.
/// </summary>
[ApiController]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[Authorize(Policy = AdminCapabilities.SalesCommissionsView)]
[Route("api/v1/admin/merchant-sales/salespersons/{salespersonId:guid}/commission-policies")]
public sealed class AdminSalespersonCommissionPoliciesController(ICommissionPolicyService service, ICurrentUserService current) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List(Guid salespersonId, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ListAsync(salespersonId, ct), HttpContext));

    [HttpPost]
    [Authorize(Policy = AdminCapabilities.SalesCommissionRulesManage)]
    public async Task<IActionResult> Record(Guid salespersonId, RecordSalespersonPolicyAssignmentRequest r, CancellationToken ct) =>
        StatusCode(201, ApiEnvelope.Ok(await service.RecordAsync(current.Current.UserId, salespersonId, r, ct), HttpContext));

    [HttpPost("{id:guid}/end")]
    [Authorize(Policy = AdminCapabilities.SalesCommissionRulesManage)]
    public async Task<IActionResult> End(Guid salespersonId, Guid id, EndSalespersonPolicyAssignmentRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.EndAsync(current.Current.UserId, salespersonId, id, r, ct), HttpContext));
}
