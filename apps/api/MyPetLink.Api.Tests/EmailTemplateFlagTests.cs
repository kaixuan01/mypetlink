using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Delivery requires the global <c>Email:Enabled</c> App Setting AND that
/// message type's row in EmailTemplateSettings. Enabling a template releases
/// only events recorded after the decision, never a historical backlog.
/// </summary>
public sealed class EmailTemplateFlagTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-07-29T03:00:00Z");

    [Theory]
    // Global switch off: nothing sends, whatever the database rows say.
    [InlineData(false, false, false, false, false)]
    [InlineData(false, true, true, false, false)]
    // Global switch on: each template follows only its own database row.
    [InlineData(true, false, false, false, false)]
    [InlineData(true, true, false, true, false)]
    [InlineData(true, false, true, false, true)]
    [InlineData(true, true, true, true, true)]
    public async Task DeliveryFollowsGlobalSwitchAndPerTemplateRow(
        bool globalEnabled,
        bool welcomeEnabled,
        bool paymentEnabled,
        bool expectWelcomeSent,
        bool expectPaymentSent)
    {
        using var harness = Harness.Create(globalEnabled);
        await harness.SetTemplateAsync(EmailMessageType.OwnerWelcome, welcomeEnabled);
        await harness.SetTemplateAsync(EmailMessageType.PaymentConfirmed, paymentEnabled);
        await harness.SeedPendingAsync();

        await harness.DispatchAllAsync();

        Assert.Equal(expectWelcomeSent, await harness.IsSentAsync(EmailMessageType.OwnerWelcome));
        Assert.Equal(expectPaymentSent, await harness.IsSentAsync(EmailMessageType.PaymentConfirmed));
        Assert.Equal(
            (expectWelcomeSent ? 1 : 0) + (expectPaymentSent ? 1 : 0),
            harness.Sender.CallCount);
    }

    [Fact]
    public async Task MissingTemplateRow_MeansDisabled()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedPendingAsync();

        await harness.DispatchAllAsync();

        Assert.Equal(0, harness.Sender.CallCount);
        Assert.Equal(
            EmailOutboxStatus.Pending,
            (await harness.MessageAsync(EmailMessageType.PaymentConfirmed)).Status);
    }

    [Fact]
    public async Task EnablingOneTemplate_DoesNotReleaseAnother()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SetTemplateAsync(EmailMessageType.OwnerWelcome, true);
        await harness.SeedPendingAsync();

        await harness.DispatchAllAsync();

        Assert.True(await harness.IsSentAsync(EmailMessageType.OwnerWelcome));
        Assert.Equal(
            EmailOutboxStatus.Pending,
            (await harness.MessageAsync(EmailMessageType.PaymentConfirmed)).Status);
    }

    [Fact]
    public async Task EnablingLater_DoesNotDispatchHistoricalMessages()
    {
        // The backlog case: messages recorded before the template was switched
        // on stay blocked permanently, because EnabledFromUtc is later.
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedPendingAsync();
        await harness.DispatchAllAsync();
        Assert.Equal(0, harness.Sender.CallCount);

        await harness.SetTemplateAsync(
            EmailMessageType.PaymentConfirmed,
            true,
            enabledFrom: Now.AddHours(1));

        await harness.DispatchAllAsync();
        await harness.DispatchAllAsync();

        var historical = await harness.MessageAsync(EmailMessageType.PaymentConfirmed);
        Assert.Equal(EmailOutboxStatus.Pending, historical.Status);
        Assert.Equal(0, historical.AttemptCount);
        Assert.Equal(0, harness.Sender.CallCount);
    }

    [Fact]
    public async Task NewEventsAfterEnablement_DispatchNormally()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SetTemplateAsync(
            EmailMessageType.PaymentConfirmed,
            true,
            enabledFrom: Now.AddMinutes(-10));
        await harness.SeedPendingAsync();

        await harness.DispatchAllAsync();

        var message = await harness.MessageAsync(EmailMessageType.PaymentConfirmed);
        Assert.Equal(EmailOutboxStatus.Sent, message.Status);
        Assert.Equal(1, message.AttemptCount);
        Assert.Equal(1, harness.Sender.CallCount);
    }

    [Fact]
    public async Task DisabledTemplate_DoesNotAttemptFailOrMutateTheRow()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedPendingAsync();
        var before = await harness.MessageAsync(EmailMessageType.PaymentConfirmed);
        var originalNextAttempt = before.NextAttemptAt;

        await harness.DispatchAllAsync();
        await harness.DispatchAllAsync();
        await harness.DispatchAllAsync();

        var after = await harness.MessageAsync(EmailMessageType.PaymentConfirmed);
        Assert.Equal(EmailOutboxStatus.Pending, after.Status);
        Assert.NotEqual(EmailOutboxStatus.Failed, after.Status);
        Assert.Equal(0, after.AttemptCount);
        Assert.Null(after.LastAttemptAt);
        Assert.Null(after.LastError);
        Assert.Null(after.SentAt);
        Assert.Equal(originalNextAttempt, after.NextAttemptAt);
    }

    [Fact]
    public async Task DisabledTemplate_ClaimsNothingSoTheWorkerDoesNotSpin()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedPendingAsync();

        Assert.Empty(await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)));
    }

    [Fact]
    public async Task SuppressedMessages_AreNeverDispatchable()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedSuppressedAsync(EmailMessageType.PaymentConfirmed);
        await harness.SetTemplateAsync(
            EmailMessageType.PaymentConfirmed,
            true,
            enabledFrom: Now.AddHours(-2));

        await harness.DispatchAllAsync();

        var message = await harness.MessageAsync(EmailMessageType.PaymentConfirmed);
        Assert.Equal(EmailOutboxStatus.Suppressed, message.Status);
        Assert.Equal(0, message.AttemptCount);
        Assert.Equal(0, harness.Sender.CallCount);
    }

    [Fact]
    public async Task DisabledTemplate_RecordsSuppressedInsteadOfPending()
    {
        using var harness = Harness.Create(globalEnabled: true);
        var user = await harness.SeedOwnerAsync();

        var message = await harness.Outbox.EnqueueOwnerWelcomeAsync(
            user,
            new OwnerWelcomeEmailTemplateData(
                "Aina",
                "http://localhost:3000/pets/new",
                Now,
                SmartTagsEnabled: false));
        await harness.Db.SaveChangesAsync();

        Assert.NotNull(message);
        Assert.Equal(EmailOutboxStatus.Suppressed, message!.Status);
        Assert.NotNull(message.SuppressionReason);
        Assert.Equal(0, message.AttemptCount);
    }

    [Fact]
    public async Task EnabledTemplate_RecordsDispatchablePending()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SetTemplateAsync(
            EmailMessageType.OwnerWelcome,
            true,
            enabledFrom: Now.AddHours(-1));
        var user = await harness.SeedOwnerAsync();

        var message = await harness.Outbox.EnqueueOwnerWelcomeAsync(
            user,
            new OwnerWelcomeEmailTemplateData(
                "Aina",
                "http://localhost:3000/pets/new",
                Now,
                SmartTagsEnabled: false));
        await harness.Db.SaveChangesAsync();

        Assert.NotNull(message);
        Assert.Equal(EmailOutboxStatus.Pending, message!.Status);
        Assert.Null(message.SuppressionReason);
    }

    [Fact]
    public async Task AdminEnable_IsAuditedAndStampsEnabledFrom()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();

        var response = await harness.AdminTemplates.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, null),
            Harness.AdminId);

        Assert.True(response.IsEnabled);
        Assert.Equal(Now, response.EnabledFromUtc);
        Assert.NotNull(response.UpdatedAt);
        Assert.Equal(Harness.AdminRecordId, await harness.Db.EmailTemplateSettings
            .Select(setting => setting.UpdatedByAdminUserId)
            .SingleAsync());
        var log = Assert.Single(await harness.Db.AuditLogs.ToListAsync());
        Assert.Equal("email.template.enable", log.Action);
        Assert.Equal("EmailTemplateSetting", log.Entity);
        Assert.Equal(Harness.AdminId, log.ActorId);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task AdminFirstEnable_DoesNotRequireRowVersion(string? rowVersion)
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();

        var response = await harness.AdminTemplates.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, rowVersion),
            Harness.AdminId);

        Assert.True(response.IsEnabled);
        Assert.Equal(Now, response.EnabledFromUtc);
        Assert.Single(await harness.Db.EmailTemplateSettings.ToListAsync());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public async Task AdminExistingUpdate_RequiresRowVersion(string? rowVersion)
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();
        await harness.SetTemplateAsync(EmailMessageType.OwnerWelcome, false);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.AdminTemplates.SetEnabledAsync(
                "OwnerWelcome",
                new UpdateEmailTemplateRequest(true, rowVersion),
                Harness.AdminId));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);
        Assert.Equal("validation_failed", error.Code);
        Assert.Contains("incomplete", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AdminDisable_ClearsEnabledFromAndIsAudited()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();
        await harness.AdminTemplates.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, null),
            Harness.AdminId);
        var rowVersion = await harness.EnsureRowVersionAsync(
            EmailMessageType.OwnerWelcome);

        var response = await harness.AdminTemplates.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(false, rowVersion),
            Harness.AdminId);

        Assert.False(response.IsEnabled);
        Assert.Null(response.EnabledFromUtc);
        Assert.Contains(
            await harness.Db.AuditLogs.ToListAsync(),
            log => log.Action == "email.template.disable");
    }

    [Fact]
    public async Task RepeatedEnable_IsIdempotentAndDoesNotRestampOrAudit()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();
        await harness.SetTemplateAsync(
            EmailMessageType.OwnerWelcome,
            true,
            enabledFrom: Now.AddDays(-1));
        var rowVersion = await harness.EnsureRowVersionAsync(
            EmailMessageType.OwnerWelcome);

        var response = await harness.AdminTemplates.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, rowVersion),
            Harness.AdminId);

        Assert.True(response.IsEnabled);
        Assert.Equal(Now.AddDays(-1), response.EnabledFromUtc);
        Assert.Empty(await harness.Db.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task AdminUpdate_RejectsAStaleRowVersion()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();
        await harness.AdminTemplates.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, null),
            Harness.AdminId);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.AdminTemplates.SetEnabledAsync(
                "OwnerWelcome",
                new UpdateEmailTemplateRequest(false, Convert.ToBase64String(new byte[] { 9, 9, 9 })),
                Harness.AdminId));

        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
        Assert.Contains("another administrator", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AdminUpdate_RejectsAnUnknownTemplate()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.AdminTemplates.SetEnabledAsync(
                "NotARealTemplate",
                new UpdateEmailTemplateRequest(true, null),
                Harness.AdminId));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
    }

    [Fact]
    public async Task AdminList_ShowsEverySupportedTemplateAndNoSecrets()
    {
        using var harness = Harness.Create(globalEnabled: true, smtpPassword: "super-secret-value");

        var response = await harness.AdminTemplates.ListAsync();

        Assert.Equal(Enum.GetValues<EmailMessageType>().Length, response.Templates.Count);
        Assert.All(response.Templates, template => Assert.False(template.IsEnabled));
        Assert.True(response.Global.GlobalDeliveryEnabled);

        var serialized = System.Text.Json.JsonSerializer.Serialize(response);
        Assert.DoesNotContain("super-secret-value", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("smtppro", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AdminList_ReportsOutboxCountsPerTemplate()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedPendingAsync();
        await harness.SeedSuppressedAsync(EmailMessageType.PaymentConfirmed, replace: true);

        var response = await harness.AdminTemplates.ListAsync();

        var payment = response.Templates.Single(item => item.MessageType == "PaymentConfirmed");
        Assert.Equal(1, payment.SuppressedCount);
        Assert.Equal(0, payment.EligibleCount);
        Assert.Equal(0, payment.BlockedCount);
    }

    // --- Release-safety: ineligible-Pending and rollback guarantees ----------

    [Fact]
    public async Task GlobalPause_KeepsMessagesPendingAndResumesWhenReEnabled()
    {
        // A global pause is infrastructure, not a business decision: messages
        // stay Pending and resume, rather than being permanently suppressed.
        using var paused = Harness.Create(globalEnabled: false);
        await paused.SetTemplateAsync(
            EmailMessageType.PaymentConfirmed,
            true,
            enabledFrom: Now.AddDays(-1));
        await paused.SeedPendingAsync();

        await paused.DispatchAllAsync();

        var held = await paused.MessageAsync(EmailMessageType.PaymentConfirmed);
        Assert.Equal(EmailOutboxStatus.Pending, held.Status);
        Assert.Null(held.SuppressionReason);
        Assert.Equal(0, held.AttemptCount);

        var pausedView = await paused.AdminTemplates.ListAsync();
        var pausedRow = pausedView.Templates.Single(item => item.MessageType == "PaymentConfirmed");
        Assert.Equal(0, pausedRow.EligibleCount);
        Assert.Equal(1, pausedRow.PausedCount);
        Assert.Equal(0, pausedRow.BlockedCount);

        using var resumed = paused.WithGlobal(true);
        await resumed.DispatchAllAsync();

        Assert.Equal(
            EmailOutboxStatus.Sent,
            (await resumed.MessageAsync(EmailMessageType.PaymentConfirmed)).Status);
    }

    [Fact]
    public async Task GlobalPause_DoesNotSuppressNewEventsForAnEnabledTemplate()
    {
        using var harness = Harness.Create(globalEnabled: false);
        await harness.SetTemplateAsync(
            EmailMessageType.OwnerWelcome,
            true,
            enabledFrom: Now.AddDays(-1));
        var user = await harness.SeedOwnerAsync();

        var message = await harness.Outbox.EnqueueOwnerWelcomeAsync(
            user,
            new OwnerWelcomeEmailTemplateData("Aina", "http://localhost:3000/pets/new", Now, false));
        await harness.Db.SaveChangesAsync();

        Assert.NotNull(message);
        Assert.Equal(EmailOutboxStatus.Pending, message!.Status);
        Assert.Null(message.SuppressionReason);
    }

    [Fact]
    public async Task DisableThenReEnable_LeavesEarlierPendingRowsBlockedNotEligible()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SeedAdminAsync();
        await harness.AdminTemplates.SetEnabledAsync(
            "PaymentConfirmed",
            new UpdateEmailTemplateRequest(true, null),
            Harness.AdminId);
        await harness.SeedPendingAtAsync(EmailMessageType.PaymentConfirmed, Now.AddMinutes(5));
        var rowVersion = await harness.EnsureRowVersionAsync(
            EmailMessageType.PaymentConfirmed);

        await harness.AdminTemplates.SetEnabledAsync(
            "PaymentConfirmed",
            new UpdateEmailTemplateRequest(false, rowVersion),
            Harness.AdminId);
        harness.Advance(TimeSpan.FromHours(1));
        await harness.AdminTemplates.SetEnabledAsync(
            "PaymentConfirmed",
            new UpdateEmailTemplateRequest(true, rowVersion),
            Harness.AdminId);

        await harness.DispatchAllAsync();

        var message = await harness.MessageAsync(EmailMessageType.PaymentConfirmed);
        Assert.Equal(EmailOutboxStatus.Pending, message.Status);
        Assert.Equal(0, message.AttemptCount);
        Assert.Equal(0, harness.Sender.CallCount);

        var view = await harness.AdminTemplates.ListAsync();
        var row = view.Templates.Single(item => item.MessageType == "PaymentConfirmed");
        Assert.Equal(0, row.EligibleCount);
        Assert.Equal(1, row.BlockedCount);
    }

    [Fact]
    public async Task DisabledAfterQueueing_ReportsBlockedNotEligible()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SetTemplateAsync(
            EmailMessageType.PaymentConfirmed,
            true,
            enabledFrom: Now.AddDays(-1));
        await harness.SeedPendingAsync();

        foreach (var setting in await harness.Db.EmailTemplateSettings.ToListAsync())
        {
            setting.IsEnabled = false;
            setting.EnabledFromUtc = null;
        }

        await harness.Db.SaveChangesAsync();
        await harness.DispatchAllAsync();

        var view = await harness.AdminTemplates.ListAsync();
        var row = view.Templates.Single(item => item.MessageType == "PaymentConfirmed");
        Assert.Equal(0, row.EligibleCount);
        Assert.Equal(1, row.BlockedCount);
        Assert.Equal(0, harness.Sender.CallCount);
    }

    [Fact]
    public async Task AdminCounts_MatchWorkerEligibility()
    {
        using var harness = Harness.Create(globalEnabled: true);
        await harness.SetTemplateAsync(
            EmailMessageType.PaymentConfirmed,
            true,
            enabledFrom: Now.AddDays(-1));
        await harness.SeedPendingAsync();

        var view = await harness.AdminTemplates.ListAsync();
        var row = view.Templates.Single(item => item.MessageType == "PaymentConfirmed");
        var claims = await harness.Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2));

        // The count an administrator reads must equal what the worker will do.
        Assert.Equal(row.EligibleCount, claims.Count);
    }

    [Fact]
    public async Task SuppressionReasons_AreTypedNotExceptionText()
    {
        using var harness = Harness.Create(globalEnabled: true);
        var user = await harness.SeedOwnerAsync();

        var message = await harness.Outbox.EnqueueOwnerWelcomeAsync(
            user,
            new OwnerWelcomeEmailTemplateData("Aina", "http://localhost:3000/pets/new", Now, false));
        await harness.Db.SaveChangesAsync();

        Assert.Equal(EmailSuppressionReasons.TemplateDisabled, message!.SuppressionReason);
        Assert.DoesNotContain("Exception", message.SuppressionReason!);
    }

    [Fact]
    public void LegacyAppSettingsTable_IsStillMappedForRollbackCompatibility()
    {
        // The previously deployed API still reads this table, so it must
        // survive this release even though nothing here uses it.
        using var harness = Harness.Create(globalEnabled: true);

        var entityType = harness.Db.Model.FindEntityType(typeof(AppSetting));

        Assert.NotNull(entityType);
        Assert.Equal("AppSettings", entityType!.GetTableName());
    }

    private sealed class Harness : IDisposable
    {
        public static readonly Guid AdminId = Guid.Parse("d1111111-1111-1111-1111-111111111111");
        public static readonly Guid AdminRecordId = Guid.Parse("d1111111-1111-1111-1111-111111111112");
        public static readonly Guid OwnerId = Guid.Parse("d2222222-2222-2222-2222-222222222222");
        public static readonly Guid OrderId = Guid.Parse("d3333333-3333-3333-3333-333333333333");

        public MyPetLinkDbContext Db { get; }
        public RecordingSender Sender { get; }

        public void Advance(TimeSpan delta) => _clock.Advance(delta);
        public EmailOutboxDispatcher Dispatcher { get; }
        public EmailOutboxService Outbox { get; }
        public AdminEmailTemplateService AdminTemplates { get; }

        private readonly PaymentConfirmationEmailTests.MutableTimeProvider _clock;
        private readonly string _databaseName;
        private readonly EmailOptions _options;

        private Harness(
            EmailOptions options,
            string? databaseName = null,
            RecordingSender? sender = null)
        {
            _options = options;
            _databaseName = databaseName ?? $"template-flags-{Guid.NewGuid():N}";
            Sender = sender ?? new RecordingSender();
            var clock = new PaymentConfirmationEmailTests.MutableTimeProvider(Now);
            _clock = clock;
            // The DbContext stamps CreatedAt on insert, so it must share the
            // test clock for EnabledFromUtc comparisons to be meaningful.
            Db = new MyPetLinkDbContext(
                new DbContextOptionsBuilder<MyPetLinkDbContext>()
                    .UseInMemoryDatabase(_databaseName)
                    .Options,
                clock);
            var optionValue = Options.Create(options);
            var layout = new TransactionalEmailLayout(optionValue);
            var gate = new EmailTemplateGate(Db, optionValue);
            var audit = new AuditLogService(Db, new HttpContextAccessor());
            Dispatcher = new EmailOutboxDispatcher(
                Db,
                new EmailTemplateRenderer(
                    new PaymentConfirmedEmailTemplateRenderer(optionValue, layout),
                    new OwnerWelcomeEmailTemplateRenderer(layout)),
                Sender,
                gate,
                clock,
                NullLogger<EmailOutboxDispatcher>.Instance);
            Outbox = new EmailOutboxService(Db, audit, clock, gate);
            AdminTemplates = new AdminEmailTemplateService(
                Db,
                audit,
                optionValue,
                NullLogger<AdminEmailTemplateService>.Instance,
                clock);
        }

        public static Harness Create(bool globalEnabled, string smtpPassword = "") =>
            new(new EmailOptions
            {
                Enabled = globalEnabled,
                Provider = EmailOptions.DevelopmentProvider,
                OwnerPortalBaseUrl = "http://localhost:3000",
                Smtp = new SmtpEmailOptions { Password = smtpPassword }
            });

        public async Task SetTemplateAsync(
            EmailMessageType messageType,
            bool isEnabled,
            DateTimeOffset? enabledFrom = null)
        {
            Db.EmailTemplateSettings.Add(new EmailTemplateSetting
            {
                Id = Guid.NewGuid(),
                MessageType = messageType,
                IsEnabled = isEnabled,
                EnabledFromUtc = isEnabled ? enabledFrom ?? Now.AddDays(-1) : null,
                CreatedAt = Now,
                UpdatedAt = Now
            });
            await Db.SaveChangesAsync();
        }

        /// <summary>Reopens the same database under a different global switch.</summary>
        public Harness WithGlobal(bool globalEnabled) =>
            new(
                new EmailOptions
                {
                    Enabled = globalEnabled,
                    Provider = _options.Provider,
                    OwnerPortalBaseUrl = _options.OwnerPortalBaseUrl,
                    Smtp = _options.Smtp
                },
                _databaseName,
                Sender);

        public async Task SeedPendingAtAsync(EmailMessageType messageType, DateTimeOffset createdAt)
        {
            var previous = _clock.GetUtcNow();
            _clock.Advance(createdAt - previous);
            Db.EmailOutbox.Add(Message(messageType, EmailOutboxStatus.Pending));
            await Db.SaveChangesAsync();
            _clock.Advance(previous - _clock.GetUtcNow());
        }

        public async Task SeedAdminAsync()
        {
            Db.Users.Add(new User
            {
                Id = AdminId,
                Email = "admin@example.com",
                NormalizedEmail = "ADMIN@EXAMPLE.COM",
                DisplayName = "Admin",
                Status = UserStatus.Active,
                AdminUser = new AdminUser
                {
                    Id = AdminRecordId,
                    UserId = AdminId,
                    Role = AdminRole.Admin,
                    IsActive = true
                }
            });
            await Db.SaveChangesAsync();
        }

        public async Task<string> EnsureRowVersionAsync(EmailMessageType messageType)
        {
            var setting = await Db.EmailTemplateSettings
                .SingleAsync(item => item.MessageType == messageType);
            if (setting.RowVersion.Length == 0)
            {
                // EF's InMemory provider does not generate SQL Server
                // rowversion values. Give this existing row a representative
                // token so service-level concurrency tests exercise the real
                // request contract.
                setting.RowVersion = [1, 2, 3, 4];
                await Db.SaveChangesAsync();
            }

            return Convert.ToBase64String(setting.RowVersion);
        }

        public async Task<User> SeedOwnerAsync()
        {
            var user = new User
            {
                Id = OwnerId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Aina",
                Status = UserStatus.Active
            };
            Db.Users.Add(user);
            await Db.SaveChangesAsync();
            return user;
        }

        public async Task SeedPendingAsync()
        {
            Db.EmailOutbox.AddRange(
                Message(EmailMessageType.OwnerWelcome, EmailOutboxStatus.Pending),
                Message(EmailMessageType.PaymentConfirmed, EmailOutboxStatus.Pending));
            await Db.SaveChangesAsync();
        }

        public async Task SeedSuppressedAsync(EmailMessageType messageType, bool replace = false)
        {
            if (replace)
            {
                Db.EmailOutbox.RemoveRange(
                    await Db.EmailOutbox.Where(item => item.MessageType == messageType).ToListAsync());
            }

            Db.EmailOutbox.Add(Message(messageType, EmailOutboxStatus.Suppressed));
            await Db.SaveChangesAsync();
        }

        public async Task DispatchAllAsync()
        {
            foreach (var claim in await Dispatcher.ClaimBatchAsync(10, TimeSpan.FromMinutes(2)))
            {
                await Dispatcher.DispatchAsync(claim);
            }
        }

        public async Task<EmailOutbox> MessageAsync(EmailMessageType messageType) =>
            await Db.EmailOutbox.SingleAsync(item => item.MessageType == messageType);

        public async Task<bool> IsSentAsync(EmailMessageType messageType) =>
            (await MessageAsync(messageType)).Status == EmailOutboxStatus.Sent;

        private static EmailOutbox Message(
            EmailMessageType messageType,
            EmailOutboxStatus status)
        {
            var queuedAt = Now.AddHours(-1);
            return new EmailOutbox
            {
                Id = Guid.NewGuid(),
                MessageType = messageType,
                RecipientEmail = "owner@example.com",
                RecipientName = "Owner",
                Subject = messageType == EmailMessageType.OwnerWelcome
                    ? "Welcome to MyPetLink"
                    : "Payment confirmed for order MPL-ORD-260729020000-1234",
                TemplateDataJson = messageType == EmailMessageType.OwnerWelcome
                    ? """
                      {"ownerName":"Aina","ownerPortalUrl":"http://localhost:3000/pets/new","welcomeEventAt":"2026-07-29T02:00:00+00:00","smartTagsEnabled":false}
                      """
                    : """
                      {"ownerName":"Aina","orderNumber":"MPL-ORD-260729020000-1234","amountPaid":67.00,"currency":"MYR","paymentConfirmedAt":"2026-07-29T02:00:00+00:00","productName":"MyPetLink QR + NFC Smart Tag","variantName":"Standard","petName":"Topu"}
                      """,
                RelatedUserId = messageType == EmailMessageType.OwnerWelcome ? OwnerId : null,
                RelatedOrderId = messageType == EmailMessageType.PaymentConfirmed ? OrderId : null,
                Status = status,
                SuppressionReason = status == EmailOutboxStatus.Suppressed
                    ? "This email was not sent because its template was switched off when the event happened."
                    : null,
                AttemptCount = 0,
                MaxAttempts = 5,
                NextAttemptAt = queuedAt,
                CreatedAt = queuedAt,
                UpdatedAt = queuedAt
            };
        }

        public void Dispose() => Db.Dispose();
    }

    private sealed class RecordingSender : IEmailSender
    {
        private int _callCount;

        public int CallCount => _callCount;

        public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Interlocked.Increment(ref _callCount);
            return Task.CompletedTask;
        }
    }
}
