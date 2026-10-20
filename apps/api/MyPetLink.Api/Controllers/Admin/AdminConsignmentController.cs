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
    // --- Default agreement terms ---------------------------------------------------
    // The starting point for new drafts; approvers own it, since it shapes the terms they review.
    [HttpGet("default-terms")]
    public async Task<IActionResult> DefaultTerms(CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.DefaultTermsAsync(ct),HttpContext));
    [HttpPut("default-terms")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsApprove)]
    public async Task<IActionResult> SaveDefaultTerms(SaveConsignmentDefaultTermsRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.SaveDefaultTermsAsync(current.Current.UserId,r,ct),HttpContext));

    // --- Automatic agreement references -------------------------------------------
    [HttpGet("merchants/{merchantId:guid}/agreement-prefix")]
    public async Task<IActionResult> AgreementPrefix(Guid merchantId,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.AgreementPrefixAsync(merchantId,ct),HttpContext));
    [HttpPut("merchants/{merchantId:guid}/agreement-prefix")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsManage)]
    public async Task<IActionResult> SaveAgreementPrefix(Guid merchantId,SaveConsignmentAgreementPrefixRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.SaveAgreementPrefixAsync(current.Current.UserId,merchantId,r,ct),HttpContext));

    // --- Agreement document -----------------------------------------------------
    [HttpGet("agreements/{id:guid}/document")]
    public async Task<IActionResult> AgreementDocument(Guid id,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.AgreementDocumentAsync(id,ct),HttpContext));
    // Opening agreement files also needs agreement management or approval, checked in the service.
    [HttpGet("agreements/{id:guid}/document/preview.pdf")]
    public async Task<IActionResult> PreviewAgreement(Guid id,[FromQuery] string concurrencyToken,CancellationToken ct) {
        var file = await service.PreviewAgreementAsync(current.Current.UserId,id,concurrencyToken,ct);
        return File(file.Content,file.ContentType,file.FileName);
    }
    [HttpPost("agreements/{id:guid}/document/issue")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsManage)]
    public async Task<IActionResult> IssueAgreement(Guid id,IssueConsignmentAgreementRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.IssueAgreementAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpGet("agreements/{id:guid}/documents/{documentId:guid}/pdf")]
    public async Task<IActionResult> IssuedAgreement(Guid id,Guid documentId,CancellationToken ct) {
        var file = await service.IssuedAgreementPdfAsync(current.Current.UserId,id,documentId,ct);
        return File(file.Content,file.ContentType,file.FileName);
    }
    [HttpPost("agreements/{id:guid}/signed-copies")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsManage)]
    [RequestSizeLimit(12_000_000)]
    public async Task<IActionResult> UploadSignedAgreement(Guid id,UploadConsignmentSignedAgreementRequest r,CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.UploadSignedAgreementAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpGet("agreements/{id:guid}/signed-copies/{copyId:guid}/file")]
    public async Task<IActionResult> SignedAgreementFile(Guid id,Guid copyId,CancellationToken ct) {
        var (content,type,name) = await service.SignedAgreementFileAsync(current.Current.UserId,id,copyId,ct);
        return File(content,type,name);
    }
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
    // --- Approved selling prices ------------------------------------------------
    [HttpGet("price-terms")]
    public async Task<IActionResult> PriceTerms([FromQuery] Guid agreementId,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.PriceTermsAsync(agreementId,ct),HttpContext));
    [HttpPost("price-terms")]
    [Authorize(Policy = AdminCapabilities.ConsignmentPriceTermsManage)]
    public async Task<IActionResult> CreatePriceTerm(SaveConsignmentPriceTermRequest r,CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.SavePriceTermAsync(current.Current.UserId,null,r,null,ct),HttpContext));
    [HttpPut("price-terms/{id:guid}")]
    [Authorize(Policy = AdminCapabilities.ConsignmentPriceTermsManage)]
    public async Task<IActionResult> UpdatePriceTerm(Guid id,SaveConsignmentPriceTermRequest r,[FromQuery] string concurrencyToken,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.SavePriceTermAsync(current.Current.UserId,id,r,concurrencyToken,ct),HttpContext));
    [HttpPost("price-terms/{id:guid}/approve")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsApprove)]
    public async Task<IActionResult> ApprovePriceTerm(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ApprovePriceTermAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("price-terms/{id:guid}/end")]
    [Authorize(Policy = AdminCapabilities.ConsignmentAgreementsApprove)]
    public async Task<IActionResult> EndPriceTerm(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.EndPriceTermAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("price-terms/{id:guid}/withdraw")]
    [Authorize(Policy = AdminCapabilities.ConsignmentPriceTermsManage)]
    public async Task<IActionResult> WithdrawPriceTerm(Guid id,ConsignmentTokenRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.WithdrawPriceTermAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("price-terms/copy")]
    [Authorize(Policy = AdminCapabilities.ConsignmentPriceTermsManage)]
    public async Task<IActionResult> CopyPriceTerms(CopyConsignmentPriceTermsRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.CopyPriceTermsAsync(current.Current.UserId,r,ct),HttpContext));

    // --- Partner sales reports --------------------------------------------------
    [HttpGet("sales-reports")]
    public async Task<IActionResult> SalesReports([FromQuery] PagedQuery q,Guid? merchantId,Guid? branchId,string? status,CancellationToken ct) {
        var (items,total) = await service.SalesReportsAsync(q.Page,q.PageSize,merchantId,branchId,status,ct);
        return Ok(ApiEnvelope.Ok(items,HttpContext,q.Page,q.PageSize,total));
    }
    [HttpGet("sales-reports/{id:guid}")]
    public async Task<IActionResult> SalesReport(Guid id,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.GetSalesReportAsync(id,ct),HttpContext));
    [HttpPost("sales-reports")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsRecord)]
    public async Task<IActionResult> CreateSalesReport(SaveConsignmentSalesReportRequest r,CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.CreateSalesReportAsync(current.Current.UserId,r,ct),HttpContext));
    [HttpPut("sales-reports/{id:guid}")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsRecord)]
    public async Task<IActionResult> UpdateSalesReport(Guid id,SaveConsignmentSalesReportRequest r,[FromQuery] string concurrencyToken,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.UpdateSalesReportAsync(current.Current.UserId,id,concurrencyToken,r,ct),HttpContext));
    [HttpPost("sales-reports/{id:guid}/record")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsRecord)]
    public async Task<IActionResult> RecordSalesReport(Guid id,ConsignmentTokenRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.RecordSalesReportAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("sales-reports/{id:guid}/void")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsRecord)]
    public async Task<IActionResult> VoidSalesReport(Guid id,ConsignmentTokenRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.VoidSalesReportAsync(current.Current.UserId,id,r,ct),HttpContext));
    // Reopening reviewed figures is a review decision (the approved design's API matrix); the
    // correction draft is then edited and recorded under the record permission as usual.
    [HttpPost("sales-reports/{id:guid}/correct")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsVerify)]
    public async Task<IActionResult> CorrectSalesReport(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.CorrectSalesReportAsync(current.Current.UserId,id,r,ct),HttpContext));
    // Recovery when a report's contributor history is unknown: a new version entered afresh from evidence.
    [HttpPost("sales-reports/{id:guid}/re-enter")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsVerify)]
    public async Task<IActionResult> ReenterSalesReport(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.ReenterSalesReportAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("sales-reports/{id:guid}/verify")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsVerify)]
    public async Task<IActionResult> VerifySalesReport(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.VerifySalesReportAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("sales-reports/{id:guid}/dispute")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsVerify)]
    public async Task<IActionResult> DisputeSalesReport(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.DisputeSalesReportAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpGet("sales-reports.csv")]
    [Authorize(Policy = AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> SalesReportsCsv([FromQuery] DateTimeOffset from,[FromQuery] DateTimeOffset to,CancellationToken ct) =>
        File(await service.SalesReportsCsvAsync(current.Current.UserId,from,to,ct),"text/csv; charset=utf-8","Consignment-sales-reports.csv");

    // --- SKU stock position ------------------------------------------------------
    [HttpGet("stock-positions")]
    public async Task<IActionResult> StockPositions([FromQuery] Guid? merchantId,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.StockPositionsAsync(merchantId,ct),HttpContext));
    [HttpPost("stock-tracking/start")]
    [Authorize(Policy = AdminCapabilities.ConsignmentSalesReportsVerify)]
    public async Task<IActionResult> StartStockTracking(StartConsignmentStockTrackingRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.StartStockTrackingAsync(current.Current.UserId,r,ct),HttpContext));
    [HttpGet("stock-ledger.csv")]
    [Authorize(Policy = AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> StockLedgerCsv([FromQuery] DateTimeOffset from,[FromQuery] DateTimeOffset to,CancellationToken ct) =>
        File(await service.StockLedgerCsvAsync(current.Current.UserId,from,to,ct),"text/csv; charset=utf-8","Consignment-stock-ledger.csv");

    // --- Monthly stocktake, period close and discrepancies (Phase 1B) ------------
    [HttpGet("stocktakes/expected")]
    public async Task<IActionResult> StocktakeExpectation([FromQuery] Guid branchId,[FromQuery] string countDate,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.StocktakeExpectationAsync(branchId,countDate,ct),HttpContext));
    [HttpGet("stocktakes")]
    public async Task<IActionResult> Stocktakes([FromQuery] PagedQuery q,Guid? branchId,string? status,CancellationToken ct) {
        var (items,total) = await service.StocktakesAsync(q.Page,q.PageSize,branchId,status,ct);
        return Ok(ApiEnvelope.Ok(items,HttpContext,q.Page,q.PageSize,total));
    }
    [HttpGet("stocktakes/{id:guid}")]
    public async Task<IActionResult> Stocktake(Guid id,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.GetStocktakeAsync(id,ct),HttpContext));
    [HttpPost("stocktakes")]
    [Authorize(Policy = AdminCapabilities.ConsignmentStocktakeRecord)]
    public async Task<IActionResult> CreateStocktake(SaveConsignmentStocktakeRequest r,CancellationToken ct) =>
        StatusCode(201,ApiEnvelope.Ok(await service.CreateStocktakeAsync(current.Current.UserId,r,ct),HttpContext));
    [HttpPut("stocktakes/{id:guid}")]
    [Authorize(Policy = AdminCapabilities.ConsignmentStocktakeRecord)]
    public async Task<IActionResult> UpdateStocktake(Guid id,SaveConsignmentStocktakeRequest r,[FromQuery] string concurrencyToken,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.UpdateStocktakeAsync(current.Current.UserId,id,concurrencyToken,r,ct),HttpContext));
    [HttpPost("stocktakes/{id:guid}/record")]
    [Authorize(Policy = AdminCapabilities.ConsignmentStocktakeRecord)]
    public async Task<IActionResult> RecordStocktake(Guid id,ConsignmentTokenRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.RecordStocktakeAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpPost("stocktakes/{id:guid}/void")]
    [Authorize(Policy = AdminCapabilities.ConsignmentStocktakeRecord)]
    public async Task<IActionResult> VoidStocktake(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.VoidStocktakeAsync(current.Current.UserId,id,r,ct),HttpContext));
    // Approving a count closes the month and carries stock forward.
    [HttpPost("stocktakes/{id:guid}/approve")]
    [Authorize(Policy = AdminCapabilities.ConsignmentPeriodsClose)]
    public async Task<IActionResult> ApproveStocktake(Guid id,ConsignmentReviewRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ApproveStocktakeAsync(current.Current.UserId,id,r,ct),HttpContext));
    [HttpGet("stocktakes.csv")]
    [Authorize(Policy = AdminCapabilities.ConsignmentManifestExport)]
    public async Task<IActionResult> StocktakesCsv([FromQuery] DateTimeOffset from,[FromQuery] DateTimeOffset to,CancellationToken ct) =>
        File(await service.StocktakesCsvAsync(current.Current.UserId,from,to,ct),"text/csv; charset=utf-8","Consignment-stocktakes.csv");
    [HttpGet("discrepancies")]
    public async Task<IActionResult> Discrepancies([FromQuery] Guid? branchId,[FromQuery] string? status,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.DiscrepanciesAsync(branchId,status,ct),HttpContext));
    [HttpPost("discrepancies/{id:guid}/resolve")]
    [Authorize(Policy = AdminCapabilities.ConsignmentDiscrepanciesResolve)]
    public async Task<IActionResult> ResolveDiscrepancy(Guid id,ResolveConsignmentDiscrepancyRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ResolveDiscrepancyAsync(current.Current.UserId,id,r,ct),HttpContext));

    private async Task<IActionResult> Act(Guid id,string action,ConsignmentActionRequest r,CancellationToken ct) =>
        Ok(ApiEnvelope.Ok(await service.ActionAsync(current.Current.UserId,id,action,r,ct),HttpContext));
}
