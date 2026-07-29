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

public sealed record AdminEmailTemplateResponse(
    string MessageType,
    string DisplayName,
    string Description,
    bool IsEnabled,
    DateTimeOffset? EnabledFromUtc,
    DateTimeOffset? UpdatedAt,
    string? UpdatedBy,
    // Counts are operational, not raw status tallies:
    //   Eligible  - Pending and would be claimed by the worker now.
    //   Paused    - Pending and template-eligible, but global delivery is off.
    //   Blocked   - Pending but permanently non-dispatchable (predates
    //               EnabledFromUtc, or the template is switched off).
    //   Suppressed- recorded while the template was off; never sends.
    int EligibleCount,
    int PausedCount,
    int BlockedCount,
    int SuppressedCount,
    int FailedCount,
    int SentCount,
    string RowVersion);

/// <summary>
/// Safe, read-only view of the global email environment. Deliberately carries
/// no host, username, password, or provider error detail.
/// </summary>
public sealed record AdminEmailGlobalStateResponse(
    bool GlobalDeliveryEnabled,
    bool SmtpConfigured,
    string Provider);

public sealed record AdminEmailTemplateListResponse(
    IReadOnlyCollection<AdminEmailTemplateResponse> Templates,
    AdminEmailGlobalStateResponse Global);

public sealed record UpdateEmailTemplateRequest(
    bool IsEnabled,
    string? RowVersion);
