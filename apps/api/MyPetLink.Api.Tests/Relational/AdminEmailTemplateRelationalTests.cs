using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

public sealed class AdminEmailTemplateRelationalTests
{
    private static readonly Guid AdminUserAccountId =
        Guid.Parse("e1111111-1111-1111-1111-111111111111");
    private static readonly Guid AdminRecordId =
        Guid.Parse("e1111111-1111-1111-1111-111111111112");
    private static readonly DateTimeOffset Now =
        DateTimeOffset.Parse("2026-07-29T06:00:00Z");

    [RelationalFact]
    public async Task FirstEnable_UpdateDisableAndReEnable_UseNativeRowVersions()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        SeedAdmin(db);
        await db.SaveChangesAsync();
        var clock = new MutableClock(Now);
        var service = Service(db, clock);

        var enabled = await service.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, null),
            AdminUserAccountId);

        Assert.True(enabled.IsEnabled);
        Assert.Equal(Now, enabled.EnabledFromUtc);
        Assert.False(string.IsNullOrWhiteSpace(enabled.RowVersion));
        Assert.Equal(AdminRecordId, await db.EmailTemplateSettings
            .Select(setting => setting.UpdatedByAdminUserId)
            .SingleAsync());

        clock.Advance(TimeSpan.FromMinutes(5));
        var disabled = await service.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(false, enabled.RowVersion),
            AdminUserAccountId);

        Assert.False(disabled.IsEnabled);
        Assert.Null(disabled.EnabledFromUtc);
        Assert.NotEqual(enabled.RowVersion, disabled.RowVersion);

        clock.Advance(TimeSpan.FromMinutes(5));
        var reEnabled = await service.SetEnabledAsync(
            "OwnerWelcome",
            new UpdateEmailTemplateRequest(true, disabled.RowVersion),
            AdminUserAccountId);

        Assert.True(reEnabled.IsEnabled);
        Assert.Equal(Now.AddMinutes(10), reEnabled.EnabledFromUtc);
        Assert.NotEqual(disabled.RowVersion, reEnabled.RowVersion);
        Assert.Equal(3, await db.AuditLogs.CountAsync());
        Assert.False((await service.ListAsync()).Templates
            .Single(template => template.MessageType == "PaymentConfirmed")
            .IsEnabled);
    }

    [RelationalFact]
    public async Task ConcurrentFirstEnable_CreatesOneRow_AndReturnsFriendlyConflict()
    {
        var barrier = new FirstEmailTemplateInsertBarrier();
        await using var scope = await RelationalDatabase.CreateAsync(barrier);
        await using (var seed = scope.NewContext())
        {
            SeedAdmin(seed);
            await seed.SaveChangesAsync();
        }

        await using var firstDb = scope.NewContext();
        await using var secondDb = scope.NewContext();
        var first = Service(firstDb, new MutableClock(Now));
        var second = Service(secondDb, new MutableClock(Now));

        var results = await Task.WhenAll(
            Capture(() => first.SetEnabledAsync(
                "PaymentConfirmed",
                new UpdateEmailTemplateRequest(true, null),
                AdminUserAccountId)),
            Capture(() => second.SetEnabledAsync(
                "PaymentConfirmed",
                new UpdateEmailTemplateRequest(true, null),
                AdminUserAccountId)));

        Assert.Equal(1, results.Count(result => result.Response is not null));
        var conflict = Assert.Single(results
            .Where(result => result.Error is not null)
            .Select(result => Assert.IsType<ApiException>(result.Error)));
        Assert.Equal(StatusCodes.Status409Conflict, conflict.StatusCode);
        Assert.Equal("concurrency_conflict", conflict.Code);

        await using var verify = scope.NewContext();
        Assert.Equal(
            1,
            await verify.EmailTemplateSettings.CountAsync(setting =>
                setting.MessageType == EmailMessageType.PaymentConfirmed));
    }

    [RelationalFact]
    public async Task MissingEmailTemplateMigration_ReturnsSafeError_AndOperationalStatusIsUnavailable()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        await db.Database.ExecuteSqlRawAsync("DROP TABLE [EmailTemplateSettings];");

        var service = Service(db, new MutableClock(Now));
        var error = await Assert.ThrowsAsync<ApiException>(() => service.ListAsync());

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, error.StatusCode);
        Assert.Equal("email_template_configuration_unavailable", error.Code);
        Assert.Equal(
            "Email template configuration is not available because the database update has not been applied.",
            error.Message);
        Assert.DoesNotContain("EmailTemplateSettings", error.Message, StringComparison.Ordinal);

        var operational = new AdminOperationalStatusService(
            db,
            Options.Create(CreateEmailOptions()),
            Options.Create(new StorageOptions
            {
                Provider = "Local",
                LocalRoot = "local-test-storage"
            }),
            Options.Create(new CloudflareR2Options()),
            Options.Create(new PublicSiteOptions()),
            Options.Create(new FeatureOptions()));
        var status = await operational.GetAsync();

        Assert.False(status.Email.TemplateConfigurationAvailable);
        Assert.Equal(0, status.Email.EnabledTemplateCount);
        Assert.True(status.Email.GlobalDeliveryEnabled);
        Assert.True(status.Email.SmtpConfigured);
    }

    private static AdminEmailTemplateService Service(
        MyPetLinkDbContext db,
        TimeProvider clock) =>
        new(
            db,
            new AuditLogService(db, new HttpContextAccessor()),
            Options.Create(CreateEmailOptions()),
            NullLogger<AdminEmailTemplateService>.Instance,
            clock);

    private static EmailOptions CreateEmailOptions() =>
        new()
        {
            Enabled = true,
            Provider = MyPetLink.Api.Common.EmailOptions.DevelopmentProvider,
            OwnerPortalBaseUrl = "http://localhost:3000"
        };

    private static void SeedAdmin(MyPetLinkDbContext db)
    {
        db.Users.Add(new User
        {
            Id = AdminUserAccountId,
            Email = "email-admin@example.com",
            NormalizedEmail = "EMAIL-ADMIN@EXAMPLE.COM",
            DisplayName = "Email Admin",
            Status = UserStatus.Active,
            AdminUser = new AdminUser
            {
                Id = AdminRecordId,
                UserId = AdminUserAccountId,
                Role = AdminRole.Admin,
                IsActive = true
            }
        });
    }

    private static async Task<(AdminEmailTemplateResponse? Response, Exception? Error)> Capture(
        Func<Task<AdminEmailTemplateResponse>> action)
    {
        try
        {
            return (await action(), null);
        }
        catch (Exception exception)
        {
            return (null, exception);
        }
    }

    private sealed class MutableClock(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;

        public void Advance(TimeSpan delta) => _now += delta;

        public override DateTimeOffset GetUtcNow() => _now;
    }

    private sealed class FirstEmailTemplateInsertBarrier : SaveChangesInterceptor
    {
        private readonly TaskCompletionSource _bothReady =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _arrivals;

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            var addsTemplate = eventData.Context?.ChangeTracker
                .Entries<EmailTemplateSetting>()
                .Any(entry => entry.State == EntityState.Added) == true;
            if (!addsTemplate)
            {
                return result;
            }

            if (Interlocked.Increment(ref _arrivals) == 2)
            {
                _bothReady.TrySetResult();
            }

            await _bothReady.Task.WaitAsync(cancellationToken);
            return result;
        }
    }
}
