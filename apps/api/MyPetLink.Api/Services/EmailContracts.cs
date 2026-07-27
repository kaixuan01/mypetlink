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
    string PetName);

public sealed record OwnerWelcomeEmailTemplateData(
    string OwnerName,
    string OwnerPortalUrl,
    DateTimeOffset WelcomeEventAt,
    bool SmartTagsEnabled);

public sealed record RenderedEmail(
    string HtmlBody,
    string TextBody);

public sealed record EmailMessage(
    Guid OutboxId,
    string RecipientEmail,
    string RecipientName,
    string Subject,
    string HtmlBody,
    string TextBody);

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
    void EnqueuePaymentConfirmed(TagOrder order, DateTimeOffset confirmedAt);

    EmailOutbox? EnqueueOwnerWelcome(
        User user,
        OwnerWelcomeEmailTemplateData template);

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
