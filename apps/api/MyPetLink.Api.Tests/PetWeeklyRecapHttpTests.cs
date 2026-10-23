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
/// The Weekly Recap over the real HTTP pipeline: signed-in owners only, the
/// standard envelope, and <c>private, no-store</c> on every answer —
/// including the sign-in challenge, automatic validation errors and the
/// error handler's responses, which clear headers set earlier.
/// </summary>
public sealed class PetWeeklyRecapHttpTests
{
    private static readonly Guid Owner = Guid.Parse("a1111111-1111-1111-1111-111111111111");
    private static readonly Guid Stranger = Guid.Parse("a2222222-2222-2222-2222-222222222222");
    private static readonly Guid OwnerPet = Guid.Parse("a3333333-3333-3333-3333-333333333331");
    private static readonly Guid MemorialPet = Guid.Parse("a3333333-3333-3333-3333-333333333332");
    private static readonly Guid StrangerPet = Guid.Parse("a3333333-3333-3333-3333-333333333333");

    private static DateOnly MalaysiaToday() => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));

    private static DateOnly ThisMonday()
    {
        var today = MalaysiaToday();
        return today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
    }

    [Fact]
    public async Task Owner_GetsTheirPetsWeek_PrivateAndWithoutRecordContents()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync(
            $"/api/v1/pets/{OwnerPet}/weekly-recap?weekStart={ThisMonday():yyyy-MM-dd}");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertPrivateNoStore(response);
        using var json = JsonDocument.Parse(body);
        var data = json.RootElement.GetProperty("data");
        Assert.Equal(OwnerPet, data.GetProperty("petId").GetGuid());
        Assert.Equal("Milo", data.GetProperty("petName").GetString());
        Assert.Equal(ThisMonday().ToString("yyyy-MM-dd"), data.GetProperty("weekStart").GetString());
        Assert.True(data.GetProperty("isCurrentWeek").GetBoolean());
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", data.GetProperty("asOfDate").GetString()!);

        var moments = data.GetProperty("moments");
        Assert.Equal(1, moments.GetProperty("total").GetInt32());
        var moment = Assert.Single(moments.GetProperty("items").EnumerateArray());
        Assert.Equal("Park walk", moment.GetProperty("title").GetString());
        Assert.Equal("Private", moment.GetProperty("visibility").GetString());

        var care = data.GetProperty("care");
        var coming = Assert.Single(care.GetProperty("comingUp").GetProperty("items").EnumerateArray());
        Assert.Equal("Vaccine", coming.GetProperty("type").GetString());
        Assert.Equal("due-soon", coming.GetProperty("status").GetString());

        foreach (var secret in new[] { "Private note", "Klinik Haiwan", "Secret caption", "owner@example.com", "Stranger" })
        {
            Assert.DoesNotContain(secret, body);
        }
    }

    [Fact]
    public async Task WithoutAWeek_TheLastCompleteWeekIsReturned()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync($"/api/v1/pets/{OwnerPet}/weekly-recap");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var data = json.RootElement.GetProperty("data");
        Assert.Equal(ThisMonday().AddDays(-7).ToString("yyyy-MM-dd"), data.GetProperty("weekStart").GetString());
        Assert.False(data.GetProperty("isCurrentWeek").GetBoolean());
    }

    [Fact]
    public async Task NoOneSignedIn_IsChallenged_WithoutCaching()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(null).GetAsync($"/api/v1/pets/{OwnerPet}/weekly-recap");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task AStrangersPet_IsNotFound_WithoutCaching()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync($"/api/v1/pets/{StrangerPet}/weekly-recap");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertPrivateNoStore(response);
        Assert.DoesNotContain("Rex", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task AMemorialPet_HasNoRecap()
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync($"/api/v1/pets/{MemorialPet}/weekly-recap");

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        AssertPrivateNoStore(response);
        Assert.Contains("weekly_recap_unavailable", await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("not-a-date")]
    [InlineData("tuesday")]
    public async Task AnUnreadableWeek_IsRejected_WithoutCaching(string weekStart)
    {
        await using var factory = await SeededFactory.CreateAsync();

        var response = await factory.As(Owner).GetAsync($"/api/v1/pets/{OwnerPet}/weekly-recap?weekStart={weekStart}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertPrivateNoStore(response);
    }

    [Fact]
    public async Task AWeekThatIsNotAMonday_IsNamedInTheEnvelope()
    {
        await using var factory = await SeededFactory.CreateAsync();
        var tuesday = ThisMonday().AddDays(-6);

        var response = await factory.As(Owner).GetAsync(
            $"/api/v1/pets/{OwnerPet}/weekly-recap?weekStart={tuesday:yyyy-MM-dd}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertPrivateNoStore(response);
        Assert.Contains("weekStart", await response.Content.ReadAsStringAsync());
    }

    private static void AssertPrivateNoStore(HttpResponseMessage response)
    {
        var cacheControl = response.Headers.CacheControl;
        Assert.NotNull(cacheControl);
        Assert.True(cacheControl!.Private);
        Assert.True(cacheControl.NoStore);
    }

    private sealed class SeededFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"weekly-recap-http-{Guid.NewGuid():N}";

        public static async Task<SeededFactory> CreateAsync()
        {
            var factory = new SeededFactory();
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            db.Users.Add(NewUser(Owner, "owner@example.com"));
            db.Users.Add(NewUser(Stranger, "stranger@example.com"));
            db.Pets.Add(NewPet(OwnerPet, Owner, "Milo", PetLifecycleStatus.Active));
            db.Pets.Add(NewPet(MemorialPet, Owner, "Bobo", PetLifecycleStatus.Memorial));
            db.Pets.Add(NewPet(StrangerPet, Stranger, "Rex", PetLifecycleStatus.Active));
            var today = MalaysiaToday();
            db.PetMemories.Add(new PetMemory
            {
                PetId = OwnerPet,
                AuthorUserId = Owner,
                Title = "Park walk",
                Caption = "Secret caption",
                MomentDate = today,
                Type = "Everyday",
                Visibility = MemoryVisibility.Private
            });
            db.PetMemories.Add(new PetMemory
            {
                PetId = StrangerPet,
                AuthorUserId = Stranger,
                Title = "Stranger walk",
                MomentDate = today,
                Type = "Everyday",
                Visibility = MemoryVisibility.Public
            });
            db.CareRecords.Add(new CareRecord
            {
                PetId = OwnerPet,
                Type = CareRecordType.Vaccine,
                Title = "Rabies booster",
                RecordDate = today.AddDays(-30),
                DueDate = today.AddDays(14),
                Notes = "Private note",
                Provider = "Klinik Haiwan"
            });
            await db.SaveChangesAsync();
            foreach (var pet in db.Pets)
            {
                pet.CreatedAt = DateTimeOffset.UtcNow.AddYears(-1);
            }
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
                    ["Jwt:Issuer"] = "MyPetLink.WeeklyRecap.Tests",
                    ["Jwt:Audience"] = "MyPetLink.WeeklyRecap.Client",
                    ["Jwt:SigningKey"] = "weekly-recap-http-test-signing-key-long-enough",
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

        private static Pet NewPet(Guid id, Guid ownerId, string name, PetLifecycleStatus lifecycle) => new()
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{id.ToString("N")[..4]}",
            Name = name,
            Species = "Dog",
            LifecycleStatus = lifecycle
        };
    }

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "WeeklyRecapHttpTest";
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
