using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Queues the three merchant emails.
///
/// Nothing is sent implicitly by a status change: a quotation and an invoice
/// reach a merchant only when an administrator asks for it. The payment
/// confirmation is the exception, because recording the money is itself the
/// decision to confirm it.
///
/// Every message carries the recipient and the figures the document already
/// shows, copied from its snapshot. The attached PDF is resolved from the
/// related record id at send time, never from anything in the payload.
/// </summary>
public interface IMerchantEmailService
{
    Task<MerchantEmailQueueResult> QueueQuotationAsync(
        Guid? actorId, Guid quotationId, CancellationToken cancellationToken = default);

    Task<MerchantEmailQueueResult> QueueInvoiceAsync(
        Guid? actorId, Guid invoiceId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Adds the payment confirmation to the caller's unit of work. The caller
    /// saves, so the email and the payment land together or not at all.
    /// </summary>
    /// <summary>
    /// Records the shipment notice. The caller saves, so the email is written
    /// in the same transaction as the shipment itself.
    /// </summary>
    Task EnqueueOrderShippedAsync(
        MerchantOrder order,
        MerchantDeliveryOrder deliveryOrder,
        IReadOnlyList<MerchantShippedItemLine> items,
        string supportEmail,
        CancellationToken cancellationToken = default);

    Task EnqueuePaymentConfirmationAsync(
        MerchantInvoice invoice,
        MerchantReceipt receipt,
        MerchantPayment payment,
        CancellationToken cancellationToken = default);
}

public sealed record MerchantEmailQueueResult(
    Guid OutboxId,
    string Status,
    string RecipientEmail,
    bool AlreadyQueued);

public sealed class MerchantEmailService : IMerchantEmailService
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IEmailTemplateGate _gate;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;

    public MerchantEmailService(
        MyPetLinkDbContext dbContext,
        IEmailTemplateGate gate,
        IAuditLogService auditLogService,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _gate = gate;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
    }

    public async Task<MerchantEmailQueueResult> QueueQuotationAsync(
        Guid? actorId, Guid quotationId, CancellationToken cancellationToken = default)
    {
        var quotation = await _dbContext.MerchantQuotations
            .SingleOrDefaultAsync(item => item.Id == quotationId, cancellationToken)
            ?? throw new ApiException(404, "merchant_quotation_not_found",
                "That quotation no longer exists.");

        if (quotation.Seller is null || quotation.Status == MerchantQuotationStatus.Draft)
        {
            throw new ApiException(409, "quotation_not_issued",
                "Send the quotation before emailing it.");
        }

        var existing = await _dbContext.EmailOutbox
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.RelatedMerchantQuotationId == quotationId
                    && item.MessageType == EmailMessageType.MerchantQuotation,
                cancellationToken);

        // Asking twice is a double-click, not a second copy in their inbox.
        if (existing is not null)
        {
            return new MerchantEmailQueueResult(
                existing.Id, existing.Status.ToString(), existing.RecipientEmail, true);
        }

        var template = new MerchantQuotationEmailTemplateData(
            MerchantName: quotation.MerchantLegalNameSnapshot,
            ContactPerson: Clean(quotation.ContactPersonSnapshot, "there"),
            QuotationNumber: quotation.QuotationNumber,
            QuotationDate: quotation.QuotationDate,
            ValidUntil: quotation.ValidUntil,
            GrandTotal: quotation.GrandTotal,
            Currency: quotation.Currency,
            PaymentTerm: "Due on receipt",
            SupportEmail: quotation.Seller.SupportEmail);

        var message = await BuildAsync(
            EmailMessageType.MerchantQuotation,
            quotation.ContactEmailSnapshot,
            quotation.ContactPersonSnapshot,
            $"MyPetLink Quotation {quotation.QuotationNumber}",
            JsonSerializer.Serialize(template, TemplateJson),
            cancellationToken);

        message.RelatedMerchantQuotationId = quotation.Id;
        _dbContext.EmailOutbox.Add(message);

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-quotation.email-queued",
            "MerchantQuotation", quotation.Id, null,
            new { quotation.QuotationNumber, Status = message.Status.ToString() });

        await SaveAsync(cancellationToken);

        return new MerchantEmailQueueResult(
            message.Id, message.Status.ToString(), message.RecipientEmail, false);
    }

    public async Task<MerchantEmailQueueResult> QueueInvoiceAsync(
        Guid? actorId, Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var invoice = await _dbContext.MerchantInvoices
            .SingleOrDefaultAsync(item => item.Id == invoiceId, cancellationToken)
            ?? throw new ApiException(404, "merchant_invoice_not_found",
                "That invoice no longer exists.");

        if (invoice.Status == MerchantInvoiceStatus.Draft)
        {
            throw new ApiException(409, "invoice_not_issued",
                "Issue the invoice before emailing it.");
        }

        if (invoice.Status == MerchantInvoiceStatus.Cancelled)
        {
            throw new ApiException(409, "merchant_invoice_cancelled",
                "This invoice was cancelled and cannot be emailed.");
        }

        var existing = await _dbContext.EmailOutbox
            .AsNoTracking()
            .SingleOrDefaultAsync(
                item => item.RelatedMerchantInvoiceId == invoiceId
                    && item.MessageType == EmailMessageType.MerchantInvoice,
                cancellationToken);

        if (existing is not null)
        {
            return new MerchantEmailQueueResult(
                existing.Id, existing.Status.ToString(), existing.RecipientEmail, true);
        }

        var template = new MerchantInvoiceEmailTemplateData(
            MerchantName: invoice.MerchantLegalNameSnapshot,
            ContactPerson: Clean(invoice.ContactPersonSnapshot, "there"),
            InvoiceNumber: invoice.InvoiceNumber,
            MerchantOrderNumber: invoice.MerchantOrderNumberSnapshot,
            InvoiceDate: invoice.InvoiceDate,
            DueDate: invoice.DueDate,
            AmountDue: invoice.GrandTotal,
            Currency: invoice.Currency,
            PaymentTerm: "Due on receipt",
            PaymentInstructions: invoice.Seller.PaymentInstructions,
            SupportEmail: invoice.Seller.SupportEmail);

        var message = await BuildAsync(
            EmailMessageType.MerchantInvoice,
            invoice.ContactEmailSnapshot,
            invoice.ContactPersonSnapshot,
            $"MyPetLink Invoice {invoice.InvoiceNumber}",
            JsonSerializer.Serialize(template, TemplateJson),
            cancellationToken);

        message.RelatedMerchantInvoiceId = invoice.Id;
        _dbContext.EmailOutbox.Add(message);

        _auditLogService.Append(actorId, ActorType.Admin, "merchant-invoice.email-queued",
            "MerchantInvoice", invoice.Id, null,
            new { invoice.InvoiceNumber, Status = message.Status.ToString() });

        await SaveAsync(cancellationToken);

        return new MerchantEmailQueueResult(
            message.Id, message.Status.ToString(), message.RecipientEmail, false);
    }

    public async Task EnqueuePaymentConfirmationAsync(
        MerchantInvoice invoice,
        MerchantReceipt receipt,
        MerchantPayment payment,
        CancellationToken cancellationToken = default)
    {
        var alreadyQueued = await _dbContext.EmailOutbox.AnyAsync(
            item => item.RelatedMerchantInvoiceId == invoice.Id
                && item.MessageType == EmailMessageType.MerchantPaymentConfirmation,
            cancellationToken);

        if (alreadyQueued)
        {
            return;
        }

        var template = new MerchantPaymentConfirmationEmailTemplateData(
            MerchantName: invoice.MerchantLegalNameSnapshot,
            ContactPerson: Clean(invoice.ContactPersonSnapshot, "there"),
            InvoiceNumber: invoice.InvoiceNumber,
            ReceiptNumber: receipt.ReceiptNumber,
            MerchantOrderNumber: invoice.MerchantOrderNumberSnapshot,
            AmountReceived: payment.AmountReceived,
            Currency: invoice.Currency,
            PaymentDate: payment.PaymentDate,
            PaymentMethod: DTOs.MerchantBillingParsing.Describe(payment.Method),
            SupportEmail: invoice.Seller.SupportEmail);

        var message = await BuildAsync(
            EmailMessageType.MerchantPaymentConfirmation,
            invoice.ContactEmailSnapshot,
            invoice.ContactPersonSnapshot,
            $"Payment received for {invoice.InvoiceNumber}",
            JsonSerializer.Serialize(template, TemplateJson),
            cancellationToken);

        message.RelatedMerchantInvoiceId = invoice.Id;
        _dbContext.EmailOutbox.Add(message);

        // The caller saves, so this rides the payment's transaction.
        _auditLogService.Append(null, ActorType.System,
            "merchant-payment-confirmation.email-queued",
            "MerchantInvoice", invoice.Id, null,
            new { invoice.InvoiceNumber, receipt.ReceiptNumber, Status = message.Status.ToString() });
    }

    public async Task EnqueueOrderShippedAsync(
        MerchantOrder order,
        MerchantDeliveryOrder deliveryOrder,
        IReadOnlyList<MerchantShippedItemLine> items,
        string supportEmail,
        CancellationToken cancellationToken = default)
    {
        var alreadyQueued = await _dbContext.EmailOutbox.AnyAsync(
            item => item.RelatedMerchantDeliveryOrderId == deliveryOrder.Id
                && item.MessageType == EmailMessageType.MerchantOrderShipped,
            cancellationToken);

        if (alreadyQueued)
        {
            return;
        }

        // Everything the merchant will read is copied here and now. Courier
        // settings, the merchant record and the catalog are all free to change
        // afterwards without rewriting a notice that has already been sent.
        var template = new MerchantOrderShippedEmailTemplateData(
            MerchantName: order.MerchantLegalNameSnapshot,
            ContactPerson: Clean(order.ContactPersonSnapshot, "there"),
            MerchantOrderNumber: order.MerchantOrderNumber,
            DeliveryOrderNumber: deliveryOrder.DeliveryOrderNumber,
            CourierName: Clean(order.CourierProvider, "the courier"),
            CourierService: Trim(order.CourierService),
            TrackingNumber: Clean(order.TrackingNumber, ""),
            // Built and validated by the fulfilment service from the courier's
            // own configured template, never from anything a request supplied.
            TrackingUrl: Trim(order.TrackingUrlSnapshot),
            Items: items,
            ShippedAt: order.ShippedAt ?? _timeProvider.GetUtcNow(),
            SupportEmail: supportEmail);

        var message = await BuildAsync(
            EmailMessageType.MerchantOrderShipped,
            order.ContactEmailSnapshot,
            order.ContactPersonSnapshot,
            $"MyPetLink Order Shipped {order.MerchantOrderNumber}",
            JsonSerializer.Serialize(template, TemplateJson),
            cancellationToken);

        message.RelatedMerchantDeliveryOrderId = deliveryOrder.Id;
        _dbContext.EmailOutbox.Add(message);

        // The caller saves, so this rides the shipment's transaction.
        _auditLogService.Append(null, ActorType.System,
            "merchant-order-shipped.email-queued",
            "MerchantDeliveryOrder", deliveryOrder.Id, null,
            new
            {
                order.MerchantOrderNumber,
                deliveryOrder.DeliveryOrderNumber,
                Status = message.Status.ToString(),
            });
    }

    private static string? Trim(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private async Task<EmailOutbox> BuildAsync(
        EmailMessageType messageType,
        string recipientEmail,
        string recipientName,
        string subject,
        string templateDataJson,
        CancellationToken cancellationToken)
    {
        var now = _timeProvider.GetUtcNow();

        // A template that is switched off records the event as Suppressed. It
        // is never dispatched, not even if the template is enabled later.
        var suppression = await _gate.IsTemplateEnabledAsync(messageType, cancellationToken)
            ? null
            : EmailSuppressionReasons.TemplateDisabled;

        return new EmailOutbox
        {
            Id = Guid.NewGuid(),
            MessageType = messageType,
            RecipientEmail = Clean(recipientEmail, ""),
            RecipientName = Clean(recipientName, "there"),
            Subject = Clean(subject, "MyPetLink"),
            TemplateDataJson = templateDataJson,
            Status = suppression is null ? EmailOutboxStatus.Pending : EmailOutboxStatus.Suppressed,
            SuppressionReason = suppression,
            AttemptCount = 0,
            MaxAttempts = 5,
            NextAttemptAt = now,
            CreatedAt = now,
            UpdatedAt = now,
        };
    }

    private async Task SaveAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A parallel request won the dedupe index. That is the outcome we
            // wanted, so it is not an error.
            _dbContext.ChangeTracker.Clear();
        }
    }

    /// <summary>
    /// Header-safe: a stored value can never inject a second header line.
    /// </summary>
    private static string Clean(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value)) return fallback;

        return value
            .Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
    }
}
