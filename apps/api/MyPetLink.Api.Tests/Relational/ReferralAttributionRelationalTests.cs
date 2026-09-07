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

namespace MyPetLink.Api.Tests.Relational;

public sealed class ReferralAttributionRelationalTests
{
    [RelationalFact]
    public async Task ConcurrentFirstLoginCreatesOneOwnerAndOneAttribution()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using (var seed = scope.NewContext())
        {
            seed.Salespersons.Add(new Salesperson
            {
                SalespersonCode = "MPL-SP-0901", ReferralCode = "RACE", Name = "Race Seller", IsActive = true
            });
            await seed.SaveChangesAsync();
        }

        await using var firstDb = scope.NewContext();
        await using var secondDb = scope.NewContext();
        var capturedAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        var request = new GoogleLoginRequest("same-token", "race", capturedAt);
        var context = new AuthClientContext("127.0.0.1", "tests");
        var results = await Task.WhenAll(
            CreateAuthService(firstDb).SignInWithGoogleAsync(request, context),
            CreateAuthService(secondDb).SignInWithGoogleAsync(request, context));

        Assert.All(results, result => Assert.NotEmpty(result.AccessToken));
        await using var verify = scope.NewContext();
        Assert.Single(await verify.Users.Where(item => item.NormalizedEmail == "RACE@EXAMPLE.COM").ToListAsync());
        Assert.Single(await verify.OwnerReferralAttributions.ToListAsync());
    }

    [RelationalFact]
    public async Task ReferralCodeUniquenessIsCaseInsensitive()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        db.Salespersons.Add(new Salesperson
        {
            SalespersonCode = "MPL-SP-1001", ReferralCode = "AMANDA", Name = "Amanda", IsActive = true
        });
        await db.SaveChangesAsync();
        db.Salespersons.Add(new Salesperson
        {
            SalespersonCode = "MPL-SP-1002", ReferralCode = "amanda", Name = "Other", IsActive = true
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [RelationalFact]
    public async Task OwnerCanHaveOnlyOneAttribution()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        await using var db = scope.NewContext();
        var user = new User { Email = "owner@example.com", NormalizedEmail = "OWNER@EXAMPLE.COM", DisplayName = "Owner" };
        var first = new Salesperson { SalespersonCode = "MPL-SP-1101", ReferralCode = "FIRST", Name = "First" };
        var second = new Salesperson { SalespersonCode = "MPL-SP-1102", ReferralCode = "SECOND", Name = "Second" };
        db.AddRange(user, first, second);
        await db.SaveChangesAsync();
        db.OwnerReferralAttributions.Add(new OwnerReferralAttribution
        {
            UserId = user.Id, SalespersonId = first.Id, ReferralCodeSnapshot = "FIRST",
            SalespersonCodeSnapshot = first.SalespersonCode, SalespersonNameSnapshot = first.Name,
            AttributionSource = ReferralAttributionSource.ReferralLink,
            CapturedAt = DateTimeOffset.UtcNow, AttributedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        db.OwnerReferralAttributions.Add(new OwnerReferralAttribution
        {
            UserId = user.Id, SalespersonId = second.Id, ReferralCodeSnapshot = "SECOND",
            SalespersonCodeSnapshot = second.SalespersonCode, SalespersonNameSnapshot = second.Name,
            AttributionSource = ReferralAttributionSource.ReferralLink,
            CapturedAt = DateTimeOffset.UtcNow, AttributedAt = DateTimeOffset.UtcNow
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    private static AuthService CreateAuthService(MyPetLinkDbContext db)
    {
        var audit = new AuditLogService(db, new HttpContextAccessor());
        return new AuthService(
            db, new RaceTokenAuth(),
            Options.Create(new JwtOptions
            {
                Issuer = "tests", Audience = "tests",
                SigningKey = "relational-referral-race-signing-key-long-enough"
            }),
            Options.Create(new AdminSeedOptions()),
            Options.Create(new DevAuthOptions()),
            Options.Create(new ReferralAttributionOptions()),
            new NoopSeeder(), new TestEnvironment(), audit, TimeProvider.System);
    }

    private sealed class RaceTokenAuth : IExternalAuthService
    {
        public Task<ExternalTokenUser> ValidateAsync(string provider, string token, CancellationToken cancellationToken) =>
            Task.FromResult(new ExternalTokenUser(provider, "same-subject", "race@example.com", true, "Race Owner"));
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
