using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class EmailOutboxService : IEmailOutboxService
{
    private static readonly JsonSerializerOptions TemplateJson = new(JsonSerializerDefaults.Web);
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly TimeProvider _timeProvider;
    private readonly IEmailTemplateGate _gate;
    private readonly IShippingFulfilmentService _shippingFulfilmentService;

    public EmailOutboxService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        TimeProvider timeProvider,
        IEmailTemplateGate gate,
        IShippingFulfilmentService? shippingFulfilmentService = null)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _timeProvider = timeProvider;
        _gate = gate;
        _shippingFulfilmentService = shippingFulfilmentService
            ?? new ShippingFulfilmentService(dbContext, auditLogService, timeProvider);
    }

    public async Task EnqueuePaymentConfirmedAsync(
        TagOrder order,
        DateTimeOffset confirmedAt,
        CancellationToken cancellationToken = default)
    {
        if (order.EmailOutboxMessages.Any(item =>
                item.MessageType == EmailMessageType.PaymentConfirmed))
        {
            return;
        }

        var item = order.Items
            .OrderBy(value => value.CreatedAt)
            .FirstOrDefault();
        var productName = item?.ProductNameSnapshot
            ?? (order.TagType == TagType.QrNfcSmartTag
                ? "MyPetLink QR + NFC Smart Tag"
                : "MyPetLink QR Pet Tag");
        var variantName = item?.VariantNameSnapshot
            ?? $"{TagVariants.Normalize(order.Variant)} Tag";
        var ownerName = CleanHeaderValue(order.OwnerUser.DisplayName, "MyPetLink customer");
        var orderNumber = CleanHeaderValue(order.OrderNumber, "your order");
        var template = new PaymentConfirmedEmailTemplateData(
            OwnerName: ownerName,
            OrderNumber: orderNumber,
            AmountPaid: order.Amount + order.DeliveryFee,
            Currency: string.IsNullOrWhiteSpace(order.Currency) ? "MYR" : order.Currency.Trim().ToUpperInvariant(),
            PaymentConfirmedAt: confirmedAt,
            ProductName: productName,
            VariantName: variantName,
            PetName: string.IsNullOrWhiteSpace(order.Pet.Name) ? "your pet" : order.Pet.Name.Trim());

        var now = _timeProvider.GetUtcNow();
        var suppression = await SuppressionReasonAsync(
            EmailMessageType.PaymentConfirmed,
            cancellationToken);
        var message = new EmailOutbox
        {
            Id = Guid.NewGuid(),
            MessageType = EmailMessageType.PaymentConfirmed,
            RecipientEmail = order.OwnerUser.Email.Trim(),
            RecipientName = ownerName,
            Subject = $"Payment confirmed for order {orderNumber}",
            TemplateDataJson = JsonSerializer.Serialize(template, TemplateJson),
            RelatedOrderId = order.Id,
            RelatedOrder = order,
            Status = suppression is null
                ? EmailOutboxStatus.Pending
                : EmailOutboxStatus.Suppressed,
            SuppressionReason = suppression,
            AttemptCount = 0,
            MaxAttempts = 5,
            NextAttemptAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        order.EmailOutboxMessages.Add(message);
        _dbContext.EmailOutbox.Add(message);
    }

    public async Task<EmailOutbox?> EnqueueOwnerWelcomeAsync(
        User user,
        OwnerWelcomeEmailTemplateData template,
        CancellationToken cancellationToken = default)
    {
        if (user.EmailOutboxMessages.Any(item =>
                item.MessageType == EmailMessageType.OwnerWelcome))
        {
            return null;
        }

        var now = _timeProvider.GetUtcNow();
        var recipientName = CleanHeaderValue(template.OwnerName, "MyPetLink owner");
        var suppression = await SuppressionReasonAsync(
            EmailMessageType.OwnerWelcome,
            cancellationToken);
        var message = new EmailOutbox
        {
            Id = Guid.NewGuid(),
            MessageType = EmailMessageType.OwnerWelcome,
            RecipientEmail = user.Email.Trim(),
            RecipientName = recipientName,
            Subject = "Welcome to MyPetLink",
            TemplateDataJson = JsonSerializer.Serialize(template, TemplateJson),
            RelatedUserId = user.Id,
            RelatedUser = user,
            Status = suppression is null
                ? EmailOutboxStatus.Pending
                : EmailOutboxStatus.Suppressed,
            SuppressionReason = suppression,
            AttemptCount = 0,
            MaxAttempts = 5,
            NextAttemptAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        user.EmailOutboxMessages.Add(message);
        _dbContext.EmailOutbox.Add(message);
        return message;
    }

    public async Task EnqueueOrderShippedAsync(
        TagOrder order,
        DateTimeOffset shippedAt,
        CancellationToken cancellationToken = default)
    {
        if (order.EmailOutboxMessages.Any(item =>
                item.MessageType == EmailMessageType.OrderShipped))
        {
            return;
        }

        var ownerName = CleanHeaderValue(order.OwnerUser.DisplayName, "MyPetLink customer");
        var orderNumber = CleanHeaderValue(order.OrderNumber, "your order");
        var template = await BuildOrderShippedTemplateAsync(order, shippedAt, cancellationToken);
        var now = _timeProvider.GetUtcNow();
        var suppression = await SuppressionReasonAsync(
            EmailMessageType.OrderShipped,
            cancellationToken);
        var message = new EmailOutbox
        {
            Id = Guid.NewGuid(),
            MessageType = EmailMessageType.OrderShipped,
            RecipientEmail = order.OwnerUser.Email.Trim(),
            RecipientName = ownerName,
            Subject = $"Your MyPetLink order {orderNumber} has shipped",
            TemplateDataJson = JsonSerializer.Serialize(template, TemplateJson),
            RelatedOrderId = order.Id,
            RelatedOrder = order,
            Status = suppression is null
                ? EmailOutboxStatus.Pending
                : EmailOutboxStatus.Suppressed,
            SuppressionReason = suppression,
            AttemptCount = 0,
            MaxAttempts = 5,
            NextAttemptAt = now,
            CreatedAt = now,
            UpdatedAt = now
        };

        order.EmailOutboxMessages.Add(message);
        _dbContext.EmailOutbox.Add(message);
    }

    public async Task SynchronizeUnsentOrderShippedAsync(
        TagOrder order,
        CancellationToken cancellationToken = default)
    {
        var message = order.EmailOutboxMessages.SingleOrDefault(item =>
            item.MessageType == EmailMessageType.OrderShipped);
        if (message is null
            || !order.ShippedAt.HasValue
            || message.Status is EmailOutboxStatus.Sent or EmailOutboxStatus.Sending)
        {
            // A claimed Sending row is the explicit race boundary: once the
            // dispatcher owns it, changing its payload could produce a message
            // assembled from two snapshots. Sent rows are immutable.
            return;
        }

        var template = await BuildOrderShippedTemplateAsync(
            order,
            order.ShippedAt.Value,
            cancellationToken);
        message.TemplateDataJson = JsonSerializer.Serialize(template, TemplateJson);
        message.UpdatedAt = _timeProvider.GetUtcNow();
        // Status, attempts, suppression, retry schedule, and lease values stay
        // untouched. Correcting tracking must never release or duplicate mail.
    }

    public async Task<AdminEmailOutboxResponse> RetryFailedAsync(
        Guid orderId,
        Guid adminUserId,
        CancellationToken cancellationToken = default)
    {
        var message = await _dbContext.EmailOutbox.SingleOrDefaultAsync(
            item => item.RelatedOrderId == orderId
                    && item.MessageType == EmailMessageType.PaymentConfirmed,
            cancellationToken);
        if (message is null)
        {
            throw new ApiException(
                StatusCodes.Status404NotFound,
                "not_found",
                "Payment confirmation email details were not found.");
        }

        if (message.Status != EmailOutboxStatus.Failed)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "invalid_state",
                "Only a failed payment confirmation email can be retried.");
        }

        await EnsureDeliveryEnabledAsync(
            EmailMessageType.PaymentConfirmed,
            "Payment confirmation emails are currently turned off. Turn them on before retrying this email.",
            cancellationToken);

        var oldState = Snapshot(message);
        ResetForRetry(message);

        _auditLogService.Append(
            adminUserId,
            ActorType.Admin,
            "email.payment-confirmation.retry",
            "EmailOutbox",
            message.Id,
            oldState,
            Snapshot(message));
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminResponse(message);
    }

    public async Task<AdminOwnerWelcomeEmailResponse> RetryOwnerWelcomeAsync(
        Guid ownerUserId,
        Guid adminUserId,
        CancellationToken cancellationToken = default)
    {
        var message = await _dbContext.EmailOutbox.SingleOrDefaultAsync(
            item => item.RelatedUserId == ownerUserId
                    && item.MessageType == EmailMessageType.OwnerWelcome,
            cancellationToken);
        if (message is null)
        {
            throw new ApiException(
                StatusCodes.Status404NotFound,
                "not_found",
                "Welcome email details were not found.");
        }

        if (message.Status != EmailOutboxStatus.Failed)
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "invalid_state",
                "Only a failed welcome email can be retried.");
        }

        await EnsureDeliveryEnabledAsync(
            EmailMessageType.OwnerWelcome,
            "Welcome emails are currently turned off. Turn them on before retrying this email.",
            cancellationToken);

        var oldState = Snapshot(message);
        ResetForRetry(message);
        _auditLogService.Append(
            adminUserId,
            ActorType.Admin,
            "email.owner-welcome.retry",
            "EmailOutbox",
            message.Id,
            oldState,
            Snapshot(message));
        await _dbContext.SaveChangesAsync(cancellationToken);
        return ToAdminOwnerWelcomeResponse(message);
    }

    public static AdminEmailOutboxResponse ToAdminResponse(EmailOutbox message) =>
        new(
            message.Status,
            message.AttemptCount,
            message.MaxAttempts,
            message.NextAttemptAt,
            message.LastAttemptAt,
            message.SentAt,
            message.LastError,
            message.Status == EmailOutboxStatus.Failed);

    public static AdminOwnerWelcomeEmailResponse ToAdminOwnerWelcomeResponse(
        EmailOutbox message) =>
        new(
            message.MessageType,
            message.RecipientEmail,
            message.Status,
            message.AttemptCount,
            message.MaxAttempts,
            message.NextAttemptAt,
            message.LastAttemptAt,
            message.SentAt,
            message.LastError,
            message.CreatedAt,
            message.Status == EmailOutboxStatus.Failed);

    public static OwnerPaymentConfirmationEmailResponse? ToOwnerResponse(
        IEnumerable<EmailOutbox> messages)
    {
        var sent = messages.FirstOrDefault(item =>
            item.MessageType == EmailMessageType.PaymentConfirmed
            && item.Status == EmailOutboxStatus.Sent
            && item.SentAt.HasValue);
        return sent is null
            ? null
            : new OwnerPaymentConfirmationEmailResponse(
                sent.SentAt!.Value,
                MaskEmail(sent.RecipientEmail));
    }

    private static object Snapshot(EmailOutbox message) => new
    {
        status = message.Status.ToString(),
        attemptCount = message.AttemptCount,
        message.MaxAttempts,
        message.NextAttemptAt,
        message.LastAttemptAt,
        message.SentAt,
        message.LastError
    };

    /// <summary>
    /// Retry resets a failed message back to Pending, so it must honour the
    /// same switches as the dispatcher. Without this an administrator could
    /// clear a failure and be told the email was queued while it can never
    /// actually send.
    /// </summary>
    private async Task EnsureDeliveryEnabledAsync(
        EmailMessageType messageType,
        string message,
        CancellationToken cancellationToken)
    {
        if (!await _gate.IsDeliveryEnabledAsync(messageType, cancellationToken))
        {
            throw new ApiException(
                StatusCodes.Status409Conflict,
                "invalid_state",
                message);
        }
    }

    /// <summary>
    /// Returns null when the business event may be queued, or a typed reason
    /// when it must be recorded as Suppressed instead.
    ///
    /// Only the per-template business decision suppresses. A global delivery
    /// pause deliberately does NOT: those messages stay Pending so they resume
    /// when the emergency switch is turned back on, and remain visible as held
    /// work in the meantime.
    /// </summary>
    private async Task<string?> SuppressionReasonAsync(
        EmailMessageType messageType,
        CancellationToken cancellationToken) =>
        await _gate.IsTemplateEnabledAsync(messageType, cancellationToken)
            ? null
            : EmailSuppressionReasons.TemplateDisabled;

    private void ResetForRetry(EmailOutbox message)
    {
        var now = _timeProvider.GetUtcNow();
        message.Status = EmailOutboxStatus.Pending;
        message.AttemptCount = 0;
        message.NextAttemptAt = now;
        message.LastAttemptAt = null;
        message.LastError = null;
        message.LockToken = null;
        message.LockedUntil = null;
        message.UpdatedAt = now;
    }

    private static string CleanHeaderValue(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return fallback;
        }

        return value.Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
    }

    private async Task<OrderShippedEmailTemplateData> BuildOrderShippedTemplateAsync(
        TagOrder order,
        DateTimeOffset shippedAt,
        CancellationToken cancellationToken)
    {
        var trackingUrl = await _shippingFulfilmentService.GetCustomerTrackingUrlAsync(
            order,
            cancellationToken);
        return new OrderShippedEmailTemplateData(
            CleanHeaderValue(order.OwnerUser.DisplayName, "MyPetLink customer"),
            CleanHeaderValue(order.OrderNumber, "your order"),
            CleanHeaderValue(order.CourierProvider, "the courier"),
            NormalizeOptional(order.CourierService),
            CleanHeaderValue(order.TrackingNumber, "Not available"),
            shippedAt,
            trackingUrl);
    }

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string MaskEmail(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 0 || at == email.Length - 1)
        {
            return "***";
        }

        var local = email[..at];
        var visible = local[..1];
        return $"{visible}***{email[at..]}";
    }
}
