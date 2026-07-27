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
    public EmailOutboxStatus Status { get; set; } = EmailOutboxStatus.Pending;
    public int AttemptCount { get; set; }
    public int MaxAttempts { get; set; } = 5;
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastAttemptAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public string? LastError { get; set; }
    public Guid? LockToken { get; set; }
    public DateTimeOffset? LockedUntil { get; set; }
    public byte[] RowVersion { get; set; } = [];

    public TagOrder? RelatedOrder { get; set; }
    public User? RelatedUser { get; set; }
}
