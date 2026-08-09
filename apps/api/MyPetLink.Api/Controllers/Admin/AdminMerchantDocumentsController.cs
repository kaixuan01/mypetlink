using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Controllers.Admin;

// Merchant documents are Admin-only. A merchant never signs in, so there is no
// public or owner-facing counterpart: their copy arrives as an email
// attachment, not as a link anybody could guess.
//
// Downloading only renders; it never advances a status or touches a financial
// record, so repeated downloads are free and always reproduce the same
// document from the same stored snapshot.

[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales")]
public sealed class AdminMerchantDocumentsController : ApiControllerBase
{
    private readonly IMerchantDocumentService _documents;

    public AdminMerchantDocumentsController(IMerchantDocumentService documents)
    {
        _documents = documents;
    }

    [HttpGet("quotations/{quotationId:guid}/quotation.pdf")]
    public async Task<IActionResult> QuotationPdf(
        Guid quotationId, CancellationToken cancellationToken)
    {
        var document = await _documents.GetQuotationAsync(quotationId, cancellationToken);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("invoices/{invoiceId:guid}/invoice.pdf")]
    public async Task<IActionResult> InvoicePdf(Guid invoiceId, CancellationToken cancellationToken)
    {
        var document = await _documents.GetInvoiceAsync(invoiceId, cancellationToken);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("invoices/{invoiceId:guid}/receipt.pdf")]
    public async Task<IActionResult> ReceiptPdf(Guid invoiceId, CancellationToken cancellationToken)
    {
        var document = await _documents.GetReceiptForInvoiceAsync(invoiceId, cancellationToken);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("receipts/{receiptId:guid}/receipt.pdf")]
    public async Task<IActionResult> ReceiptByIdPdf(
        Guid receiptId, CancellationToken cancellationToken)
    {
        var document = await _documents.GetReceiptAsync(receiptId, cancellationToken);
        return File(document.Content, document.ContentType, document.FileName);
    }

    [HttpGet("delivery-orders/{deliveryOrderId:guid}/delivery-order.pdf")]
    public async Task<IActionResult> DeliveryOrderPdf(
        Guid deliveryOrderId, CancellationToken cancellationToken)
    {
        var document = await _documents.GetDeliveryOrderAsync(deliveryOrderId, cancellationToken);
        return File(document.Content, document.ContentType, document.FileName);
    }
}

/// <summary>
/// Sending is always an explicit decision. Nothing reaches a merchant because
/// a status changed.
/// </summary>
[Authorize(Policy = AuthorizationPolicies.Admin)]
[Route("api/v1/admin/merchant-sales")]
public sealed class AdminMerchantEmailsController : ApiControllerBase
{
    private readonly IMerchantEmailService _emails;
    private readonly ICurrentUserService _currentUser;

    public AdminMerchantEmailsController(
        IMerchantEmailService emails, ICurrentUserService currentUser)
    {
        _emails = emails;
        _currentUser = currentUser;
    }

    [HttpPost("quotations/{quotationId:guid}/send-email")]
    public async Task<IActionResult> SendQuotation(
        Guid quotationId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _emails.QueueQuotationAsync(
                _currentUser.Current.UserId, quotationId, cancellationToken),
            HttpContext));

    [HttpPost("invoices/{invoiceId:guid}/send-email")]
    public async Task<IActionResult> SendInvoice(
        Guid invoiceId, CancellationToken cancellationToken) =>
        Ok(ApiEnvelope.Ok(
            await _emails.QueueInvoiceAsync(
                _currentUser.Current.UserId, invoiceId, cancellationToken),
            HttpContext));
}
