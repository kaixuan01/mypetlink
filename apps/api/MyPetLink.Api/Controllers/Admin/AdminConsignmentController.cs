using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;
using MyPetLink.Api.Validation;

namespace MyPetLink.Api.Controllers.Admin;

[ApiController]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
[Authorize(Policy = AdminCapabilities.ConsignmentView)]
[Route("api/v1/admin/merchant-sales/consignment")]
public sealed class AdminConsignmentController(ConsignmentService service, ConsignmentDocumentService documents,
    ICurrentUserService current) : ControllerBase
{
    [HttpGet("approval-policy")]
    public async Task<IActionResult> ApprovalPolicy(CancellationToken ct)=>
        Ok(ApiEnvelope.Ok(await service.ApprovalPolicyAsync(current.Current.UserId,ct),HttpContext));
    [HttpPut("approval-policy")]
    [Authorize(Policy=AdminCapabilities.ConsignmentPolicyManage)]
    public async Task<IActionResult> SaveApprovalPolicy(SaveConsignmentApprovalPolicyRequest r,CancellationToken ct)=>
        Ok(ApiEnvelope.Ok(await service.SaveApprovalPolicyAsync(current.Current.UserId,r,ct),HttpContext));
    [HttpGet("review-log.csv")]
    [Authorize(Policy=AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> ReviewLog(DateTimeOffset from,DateTimeOffset to,CancellationToken ct)=>
        File(await service.ReviewLogCsvAsync(current.Current.UserId,from,to,ct),"text/csv; charset=utf-8","Consignment-review-log.csv");
    [HttpGet("agreements")]
    public async Task<IActionResult> Agreements([FromQuery] PagedQuery q, Guid? merchantId, CancellationToken ct) {
        var (items,total) = await service.AgreementsAsync(q.Page,q.PageSize,merchantId,ct);
        return Ok(ApiEnvelope.Ok(items,HttpContext,q.Page,q.PageSize,total));
    }
    [HttpPost("agreements")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsManage)]
    public async Task<IActionResult> Create(SaveConsignmentAgreementRequest r, CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.SaveAgreementAsync(current.Current.UserId,null,r,null,ct),HttpContext));
    [HttpPut("agreements/{id:guid}")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsManage)]
    public async Task<IActionResult> Update(Guid id, SaveConsignmentAgreementRequest r, [FromQuery] string concurrencyToken, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.SaveAgreementAsync(current.Current.UserId,id,r,concurrencyToken,ct),HttpContext));
    [HttpPost("agreements/{id:guid}/approve")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsApprove)]
    public async Task<IActionResult> Approve(Guid id, ConsignmentActionRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.AgreementActionAsync(current.Current.UserId,id,"approve",r,ct),HttpContext));
    [HttpPost("agreements/{id:guid}/close")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsApprove)]
    public async Task<IActionResult> Close(Guid id, ConsignmentActionRequest r, CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.AgreementActionAsync(current.Current.UserId,id,"close",r,ct),HttpContext));
    [HttpGet("dispatches")]
    public async Task<IActionResult> Dispatches([FromQuery] PagedQuery q, Guid? agreementId, CancellationToken ct) {
        var (items,total) = await service.DispatchesAsync(q.Page,q.PageSize,agreementId,ct);
        return Ok(ApiEnvelope.Ok(items,HttpContext,q.Page,q.PageSize,total));
    }
    [HttpGet("dispatches/{id:guid}")]
    public async Task<IActionResult> Get(Guid id,CancellationToken ct) => Ok(ApiEnvelope.Ok(await service.GetAsync(id,false,ct),HttpContext));
    [HttpPost("dispatches")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAllocate)]
    public async Task<IActionResult> Reserve(ReserveConsignmentRequest r,CancellationToken ct) {
        var result = await service.ReserveAsync(current.Current.UserId,r,ct);
        return StatusCode(result.ReservationReused ? 200 : 201,ApiEnvelope.Ok(result,HttpContext));
    }
    [HttpPost("dispatches/{id:guid}/dispatch")]
    [Authorize(Policy = AdminCapabilities.ConsignmentDispatch)]
    public Task<IActionResult> Dispatch(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"dispatch",r,ct);
    [HttpPost("dispatches/{id:guid}/receive")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReconcile)]
    public Task<IActionResult> Receive(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"receive",r,ct);
    [HttpPost("dispatches/{id:guid}/external-handover")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReconcile)]
    public Task<IActionResult> Handover(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"external-handover",r,ct);
    [HttpPost("dispatches/{id:guid}/correct-handover")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReconcile)]
    public Task<IActionResult> CorrectHandover(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"correct-handover",r,ct);
    [HttpPost("dispatches/{id:guid}/reverse-handover")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReconcile)]
    public Task<IActionResult> ReverseHandover(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"reverse-handover",r,ct);
    [HttpPost("dispatches/{id:guid}/record-discrepancy")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReconcile)]
    public Task<IActionResult> Discrepancy(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"record-discrepancy",r,ct);
    [HttpPost("dispatches/{id:guid}/resolve-discrepancy")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReconcile)]
    public Task<IActionResult> ResolveDiscrepancy(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"resolve-discrepancy",r,ct);
    [HttpPost("dispatches/{id:guid}/write-off")]
    [Authorize(Policy = AdminCapabilities.ConsignmentWriteOff)]
    public Task<IActionResult> WriteOff(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"write-off",r,ct);
    [HttpPost("dispatches/{id:guid}/cancel")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAllocate)]
    public Task<IActionResult> Cancel(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"cancel",r,ct);
    [HttpPost("dispatches/{id:guid}/return")]
    [Authorize(Policy = AdminCapabilities.ConsignmentReturn)]
    public Task<IActionResult> Return(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"return",r,ct);
    [HttpPost("dispatches/{id:guid}/release")]
    [Authorize(Policy = AdminCapabilities.ConsignmentRelease)]
    public Task<IActionResult> Release(Guid id,ConsignmentActionRequest r,CancellationToken ct) => Act(id,"release",r,ct);
    [HttpGet("dispatches/{id:guid}/manifest")]
    [Authorize(Policy = AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> Manifest(Guid id,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await documents.ManifestAsync(current.Current.UserId,id,ct),HttpContext));
    [HttpGet("dispatches/{id:guid}/manifest.csv")]
    [Authorize(Policy = AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> Csv(Guid id,CancellationToken ct) =>
        File(await documents.CsvAsync(current.Current.UserId,id,ct),"text/csv; charset=utf-8","Consignment-"+id+".csv");
    [HttpGet("dispatches/{id:guid}/dispatch-note.pdf")]
    public async Task<IActionResult> Pdf(Guid id,CancellationToken ct) {
        var file = await documents.PdfAsync(current.Current.UserId,id,ct);
        return File(file.Content,file.ContentType,file.FileName);
    }
    [HttpGet("reconciliation.csv")]
    [Authorize(Policy = AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> Reconciliation([FromQuery] DateTimeOffset from,[FromQuery] DateTimeOffset to,CancellationToken ct) =>
        File(await documents.ReconciliationCsvAsync(current.Current.UserId,from,to,ct),"text/csv; charset=utf-8","Consignment-reconciliation.csv");
    private async Task<IActionResult> Act(Guid id,string action,ConsignmentActionRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ActionAsync(current.Current.UserId,id,action,r,ct),HttpContext));
}
