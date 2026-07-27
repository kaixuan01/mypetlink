using System.ComponentModel.DataAnnotations;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public sealed class OwnerPortalEntryService : SkeletonService, IOwnerPortalEntryService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IEmailOutboxService _emailOutboxService;
    private readonly EmailOptions _emailOptions;
    private readonly FeatureOptions _featureOptions;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<OwnerPortalEntryService> _logger;

    public OwnerPortalEntryService(
        MyPetLinkDbContext dbContext,
        IEmailOutboxService emailOutboxService,
        IOptions<EmailOptions> emailOptions,
        IOptions<FeatureOptions> featureOptions,
        TimeProvider timeProvider,
        ILogger<OwnerPortalEntryService> logger)
    {
        _dbContext = dbContext;
        _emailOutboxService = emailOutboxService;
        _emailOptions = emailOptions.Value;
        _featureOptions = featureOptions.Value;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public async Task EnterAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        if (!currentUserId.HasValue)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "unauthorized",
                "Authentication is required.");
        }

        var user = await _dbContext.Users
            .Include(item => item.OwnerProfile)
            .Include(item => item.ExternalLogins)
            .Include(item => item.EmailOutboxMessages)
            .SingleOrDefaultAsync(
                item => item.Id == currentUserId.Value
                        && item.DeletedAt == null,
                cancellationToken);

        if (user is null || user.Status != UserStatus.Active)
        {
            throw new ApiException(
                StatusCodes.Status401Unauthorized,
                "unauthorized",
                "Authentication is required.");
        }

        if (user.OwnerProfile is null)
        {
            _logger.LogInformation(
                "Owner welcome email was not queued ({ReasonCode}) for user {UserId}.",
                "owner-profile-unavailable",
                user.Id);
            return;
        }

        if (!_emailOptions.Enabled || !_emailOptions.Templates.OwnerWelcomeEnabled)
        {
            return;
        }

        if (!HasEligibleVerifiedEmail(user, out var reasonCode))
        {
            _logger.LogInformation(
                "Owner welcome email was not queued ({ReasonCode}) for user {UserId}.",
                reasonCode,
                user.Id);
            return;
        }

        if (!TryBuildOwnerPortalUrl(out var ownerPortalUrl))
        {
            _logger.LogWarning(
                "Owner welcome email was not queued ({ReasonCode}).",
                "owner-portal-url-unavailable");
            return;
        }

        var now = _timeProvider.GetUtcNow();
        var template = new OwnerWelcomeEmailTemplateData(
            SuitableGreetingName(user),
            ownerPortalUrl,
            now,
            _featureOptions.SmartTagOrderingEnabled);
        var message = _emailOutboxService.EnqueueOwnerWelcome(user, template);
        if (message is null)
        {
            return;
        }

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            user.EmailOutboxMessages.Remove(message);
            _dbContext.Entry(message).State = EntityState.Detached;

            var alreadyQueued = await _dbContext.EmailOutbox
                .AsNoTracking()
                .AnyAsync(
                    item => item.RelatedUserId == user.Id
                            && item.MessageType == EmailMessageType.OwnerWelcome,
                    cancellationToken);
            if (!alreadyQueued)
            {
                throw;
            }
        }
    }

    private static bool HasEligibleVerifiedEmail(User user, out string reasonCode)
    {
        var email = user.Email?.Trim() ?? "";
        if (email.Length is 0 or > 320
            || ContainsHeaderBreak(email)
            || !new EmailAddressAttribute().IsValid(email))
        {
            reasonCode = "invalid-local-email";
            return false;
        }

        var normalized = NormalizeEmail(email);
        if (!string.Equals(normalized, user.NormalizedEmail, StringComparison.Ordinal))
        {
            reasonCode = "normalized-email-mismatch";
            return false;
        }

        var verifiedIdentity = user.ExternalLogins.Any(login =>
            login.EmailVerifiedAt.HasValue
            && !ContainsHeaderBreak(login.ProviderEmail)
            && string.Equals(
                NormalizeEmail(login.ProviderEmail),
                normalized,
                StringComparison.Ordinal));
        if (!verifiedIdentity)
        {
            reasonCode = "verified-identity-unavailable";
            return false;
        }

        reasonCode = "eligible";
        return true;
    }

    private static string SuitableGreetingName(User user)
    {
        var candidate = user.OwnerProfile?.OwnerDisplayName;
        if (string.IsNullOrWhiteSpace(candidate))
        {
            candidate = user.DisplayName;
        }

        candidate = candidate?.Replace("\r", " ", StringComparison.Ordinal)
            .Replace("\n", " ", StringComparison.Ordinal)
            .Trim();
        if (string.IsNullOrWhiteSpace(candidate)
            || candidate.Contains('@'))
        {
            return "";
        }

        var at = user.Email.IndexOf('@', StringComparison.Ordinal);
        var emailPrefix = at > 0 ? user.Email[..at] : user.Email;
        if (string.Equals(candidate, emailPrefix, StringComparison.OrdinalIgnoreCase)
            || string.Equals(candidate, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            return "";
        }

        var separator = candidate.IndexOfAny([' ', '\t']);
        return separator > 0 ? candidate[..separator] : candidate;
    }

    private bool TryBuildOwnerPortalUrl(out string ownerPortalUrl)
    {
        ownerPortalUrl = "";
        var configuredBaseUrl = _emailOptions.OwnerPortalBaseUrl?.Trim();
        if (string.IsNullOrWhiteSpace(configuredBaseUrl))
        {
            return false;
        }

        if (!Uri.TryCreate(
                configuredBaseUrl.TrimEnd('/') + "/",
                UriKind.Absolute,
                out var baseUri)
            || baseUri.Scheme is not ("https" or "http")
            || !string.IsNullOrEmpty(baseUri.UserInfo))
        {
            return false;
        }

        ownerPortalUrl = new Uri(baseUri, "pets/new").AbsoluteUri;
        return true;
    }

    private static string NormalizeEmail(string email) =>
        email.Trim().ToUpper(CultureInfo.InvariantCulture);

    private static bool ContainsHeaderBreak(string value) =>
        value.Contains('\r') || value.Contains('\n');
}
