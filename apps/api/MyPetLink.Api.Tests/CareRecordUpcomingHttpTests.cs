using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The pending-care read over the real HTTP pipeline: it routes beside the
/// GUID-constrained record route, requires a signed-in owner, answers in the
/// standard envelope with the filtered total, and carries no record contents
/// beyond what the overview shows.
/// </summary>
public sealed class CareRecordUpcomingHttpTests
{
    private static readonly Guid Owner = Guid.Parse("e1111111-1111-1111-1111-111111111111");
    private static readonly Guid Stranger = Guid.Parse("e2222222-2222-2222-2222-222222222222");
    private static readonly Guid OwnerPet = Guid.Parse("e3333333-3333-3333-3333-333333333331");
    private static readonly Guid StrangerPet = Guid.Parse("e3333333-3333-3333-3333-333333333332");
    private static readonly Guid OwnerRecord = Guid.Parse("e4444444-4444-4444-4444-444444444441");
    private static readonly Guid StrangerRecord = Guid.Parse("e4444444-4444-4444-4444-444444444442");

    [Fact]
    public async Task AnonymousCaller_IsRejected()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(null).GetAsync("/api/v1/care-records/upcoming");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Owner_GetsTheirPendingCareInTheEnvelope_WithoutRecordContents()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync("/api/v1/care-records/upcoming?page=1&pageSize=10");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(body);
        var data = json.RootElement.GetProperty("data");
        var meta = json.RootElement.GetProperty("meta");
        Assert.Equal(1, meta.GetProperty("total").GetInt32());
        Assert.Equal(1, meta.GetProperty("page").GetInt32());
        Assert.Equal(10, meta.GetProperty("pageSize").GetInt32());
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", data.GetProperty("asOfDate").GetString()!);
        Assert.Equal(OwnerPet, Assert.Single(data.GetProperty("petIdsWithCareRecords").EnumerateArray()).GetGuid());

        var item = Assert.Single(data.GetProperty("items").EnumerateArray());
        Assert.Equal("Rabies booster", item.GetProperty("title").GetString());
        Assert.Equal("Milo", item.GetProperty("petName").GetString());
        Assert.Equal("Vaccine", item.GetProperty("type").GetString());
        Assert.False(item.TryGetProperty("notes", out _));
        Assert.False(item.TryGetProperty("provider", out _));
        Assert.False(item.TryGetProperty("documents", out _));
        Assert.DoesNotContain("Private note", body);
        Assert.DoesNotContain("Stranger booster", body);
    }

    [Fact]
    public async Task AnotherOwnersPet_CannotBeUsedAsAFilter()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync($"/api/v1/care-records/upcoming?petId={StrangerPet}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task PageSizeAboveTheLimit_IsRejected()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync("/api/v1/care-records/upcoming?pageSize=101");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("/api/v1/care-records/upcoming/summary")]
    [InlineData("/api/v1/care-records/e4444444-4444-4444-4444-444444444441/completion")]
    public async Task NewReads_RequireASignedInOwner(string path)
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(null).GetAsync(path);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Summary_ReturnsTheOwnersScopesOnly_WithoutRecordContents()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync("/api/v1/care-records/upcoming/summary");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(body);
        var data = json.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("complete").GetBoolean());
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", data.GetProperty("horizonDate").GetString()!);
        var scopes = data.GetProperty("scopes").EnumerateArray().ToArray();
        Assert.Equal(2, scopes.Length);
        var all = scopes.Single(scope => scope.GetProperty("petId").ValueKind == JsonValueKind.Null);
        Assert.Equal(1, all.GetProperty("pendingCount").GetInt32());
        Assert.True(all.GetProperty("hasCareRecords").GetBoolean());
        Assert.Equal(OwnerPet, scopes.Single(scope => scope.GetProperty("petId").ValueKind != JsonValueKind.Null).GetProperty("petId").GetGuid());
        Assert.Equal("Rabies booster", Assert.Single(all.GetProperty("items").EnumerateArray()).GetProperty("title").GetString());
        Assert.DoesNotContain("Private note", body);
        Assert.DoesNotContain("Klinik Haiwan", body);
        Assert.DoesNotContain("Stranger booster", body);
    }

    [Fact]
    public async Task CompletionStatus_AnswersForTheOwnersRecordAndHidesAStrangers()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var own = await factory.As(Owner).GetAsync($"/api/v1/care-records/{OwnerRecord}/completion");
        Assert.Equal(HttpStatusCode.OK, own.StatusCode);
        using var json = JsonDocument.Parse(await own.Content.ReadAsStringAsync());
        var data = json.RootElement.GetProperty("data");
        Assert.Equal("pending", data.GetProperty("state").GetString());
        Assert.Equal(JsonValueKind.Null, data.GetProperty("completion").ValueKind);
        Assert.Equal(OwnerRecord, data.GetProperty("target").GetProperty("id").GetGuid());

        var strangers = await factory.As(Owner).GetAsync($"/api/v1/care-records/{StrangerRecord}/completion");
        Assert.Equal(HttpStatusCode.NotFound, strangers.StatusCode);
    }

    // ---- One-step completion ------------------------------------------------

    private static StringContent CompletionBody(Guid key, string completedOn, string? nextDueDate = null, string? notes = null) =>
        new(
            JsonSerializer.Serialize(new { idempotencyKey = key, completedOn, nextDueDate, notes }),
            System.Text.Encoding.UTF8,
            "application/json");

    private static string MalaysiaToday() =>
        DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)).ToString("yyyy-MM-dd");

    [Fact]
    public async Task Complete_RequiresASignedInOwner()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(null).PostAsync(
            $"/api/v1/care-records/{OwnerRecord}/complete",
            CompletionBody(Guid.NewGuid(), MalaysiaToday()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Complete_CreatesOnce_ThenReplaysTheSameRequest()
    {
        await using var factory = await SeededFactory.CreateAsync();
        var key = Guid.NewGuid();
        var client = factory.As(Owner);

        var first = await client.PostAsync($"/api/v1/care-records/{OwnerRecord}/complete", CompletionBody(key, MalaysiaToday(), notes: "Done at the clinic"));
        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        using var created = JsonDocument.Parse(await first.Content.ReadAsStringAsync());
        var completion = created.RootElement.GetProperty("data").GetProperty("completion");
        Assert.Equal("created", created.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(OwnerRecord, completion.GetProperty("fulfillsCareRecordId").GetGuid());
        Assert.Equal("Private", completion.GetProperty("publicVisibility").GetString());
        Assert.Equal("Rabies booster", completion.GetProperty("title").GetString());

        // The response was lost; the client retries with the same key.
        var retry = await client.PostAsync($"/api/v1/care-records/{OwnerRecord}/complete", CompletionBody(key, MalaysiaToday(), notes: "Done at the clinic"));
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        using var replayed = JsonDocument.Parse(await retry.Content.ReadAsStringAsync());
        Assert.Equal("replayed", replayed.RootElement.GetProperty("data").GetProperty("outcome").GetString());
        Assert.Equal(
            completion.GetProperty("id").GetGuid(),
            replayed.RootElement.GetProperty("data").GetProperty("completion").GetProperty("id").GetGuid());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
        Assert.Equal(1, await db.CareRecords.CountAsync(record => record.FulfillsCareRecordId == OwnerRecord));
    }

    [Fact]
    public async Task Complete_TheSameKeyForADifferentRequest_IsAConflict()
    {
        await using var factory = await SeededFactory.CreateAsync();
        var key = Guid.NewGuid();
        var client = factory.As(Owner);
        await client.PostAsync($"/api/v1/care-records/{OwnerRecord}/complete", CompletionBody(key, MalaysiaToday()));

        var conflicting = await client.PostAsync(
            $"/api/v1/care-records/{OwnerRecord}/complete",
            CompletionBody(key, MalaysiaToday(), nextDueDate: DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)).AddYears(1).ToString("yyyy-MM-dd")));

        Assert.Equal(HttpStatusCode.Conflict, conflicting.StatusCode);
        Assert.Contains("idempotency_key_conflict", await conflicting.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Complete_AStrangersItem_IsNotFound_AndWritesNothing()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).PostAsync(
            $"/api/v1/care-records/{StrangerRecord}/complete",
            CompletionBody(Guid.NewGuid(), MalaysiaToday()));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
        Assert.False(await db.CareRecords.AnyAsync(record => record.FulfillsCareRecordId == StrangerRecord));
    }

    [Fact]
    public async Task Complete_InvalidFields_AreNamedInTheEnvelope()
    {
        await using var factory = await SeededFactory.CreateAsync();
        var tomorrow = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8)).AddDays(1).ToString("yyyy-MM-dd");

        var future = await factory.As(Owner).PostAsync(
            $"/api/v1/care-records/{OwnerRecord}/complete",
            CompletionBody(Guid.NewGuid(), tomorrow));
        var noKey = await factory.As(Owner).PostAsync(
            $"/api/v1/care-records/{OwnerRecord}/complete",
            CompletionBody(Guid.Empty, MalaysiaToday()));

        Assert.Equal(HttpStatusCode.BadRequest, future.StatusCode);
        Assert.Contains("completedOn", await future.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.BadRequest, noKey.StatusCode);
        Assert.Contains("idempotencyKey", await noKey.Content.ReadAsStringAsync());
    }

    private sealed class SeededFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"care-upcoming-http-{Guid.NewGuid():N}";

        public static async Task<SeededFactory> CreateAsync()
        {
            var factory = new SeededFactory();
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            db.Users.Add(NewUser(Owner, "owner@example.com"));
            db.Users.Add(NewUser(Stranger, "stranger@example.com"));
            db.Pets.Add(NewPet(OwnerPet, Owner, "Milo"));
            db.Pets.Add(NewPet(StrangerPet, Stranger, "Rex"));
            var today = DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
            db.CareRecords.Add(NewRecord(OwnerPet, "Rabies booster", today.AddDays(-30), today.AddDays(14), OwnerRecord));
            db.CareRecords.Add(NewRecord(OwnerPet, "Bath", today.AddDays(-2), null));
            db.CareRecords.Add(NewRecord(StrangerPet, "Stranger booster", today.AddDays(-30), today.AddDays(3), StrangerRecord));
            await db.SaveChangesAsync();
            return factory;
        }

        public HttpClient As(Guid? userId)
        {
            var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            if (userId.HasValue)
            {
                client.DefaultRequestHeaders.Add(TestAuthHandler.Header, userId.Value.ToString());
            }

            return client;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.CareUpcoming.Tests",
                    ["Jwt:Audience"] = "MyPetLink.CareUpcoming.Client",
                    ["Jwt:SigningKey"] = "care-upcoming-http-test-signing-key-long-enough",
                    ["DevAuth:Enabled"] = "false"
                }));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<DbContextOptions<MyPetLinkDbContext>>();
                services.RemoveAll<MyPetLinkDbContext>();
                services.AddDbContext<MyPetLinkDbContext>(options => options.UseInMemoryDatabase(_database));
            });
            builder.ConfigureTestServices(services =>
            {
                services.AddAuthentication(options =>
                    {
                        options.DefaultAuthenticateScheme = TestAuthHandler.SchemeName;
                        options.DefaultChallengeScheme = TestAuthHandler.SchemeName;
                        options.DefaultForbidScheme = TestAuthHandler.SchemeName;
                    })
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestAuthHandler.SchemeName, _ => { });
            });
        }

        private static User NewUser(Guid id, string email) => new()
        {
            Id = id,
            Email = email,
            NormalizedEmail = email.ToUpperInvariant(),
            DisplayName = "Owner",
            Status = UserStatus.Active
        };

        private static Pet NewPet(Guid id, Guid ownerId, string name) => new()
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
            Name = name,
            Species = "Dog"
        };

        private static CareRecord NewRecord(Guid petId, string title, DateOnly recordDate, DateOnly? dueDate, Guid? id = null) => new()
        {
            Id = id ?? Guid.NewGuid(),
            PetId = petId,
            Type = CareRecordType.Vaccine,
            Title = title,
            RecordDate = recordDate,
            DueDate = dueDate,
            Notes = "Private note",
            Provider = "Klinik Haiwan",
            PublicVisibility = CareRecordPublicVisibility.Private
        };
    }

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "CareUpcomingHttpTest";
        public const string Header = "X-Test-User";

        public TestAuthHandler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(Header, out var value)
                || !Guid.TryParse(value.ToString(), out var userId))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "Owner")],
                SchemeName);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
