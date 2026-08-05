namespace MyPetLink.Api.Entities;

public sealed class EmailOutbox : AuditableEntity
{
    public EmailMessageType MessageType { get; set; } = EmailMessageType.PaymentConfirmed;
    public string RecipientEmail { get; set; } = "";
    public string RecipientName { get; set; } = "";
    public string Subject { get; set; } = "";
    public string TemplateDataJson { get; set; } = "";
    public Guid? RelatedOrderId { get; set; }
    public Guid? RelatedUserId { get; set; }

    // Merchant Sales relations. A merchant is not a MyPetLink user and a
    // merchant order is not a TagOrder, so these documents need their own
    // links -- which are also what makes the dedupe indexes possible.
    public Guid? RelatedMerchantQuotationId { get; set; }
    public Guid? RelatedMerchantInvoiceId { get; set; }
    public EmailOutboxStatus Status { get; set; } = EmailOutboxStatus.Pending;
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 5;
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastAttemptAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public string? LastError { get; set; }
    public string? SuppressionReason { get; set; }
    public Guid? LockToken { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public TagOrder? RelatedOrder { get; set; }
    public User? RelatedUser { get; set; }
    public MerchantQuotation? RelatedMerchantQuotation { get; set; }
    public MerchantInvoice? RelatedMerchantInvoice { get; set; }
}

/// <summary>
/// Runtime business switch for one transactional email template.
///
/// This is deliberately a typed table with one row per message type rather
/// than a generic key/value setting: enabling a customer-facing email is a
/// business decision that needs authorization, an audit trail, and optimistic
/// concurrency.
///
/// <see cref="EnabledFromUtc"/> is the historical-backlog guard. Only events
/// recorded at or after that moment are ever dispatched, so switching a
/// template on can never release messages queued before the decision was made.
/// </summary>
public sealed class EmailTemplateSetting : AuditableEntity
{
    public EmailMessageType MessageType { get; set; }
    public bool IsEnabled { get; set; }
    public DateTimeOffset? EnabledFromUtc { get; set; }
    public Guid? UpdatedByAdminUserId { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public AdminUser? UpdatedByAdminUser { get; set; }
}
