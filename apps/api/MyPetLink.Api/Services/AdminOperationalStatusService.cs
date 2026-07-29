using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public interface IAdminOperationalStatusService
{
    Task<AdminOperationalStatusResponse> GetAsync(
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Read-only operational status for the Admin Portal.
///
/// Every value here is derived from configuration or database state that is
/// actually in effect. Nothing is hardcoded: a status that reports confidently
/// but wrongly is worse than showing nothing, because an operator will act on
/// it. Configured, Enabled, and Available are reported separately because they
/// are not interchangeable.
///
/// No secret, host, credential, endpoint, or provider error detail is exposed.
/// </summary>
public sealed class AdminOperationalStatusService : IAdminOperationalStatusService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly EmailOptions _email;
    private readonly StorageOptions _storage;
    private readonly CloudflareR2Options _r2;
    private readonly PublicSiteOptions _publicSite;
    private readonly FeatureOptions _features;

    public AdminOperationalStatusService(
        MyPetLinkDbContext dbContext,
        IOptions<EmailOptions> email,
        IOptions<StorageOptions> storage,
        IOptions<CloudflareR2Options> r2,
        IOptions<PublicSiteOptions> publicSite,
        IOptions<FeatureOptions> features)
    {
        _dbContext = dbContext;
        _email = email.Value;
        _storage = storage.Value;
        _r2 = r2.Value;
        _publicSite = publicSite.Value;
        _features = features.Value;
    }

    public async Task<AdminOperationalStatusResponse> GetAsync(
        CancellationToken cancellationToken = default)
    {
        var outboxPending = await _dbContext.EmailOutbox
            .CountAsync(item => item.Status == EmailOutboxStatus.Pending, cancellationToken);
        // Pending rows that a template would accept but the global switch is
        // holding. Surfaced so a global pause never hides a growing backlog.
        var enabled = await _dbContext.EmailTemplateSettings
            .AsNoTracking()
            .Where(setting => setting.IsEnabled && setting.EnabledFromUtc != null)
            .Select(setting => new { setting.MessageType, setting.EnabledFromUtc })
            .ToListAsync(cancellationToken);
        var outboxHeld = 0;
        foreach (var template in enabled)
        {
            outboxHeld += await _dbContext.EmailOutbox
                .AsNoTracking()
                .CountAsync(
                    item => item.MessageType == template.MessageType
                            && item.Status == EmailOutboxStatus.Pending
                            && item.CreatedAt >= template.EnabledFromUtc,
                    cancellationToken);
        }
        var outboxSuppressed = await _dbContext.EmailOutbox
            .CountAsync(item => item.Status == EmailOutboxStatus.Suppressed, cancellationToken);
        var outboxFailed = await _dbContext.EmailOutbox
            .CountAsync(item => item.Status == EmailOutboxStatus.Failed, cancellationToken);
        var enabledTemplates = await _dbContext.EmailTemplateSettings
            .CountAsync(setting => setting.IsEnabled, cancellationToken);
        var activeDeliveryZones = await _dbContext.DeliveryRates
            .CountAsync(rate => rate.IsActive, cancellationToken);

        // Last successful delivery is a real signal (a row actually sent), not
        // a liveness probe, so it is labelled as such rather than as worker
        // health, which we cannot observe from here.
        var lastSuccessfulDelivery = await _dbContext.EmailOutbox
            .Where(item => item.SentAt != null)
            .OrderByDescending(item => item.SentAt)
            .Select(item => item.SentAt)
            .FirstOrDefaultAsync(cancellationToken);

        var usesR2 = string.Equals(
            _storage.Provider?.Trim(),
            "CloudflareR2",
            StringComparison.OrdinalIgnoreCase);
        var storageConfigured = usesR2
            ? !string.IsNullOrWhiteSpace(_r2.AccountId)
              && !string.IsNullOrWhiteSpace(_r2.AccessKeyId)
              && !string.IsNullOrWhiteSpace(_r2.SecretAccessKey)
              && !string.IsNullOrWhiteSpace(_r2.PublicBaseUrl)
            : !string.IsNullOrWhiteSpace(_storage.LocalRoot);

        var publicSiteConfigured = Uri.TryCreate(
            _publicSite.BaseUrl,
            UriKind.Absolute,
            out var publicSiteUri)
            && (publicSiteUri.Scheme == Uri.UriSchemeHttps
                || (publicSiteUri.Scheme == Uri.UriSchemeHttp && publicSiteUri.IsLoopback));

        return new AdminOperationalStatusResponse(
            new AdminEmailStatusResponse(
                _email.Enabled,
                SmtpConfigured(),
                enabledTemplates,
                outboxPending,
                _email.Enabled ? 0 : outboxHeld,
                outboxSuppressed,
                outboxFailed,
                lastSuccessfulDelivery),
            new AdminStorageStatusResponse(
                usesR2 ? "Cloudflare R2" : "Local disk",
                storageConfigured,
                usesR2),
            new AdminPublicRoutingStatusResponse(
                publicSiteConfigured,
                // Physical tag links can only be generated from a configured
                // public site origin.
                publicSiteConfigured),
            new AdminOrderingStatusResponse(
                _features.SmartTagOrderingEnabled,
                activeDeliveryZones,
                _features.SmartTagOrderingEnabled && activeDeliveryZones > 0));
    }

    private bool SmtpConfigured()
    {
        if (string.Equals(
                _email.Provider?.Trim(),
                EmailOptions.DevelopmentProvider,
                StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(_email.Smtp.Host)
               && !string.IsNullOrWhiteSpace(_email.Smtp.Username)
               && !string.IsNullOrWhiteSpace(_email.Smtp.Password);
    }
}
