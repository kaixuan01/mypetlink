using MyPetLink.Api.Entities;

namespace MyPetLink.Api.DTOs;

public sealed record AdminEmailOutboxResponse(
    EmailOutboxStatus Status,
    int AttemptCount,
    int MaxAttempts,
    DateTimeOffset NextAttemptAt,
    DateTimeOffset? LastAttemptAt,
    DateTimeOffset? SentAt,
    string? LastError,
    bool CanRetry);

public sealed record OwnerPaymentConfirmationEmailResponse(
    DateTimeOffset SentAt,
    string MaskedRecipient);

public sealed record AdminOwnerWelcomeEmailResponse(
    EmailMessageType MessageType,
    string RecipientEmail,
    EmailOutboxStatus Status,
    int AttemptCount,
    int MaxAttempts,
    DateTimeOffset NextAttemptAt,
    DateTimeOffset? LastAttemptAt,
    DateTimeOffset? SentAt,
    string? LastError,
    DateTimeOffset CreatedAt,
    bool CanRetry);
