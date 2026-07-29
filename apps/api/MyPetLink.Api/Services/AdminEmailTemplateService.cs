using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Services;

public interface IAdminEmailTemplateService
{
    Task<AdminEmailTemplateListResponse> ListAsync(
        CancellationToken cancellationToken = default);

    Task<AdminEmailTemplateResponse> SetEnabledAsync(
        string messageType,
        UpdateEmailTemplateRequest request,
        Guid adminUserId,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Admin Portal backing service for per-template email enablement.
///
/// Enablement is a runtime business decision, so it lives in the
/// EmailTemplateSettings table with an audit trail and RowVersion concurrency.
/// The global <c>Email:Enabled</c> switch stays in application configuration
/// and is reported here read-only — an administrator can see it but never
/// change it.
/// </summary>
public sealed class AdminEmailTemplateService : IAdminEmailTemplateService
{
    private readonly MyPetLinkDbContext _dbContext;
    private readonly IAuditLogService _auditLogService;
    private readonly EmailOptions _options;
    private readonly ILogger<AdminEmailTemplateService> _logger;
    private readonly TimeProvider _timeProvider;

    public AdminEmailTemplateService(
        MyPetLinkDbContext dbContext,
        IAuditLogService auditLogService,
        IOptions<EmailOptions> options,
        ILogger<AdminEmailTemplateService> logger,
        TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _auditLogService = auditLogService;
        _options = options.Value;
        _logger = logger;
        _timeProvider = timeProvider;
    }

    public async Task<AdminEmailTemplateListResponse> ListAsync(
        CancellationToken cancellationToken = default)
    {
        try
        {
            return await ListCoreAsync(cancellationToken);
        }
        catch (Exception exception) when (EmailTemplateSchemaUnavailable.IsMatch(exception))
        {
            LogSchemaUnavailable(exception);
            throw EmailTemplateSchemaUnavailable.ApiError();
        }
    }

    private async Task<AdminEmailTemplateListResponse> ListCoreAsync(
        CancellationToken cancellationToken)
    {
        var settings = await _dbContext.EmailTemplateSettings
            .AsNoTracking()
            .Include(setting => setting.UpdatedByAdminUser)
            .ThenInclude(admin => admin!.User)
            .ToDictionaryAsync(setting => setting.MessageType, cancellationToken);

        var countRows = await _dbContext.EmailOutbox
            .AsNoTracking()
            .GroupBy(item => new { item.MessageType, item.Status })
            .Select(group => new
            {
                group.Key.MessageType,
                group.Key.Status,
                Count = group.Count()
            })
            .ToListAsync(cancellationToken);
        var counts = countRows.ToDictionary(
            row => (row.MessageType, row.Status),
            row => row.Count);

        // Pending is split by what the worker would actually do with the row,
        // so an administrator never sees permanently blocked work presented as
        // ordinary queued work.
        var pendingFromEnabled = new Dictionary<EmailMessageType, int>();
        foreach (var setting in settings.Values.Where(item => item.IsEnabled && item.EnabledFromUtc != null))
        {
            pendingFromEnabled[setting.MessageType] = await _dbContext.EmailOutbox
                .AsNoTracking()
                .CountAsync(
                    item => item.MessageType == setting.MessageType
                            && item.Status == EmailOutboxStatus.Pending
                            && item.CreatedAt >= setting.EnabledFromUtc,
                    cancellationToken);
        }

        // Every supported message type is listed, whether or not a row exists.
        // A missing row means the template has never been switched on, which
        // resolves to disabled.
        var templates = Enum.GetValues<EmailMessageType>()
            .Select(messageType =>
            {
                settings.TryGetValue(messageType, out var setting);
                var pendingTotal = Count(counts, messageType, EmailOutboxStatus.Pending);
                var afterEnable = pendingFromEnabled.TryGetValue(messageType, out var value)
                    ? value
                    : 0;
                var blocked = pendingTotal - afterEnable;
                var eligible = _options.Enabled ? afterEnable : 0;
                var paused = _options.Enabled ? 0 : afterEnable;
                return new AdminEmailTemplateResponse(
                    messageType.ToString(),
                    DisplayName(messageType),
                    Description(messageType),
                    setting?.IsEnabled ?? false,
                    setting?.EnabledFromUtc,
                    setting?.UpdatedAt,
                    setting?.UpdatedByAdminUser?.User?.DisplayName,
                    eligible,
                    paused,
                    blocked,
                    Count(counts, messageType, EmailOutboxStatus.Suppressed),
                    Count(counts, messageType, EmailOutboxStatus.Failed),
                    Count(counts, messageType, EmailOutboxStatus.Sent),
                    setting is null
                        ? Convert.ToBase64String(Array.Empty<byte>())
                        : Convert.ToBase64String(setting.RowVersion));
            })
            .ToArray();

        return new AdminEmailTemplateListResponse(
            templates,
            new AdminEmailGlobalStateResponse(
                _options.Enabled,
                SmtpConfigured(),
                _options.Provider));
    }

    private static int Count(
        IReadOnlyDictionary<(EmailMessageType, EmailOutboxStatus), int> counts,
        EmailMessageType messageType,
        EmailOutboxStatus status) =>
        counts.TryGetValue((messageType, status), out var value) ? value : 0;

    public async Task<AdminEmailTemplateResponse> SetEnabledAsync(
        string messageType,
        UpdateEmailTemplateRequest request,
        Guid actorUserId,
        CancellationToken cancellationToken = default)
    {
        if (!Enum.TryParse<EmailMessageType>(messageType, ignoreCase: true, out var parsed)
            || !Enum.IsDefined(parsed))
        {
            throw new ApiException(
                StatusCodes.Status404NotFound,
                "not_found",
                "That email template was not found.");
        }

        EmailTemplateSetting? setting;
        Guid updatedByAdminUserId;
        try
        {
            setting = await _dbContext.EmailTemplateSettings
                .SingleOrDefaultAsync(item => item.MessageType == parsed, cancellationToken);
            updatedByAdminUserId = await ResolveAdminUserIdAsync(
                actorUserId,
                cancellationToken);
        }
        catch (Exception exception) when (EmailTemplateSchemaUnavailable.IsMatch(exception))
        {
            LogSchemaUnavailable(exception);
            throw EmailTemplateSchemaUnavailable.ApiError();
        }

        var now = _timeProvider.GetUtcNow();
        var isNew = setting is null;

        if (setting is null)
        {
            setting = new EmailTemplateSetting
            {
                Id = Guid.NewGuid(),
                MessageType = parsed,
                IsEnabled = false,
                CreatedAt = now,
                UpdatedAt = now
            };
            _dbContext.EmailTemplateSettings.Add(setting);
        }
        else
        {
            if (string.IsNullOrWhiteSpace(request.RowVersion))
            {
                throw IncompleteRequest();
            }

            byte[] supplied;
            try
            {
                supplied = Convert.FromBase64String(request.RowVersion);
            }
            catch (FormatException)
            {
                throw Conflict();
            }

            if (!supplied.SequenceEqual(setting.RowVersion))
            {
                throw Conflict();
            }

            if (setting.IsEnabled == request.IsEnabled)
            {
                var current = await ListAsync(cancellationToken);
                return current.Templates.Single(item =>
                    string.Equals(
                        item.MessageType,
                        parsed.ToString(),
                        StringComparison.Ordinal));
            }
        }

        var before = Snapshot(setting);
        setting.IsEnabled = request.IsEnabled;
        // EnabledFromUtc is refreshed on every enable, which is what keeps a
        // previously suppressed or pending backlog permanently out of scope.
        setting.EnabledFromUtc = request.IsEnabled ? now : null;
        setting.UpdatedByAdminUserId = updatedByAdminUserId;
        setting.UpdatedAt = now;

        _auditLogService.Append(
            actorUserId,
            ActorType.Admin,
            request.IsEnabled ? "email.template.enable" : "email.template.disable",
            "EmailTemplateSetting",
            setting.Id,
            isNew ? null : before,
            Snapshot(setting));

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw Conflict();
        }
        catch (DbUpdateException exception)
            when (UniqueConstraintViolation.IsFor(
                      exception,
                      "IX_EmailTemplateSettings_MessageType"))
        {
            // Two administrators enabled the same template for the first time
            // at once. The unique index is the authority; the loser retries.
            throw Conflict();
        }
        catch (DbUpdateException exception)
            when (EmailTemplateSchemaUnavailable.IsMatch(exception))
        {
            LogSchemaUnavailable(exception);
            throw EmailTemplateSchemaUnavailable.ApiError();
        }

        var refreshed = await ListAsync(cancellationToken);
        return refreshed.Templates.Single(item =>
            string.Equals(item.MessageType, parsed.ToString(), StringComparison.Ordinal));
    }

    private bool SmtpConfigured()
    {
        if (string.Equals(
                _options.Provider?.Trim(),
                EmailOptions.DevelopmentProvider,
                StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return !string.IsNullOrWhiteSpace(_options.Smtp.Host)
               && !string.IsNullOrWhiteSpace(_options.Smtp.Username)
               && !string.IsNullOrWhiteSpace(_options.Smtp.Password);
    }

    private static ApiException Conflict() =>
        new(
            StatusCodes.Status409Conflict,
            "concurrency_conflict",
            "This email template was changed by another administrator. Refresh the page and try again.");

    private static ApiException IncompleteRequest() =>
        new(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "The request is incomplete. Refresh the page and try again.",
            new Dictionary<string, string[]>
            {
                ["rowVersion"] =
                [
                    "Refresh the page before changing this email template."
                ]
            });

    private async Task<Guid> ResolveAdminUserIdAsync(
        Guid actorUserId,
        CancellationToken cancellationToken)
    {
        var adminUserId = await _dbContext.AdminUsers
            .AsNoTracking()
            .Where(admin => admin.UserId == actorUserId && admin.IsActive)
            .Select(admin => (Guid?)admin.Id)
            .SingleOrDefaultAsync(cancellationToken);

        return adminUserId
               ?? throw new ApiException(
                   StatusCodes.Status403Forbidden,
                   "forbidden",
                   "Active administrator access is required.");
    }

    private void LogSchemaUnavailable(Exception exception) =>
        _logger.LogError(
            exception,
            "Email template configuration is unavailable because migration {RequiredMigration} has not been applied.",
            EmailTemplateSchemaUnavailable.RequiredMigration);

    private static object Snapshot(EmailTemplateSetting setting) => new
    {
        messageType = setting.MessageType.ToString(),
        isEnabled = setting.IsEnabled,
        enabledFromUtc = setting.EnabledFromUtc,
        updatedByAdminUserId = setting.UpdatedByAdminUserId
    };

    private static string DisplayName(EmailMessageType messageType) => messageType switch
    {
        EmailMessageType.OwnerWelcome => "Welcome email",
        EmailMessageType.PaymentConfirmed => "Payment confirmation",
        _ => messageType.ToString()
    };

    private static string Description(EmailMessageType messageType) => messageType switch
    {
        EmailMessageType.OwnerWelcome =>
            "Sent once after a pet owner signs in to MyPetLink for the first time.",
        EmailMessageType.PaymentConfirmed =>
            "Sent when an order payment is confirmed, with a link to the Official Receipt.",
        _ => "Customer email."
    };
}
