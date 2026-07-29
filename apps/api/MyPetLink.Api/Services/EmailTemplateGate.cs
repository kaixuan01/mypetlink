using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

/// <summary>
/// Safe, typed reasons a queued email is not dispatchable. Never build one of
/// these from an exception message.
/// </summary>
public static class EmailSuppressionReasons
{
    /// <summary>The template was switched off when the event happened.</summary>
    public const string TemplateDisabled = "TemplateDisabled";

    /// <summary>
    /// The message predates the moment its template was switched on, so it
    /// belongs to a historical backlog that must never be released.
    /// </summary>
    public const string BeforeEnabledFromUtc = "BeforeEnabledFromUtc";
}

/// <summary>
/// One template's delivery eligibility. <see cref="EnabledFromUtc"/> is the
/// historical-backlog guard: only messages recorded at or after this moment may
/// ever be dispatched.
/// </summary>
public sealed record EmailTemplateEligibility(
    EmailMessageType MessageType,
    DateTimeOffset EnabledFromUtc);

public interface IEmailTemplateGate
{
    /// <summary>
    /// Templates that may send right now. Empty when global delivery is off.
    /// </summary>
    Task<IReadOnlyList<EmailTemplateEligibility>> GetEligibleAsync(
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Templates switched on in the database, ignoring the global switch. Used
    /// to classify queued work while delivery is globally paused.
    /// </summary>
    Task<IReadOnlyList<EmailTemplateEligibility>> GetTemplateEnabledAsync(
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether this template is switched on as a business decision. This
    /// deliberately ignores the global switch: a global pause must not turn a
    /// business decision into a permanent suppression.
    /// </summary>
    Task<bool> IsTemplateEnabledAsync(
        EmailMessageType messageType,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether this template may actually deliver right now: the business
    /// decision AND the global switch.
    /// </summary>
    Task<bool> IsDeliveryEnabledAsync(
        EmailMessageType messageType,
        CancellationToken cancellationToken = default);

    bool GlobalDeliveryEnabled { get; }
}

/// <summary>
/// Single place that decides whether a queued email may be delivered.
///
/// Two switches, with deliberately different meanings:
///
/// * <c>Email:Enabled</c> (App Setting) is a global infrastructure kill switch.
///   It PAUSES delivery. Messages keep queueing as Pending so an administrator
///   can see the held backlog, and they resume when it is turned back on. It
///   lives in configuration so it works when the database or Admin Portal does
///   not.
///
/// * <c>EmailTemplateSettings.IsEnabled</c> is a per-template business
///   decision. While a template is off, its events are recorded as Suppressed
///   and are never sent, even after the template is switched on later.
///
/// Delivery requires both. A database row can never override the global
/// switch.
/// </summary>
public sealed class EmailTemplateGate : IEmailTemplateGate
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly EmailOptions _options;

    public EmailTemplateGate(
        MyPetLinkDbContext dbContext,
        IOptions<EmailOptions> options)
    {
        _dbContext = dbContext;
        _options = options.Value;
    }

    public bool GlobalDeliveryEnabled => _options.Enabled;

    public async Task<IReadOnlyList<EmailTemplateEligibility>> GetEligibleAsync(
        CancellationToken cancellationToken = default) =>
        _options.Enabled
            ? await GetTemplateEnabledAsync(cancellationToken)
            : [];

    public async Task<IReadOnlyList<EmailTemplateEligibility>> GetTemplateEnabledAsync(
        CancellationToken cancellationToken = default)
    {
        var rows = await _dbContext.EmailTemplateSettings
            .AsNoTracking()
            .Where(setting => setting.IsEnabled && setting.EnabledFromUtc != null)
            .Select(setting => new
            {
                setting.MessageType,
                setting.EnabledFromUtc
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => new EmailTemplateEligibility(
                row.MessageType,
                row.EnabledFromUtc!.Value))
            .ToArray();
    }

    public async Task<bool> IsTemplateEnabledAsync(
        EmailMessageType messageType,
        CancellationToken cancellationToken = default) =>
        await _dbContext.EmailTemplateSettings
            .AsNoTracking()
            .AnyAsync(
                setting => setting.MessageType == messageType
                           && setting.IsEnabled
                           && setting.EnabledFromUtc != null,
                cancellationToken);

    public async Task<bool> IsDeliveryEnabledAsync(
        EmailMessageType messageType,
        CancellationToken cancellationToken = default) =>
        _options.Enabled
        && await IsTemplateEnabledAsync(messageType, cancellationToken);
}
