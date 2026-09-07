using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class ReferralAttributionAuthTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-09-07T12:00:00Z");

    [Fact]
    public async Task NewGoogleOwnerCapturesActiveReferralCaseInsensitivelyOnce()
    {
        await using var harness = await Harness.CreateAsync();

        await harness.SignInAsync("owner@example.com", "amanda", Now.AddDays(-2));
        await harness.SignInAsync("owner@example.com", "SECOND", Now);

        var attribution = await harness.Db.OwnerReferralAttributions.SingleAsync();
        Assert.Equal(harness.ActiveSalesperson.Id, attribution.SalespersonId);
        Assert.Equal("AMANDA", attribution.ReferralCodeSnapshot);
        Assert.Equal(ReferralAttributionSource.ReferralLink, attribution.AttributionSource);
        Assert.Equal(Now.AddDays(-2), attribution.CapturedAt);
        Assert.Single(await harness.Db.AuditLogs
            .Where(item => item.Action == "owner-referral-attribution.capture").ToListAsync());
    }

    [Theory]
    [InlineData("UNKNOWN", -1)]
    [InlineData("INACTIVE", -1)]
    [InlineData("A-!", -1)]
    [InlineData("AMANDA", -91)]
    [InlineData("AMANDA", 1)]
    public async Task InvalidReferralNeverBlocksNewOwnerSignIn(string code, int capturedDays)
    {
        await using var harness = await Harness.CreateAsync();
        var response = await harness.SignInAsync(
            $"owner-{Guid.NewGuid():N}@example.com", code, Now.AddDays(capturedDays));

        Assert.NotEmpty(response.AccessToken);
        Assert.Empty(await harness.Db.OwnerReferralAttributions.ToListAsync());
    }

    [Fact]
    public async Task ExistingOwnerIsNeverAttributedByALaterReferralClick()
    {
        await using var harness = await Harness.CreateAsync();
        await harness.SignInAsync("existing@example.com", null, null);
        await harness.SignInAsync("existing@example.com", "AMANDA", Now);
        Assert.Empty(await harness.Db.OwnerReferralAttributions.ToListAsync());
    }

    [Fact]
    public void ReferralWindowValidationFailsClosedForInvalidValues()
    {
        var validator = new ReferralAttributionOptionsValidator();
        Assert.False(validator.Validate(null, new ReferralAttributionOptions { WindowDays = 0 }).Succeeded);
        Assert.True(validator.Validate(null, new ReferralAttributionOptions { WindowDays = 90 }).Succeeded);
    }

    private sealed class Harness : IAsyncDisposable
    {
        private Harness(MyPetLinkDbContext db, AuthService service, Salesperson active)
        {
            Db = db;
            Service = service;
            ActiveSalesperson = active;
        }

        public MyPetLinkDbContext Db { get; }
        public AuthService Service { get; }
        public Salesperson ActiveSalesperson { get; }

        public static async Task<Harness> CreateAsync()
        {
            var clock = new FixedTimeProvider(Now);
            var db = new MyPetLinkDbContext(new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N")).Options, clock);
            db.Plans.Add(new Plan { Code = "Free", Name = "Free", Status = PlanStatus.Available });
            var active = new Salesperson
            {
                SalespersonCode = "MPL-SP-0001", ReferralCode = "AMANDA", Name = "Amanda", IsActive = true
            };
            db.Salespersons.AddRange(active, new Salesperson
            {
                SalespersonCode = "MPL-SP-0002", ReferralCode = "INACTIVE", Name = "Inactive", IsActive = false
            });
            await db.SaveChangesAsync();

            var audit = new AuditLogService(db, new HttpContextAccessor());
            var service = new AuthService(
                db,
                new TokenAuth(),
                Options.Create(new JwtOptions
                {
                    Issuer = "tests", Audience = "tests",
                    SigningKey = "referral-attribution-tests-signing-key-long-enough"
                }),
                Options.Create(new AdminSeedOptions()),
                Options.Create(new DevAuthOptions()),
                Options.Create(new ReferralAttributionOptions { WindowDays = 90 }),
                new NoopSeeder(),
                new TestEnvironment(),
                audit,
                clock);
            return new Harness(db, service, active);
        }

        public Task<AuthTokenResponse> SignInAsync(
            string email, string? code, DateTimeOffset? capturedAt) =>
            Service.SignInWithGoogleAsync(
                new GoogleLoginRequest(email, code, capturedAt),
                new AuthClientContext("127.0.0.1", "tests"));

        public ValueTask DisposeAsync() => Db.DisposeAsync();
    }

    private sealed class TokenAuth : IExternalAuthService
    {
        public Task<ExternalTokenUser> ValidateAsync(string provider, string token, CancellationToken cancellationToken) =>
            Task.FromResult(new ExternalTokenUser(provider, token, token, true, token.Split('@')[0]));
    }

    private sealed class NoopSeeder : IDevelopmentAdminSeeder
    {
        public Task<bool> EnsureSeededAsync(CancellationToken cancellationToken = default) => Task.FromResult(false);
    }

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "Tests";
        public string ContentRootPath { get; set; } = "";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
