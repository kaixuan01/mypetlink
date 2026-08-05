using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed record PaymentConfirmedEmailTemplateData(
    string OwnerName,
    string OrderNumber,
    decimal AmountPaid,
    string Currency,
    DateTimeOffset PaymentConfirmedAt,
    string ProductName,
    string VariantName,
    string PetName,
    decimal? MerchandiseSubtotal = null,
    decimal? DiscountTotal = null,
    decimal? DeliveryFee = null,
    IReadOnlyCollection<PaymentConfirmedEmailItemData>? Items = null);

public sealed record PaymentConfirmedEmailItemData(
    string ProductName,
    string VariantName,
    string PetName,
    int Quantity,
    decimal UnitPrice,
    decimal LineTotal);

public sealed record OwnerWelcomeEmailTemplateData(
    string OwnerName,
    string OwnerPortalUrl,
    DateTimeOffset WelcomeEventAt,
    bool SmartTagsEnabled);

public sealed record OrderShippedEmailTemplateData(
    string OwnerName,
    string OrderNumber,
    string CourierProvider,
    string? CourierService,
    string TrackingNumber,
    DateTimeOffset ShippedAt,
    string? TrackingUrl = null);

// Merchant Sales templates. Every value is copied from the issued document's
// snapshot, so the email and its attachment can never disagree, and nothing
// internal (notes, commission, margin, identifiers) is carried here at all.

public sealed record MerchantQuotationEmailTemplateData(
    string MerchantName,
    string ContactPerson,
    string QuotationNumber,
    DateTimeOffset QuotationDate,
    DateTimeOffset ValidUntil,
    decimal GrandTotal,
    string Currency,
    string PaymentTerm,
    string SupportEmail);

public sealed record MerchantInvoiceEmailTemplateData(
    string MerchantName,
    string ContactPerson,
    string InvoiceNumber,
    string MerchantOrderNumber,
    DateTimeOffset InvoiceDate,
    DateTimeOffset DueDate,
    decimal AmountDue,
    string Currency,
    string PaymentTerm,
    string? PaymentInstructions,
    string SupportEmail);

public sealed record MerchantPaymentConfirmationEmailTemplateData(
    string MerchantName,
    string ContactPerson,
    string InvoiceNumber,
    string ReceiptNumber,
    string MerchantOrderNumber,
    decimal AmountReceived,
    string Currency,
    DateTimeOffset PaymentDate,
    string PaymentMethod,
    string SupportEmail);

public sealed record RenderedEmail(
    string HtmlBody,
    string TextBody);

public sealed record EmailMessage(
    Guid OutboxId,
    string RecipientEmail,
    string RecipientName,
    string Subject,
    string HtmlBody,
    string TextBody,
    IReadOnlyCollection<EmailAttachment> Attachments);

public sealed record EmailAttachment(
    string FileName,
    string ContentType,
    byte[] Content);

public interface IEmailAttachmentResolver
{
    Task<IReadOnlyCollection<EmailAttachment>> ResolveAsync(
        EmailOutbox message,
        CancellationToken cancellationToken = default);
}

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}

public interface IEmailTemplateRenderer
{
    RenderedEmail Render(EmailOutbox message);
}

public interface IEmailPreviewService
{
    RenderedEmail Render(string template, string variant);
}

public interface IEmailOutboxService
{
    Task EnqueuePaymentConfirmedAsync(
        TagOrder order,
        DateTimeOffset confirmedAt,
        CancellationToken cancellationToken = default);

    Task EnqueueOrderShippedAsync(
        TagOrder order,
        DateTimeOffset shippedAt,
        CancellationToken cancellationToken = default);

    Task SynchronizeUnsentOrderShippedAsync(
        TagOrder order,
        CancellationToken cancellationToken = default);

    Task<EmailOutbox?> EnqueueOwnerWelcomeAsync(
        User user,
        OwnerWelcomeEmailTemplateData template,
        CancellationToken cancellationToken = default);

    Task<AdminEmailOutboxResponse> RetryFailedAsync(
        Guid orderId,
        Guid adminUserId,
        CancellationToken cancellationToken = default);

    Task<AdminOwnerWelcomeEmailResponse> RetryOwnerWelcomeAsync(
        Guid ownerUserId,
        Guid adminUserId,
        CancellationToken cancellationToken = default);
}

public interface IOwnerPortalEntryService
{
    Task EnterAsync(Guid? currentUserId, CancellationToken cancellationToken = default);
}

public sealed record ClaimedEmail(Guid Id, Guid LockToken);

public interface IEmailOutboxDispatcher
{
    Task<IReadOnlyCollection<ClaimedEmail>> ClaimBatchAsync(
        int batchSize,
        TimeSpan visibilityTimeout,
        CancellationToken cancellationToken = default);

    Task DispatchAsync(ClaimedEmail claim, CancellationToken cancellationToken = default);
}

public sealed class EmailDeliveryException : Exception
{
    public EmailDeliveryException(string safeMessage, bool isTransient, Exception? innerException = null)
        : base(safeMessage, innerException)
    {
        IsTransient = isTransient;
    }

    public bool IsTransient { get; }
}
