using System.Net;
using System.Net.Http.Json;
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
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Report submission over the real HTTP pipeline: authentication, what the
/// request can and cannot say, one indistinguishable answer for everything a
/// reporter cannot see, idempotent answers, the rate limit, and that a report
/// leaves Collaboration, the Share and Safety Profiles and Smart Tags exactly
/// as they were. Test-only authentication on an in-memory host.
/// </summary>
public sealed class CommunityReportHttpFlowTests
{
    private static readonly Guid Alice = Guid.Parse("c9111111-1111-1111-1111-111111111111");   // @TanFamily, author
    private static readonly Guid Bob = Guid.Parse("c9222222-2222-2222-2222-222222222222");     // @LimFamily, collaborator
    private static readonly Guid Carol = Guid.Parse("c9333333-3333-3333-3333-333333333333");   // @CarolPets, reporter
    private static readonly Guid Dave = Guid.Parse("c9444444-4444-4444-4444-444444444444");    // Community off
    private static readonly Guid Gina = Guid.Parse("c9555555-5555-5555-5555-555555555555");    // suspended
    private static readonly Guid Hank = Guid.Parse("c9666666-6666-6666-6666-666666666666");    // incomplete
    private static readonly Guid Ivy = Guid.Parse("c9777777-7777-7777-7777-777777777777");     // restricted
    private static readonly Guid Moderator = Guid.Parse("c9888888-8888-8888-8888-888888888888");
    private static readonly Guid Mochi = Guid.Parse("c9a11111-1111-1111-1111-111111111111");
    private static readonly Guid Buddy = Guid.Parse("c9a22222-2222-2222-2222-222222222222");
    private const string TagCode = "MPL-REPT-TAG1";

    private static readonly Guid[] InternalIds = [Alice, Bob, Carol, Dave, Gina, Hank, Ivy, Moderator, Mochi, Buddy];

    [Fact]
    public async Task TheReporterIsTheSessionAndTheRequestCannotSayOtherwise()
    {
        await using var world = await World.CreateAsync();
        using var carol = world.As(Carol);
        using var anonymous = world.As(null);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await anonymous.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId))).StatusCode);

        var response = await carol.PostAsJsonAsync("/api/v1/social/reports", new
        {
            targetType = "moment",
            target = world.MomentId.ToString(),
            reason = "SpamOrScam",
            reporterUserId = Alice,
            reportedUserId = Carol,
            snapshotHandle = "someone-else",
            snapshotText = "made up",
            status = "Resolved",
            resolution = "Dismissed",
            reviewedByUserId = Moderator
        });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("{\"accepted\":true}", Data(body).GetRawText());
        foreach (var id in InternalIds.Append(world.MomentId))
        {
            Assert.DoesNotContain(id.ToString(), body, StringComparison.OrdinalIgnoreCase);
        }

        var stored = await world.QueryAsync(db => db.CommunityReports.SingleAsync());
        Assert.Equal((Carol, Alice, "TanFamily", "Beach day", CommunityReportStatus.Open),
            (stored.ReporterUserId, stored.ReportedUserId, stored.SnapshotHandle, stored.SnapshotTitle, stored.Status));
        Assert.Null(stored.Resolution);
        Assert.Null(stored.ReviewedByUserId);
    }

    [Fact]
    public async Task EverythingTheReporterCannotSeeGetsTheSameAnswer()
    {
        await using var world = await World.CreateAsync();
        using var carol = world.As(Carol);

        var answers = new List<(string Case, HttpStatusCode Status, string Error)>();
        async Task Probe(string label, string type, string target)
        {
            var response = await carol.PostAsJsonAsync("/api/v1/social/reports", new { targetType = type, target, reason = "SpamOrScam" });
            answers.Add((label, response.StatusCode, ErrorWithoutRequestId(await response.Content.ReadAsStringAsync())));
        }

        await Probe("missing moment", "moment", Guid.NewGuid().ToString());
        await Probe("malformed id", "moment", "not-an-id");
        await Probe("private moment", "moment", world.PrivateMomentId.ToString());
        await Probe("hidden moment", "moment", world.HiddenMomentId.ToString());
        await Probe("missing comment", "comment", Guid.NewGuid().ToString());
        await Probe("deleted comment", "comment", world.DeletedCommentId.ToString());
        await Probe("Community off", "household", "davepets");
        await Probe("suspended", "household", "ginahome");
        await Probe("incomplete identity", "household", "hankhome");
        await Probe("restricted", "household", "ivyhome");
        await Probe("nobody", "household", "nobodyhome");

        // Blocked: the Moment's author blocks the reporter.
        await world.MutateAsync(db => db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Alice, BlockedUserId = Carol }));
        await Probe("blocked moment", "moment", world.MomentId.ToString());
        await Probe("blocked comment", "comment", world.CommentId.ToString());
        await Probe("blocked household", "household", "tanfamily");

        var first = answers[0];
        Assert.Equal(HttpStatusCode.NotFound, first.Status);
        Assert.Contains("report_target_unavailable", first.Error);
        Assert.All(answers, answer => Assert.Equal((first.Status, first.Error), (answer.Status, answer.Error)));
        Assert.Equal(0, await world.QueryAsync(db => db.CommunityReports.CountAsync()));
    }

    [Fact]
    public async Task AReporterNeedsACommunityIdentity()
    {
        await using var world = await World.CreateAsync();
        using var dave = world.As(Dave);

        var refused = await dave.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId));
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Contains("community_profile_required", await refused.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ARepeatAnswersExactlyLikeTheFirst()
    {
        await using var world = await World.CreateAsync();
        using var carol = world.As(Carol);

        var first = await carol.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId, "SpamOrScam"));
        var second = await carol.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId, "Impersonation"));

        Assert.Equal((first.StatusCode, Data(await first.Content.ReadAsStringAsync()).GetRawText()),
            (second.StatusCode, Data(await second.Content.ReadAsStringAsync()).GetRawText()));
        var stored = await world.QueryAsync(db => db.CommunityReports.SingleAsync());
        Assert.Equal(CommunityReportReason.SpamOrScam, stored.Reason);
    }

    [Fact]
    public async Task TheRateLimitAppliesBeforeAnyTargetIsLookedUp()
    {
        await using var world = await World.CreateAsync(reportPermitLimit: 3);
        using var carol = world.As(Carol);

        for (var index = 0; index < 3; index += 1)
        {
            Assert.Equal(HttpStatusCode.OK,
                (await carol.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId))).StatusCode);
        }

        var visible = await carol.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId));
        var hidden = await carol.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.HiddenMomentId));
        Assert.Equal(HttpStatusCode.TooManyRequests, visible.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, hidden.StatusCode);
        Assert.Equal(ErrorWithoutRequestId(await visible.Content.ReadAsStringAsync()),
            ErrorWithoutRequestId(await hidden.Content.ReadAsStringAsync()));
        Assert.Contains("rate_limit_exceeded", await visible.Content.ReadAsStringAsync());
        Assert.Equal(1, await world.QueryAsync(db => db.CommunityReports.CountAsync()));
    }

    [Fact]
    public async Task AReportLeavesCollaborationShareSafetyAndSmartTagsUntouched()
    {
        await using var world = await World.CreateAsync();
        using var bob = world.As(Bob);
        using var carol = world.As(Carol);
        using var anonymous = world.As(null);
        var before = await UnrelatedPayloadsAsync(anonymous, world);

        // The collaborator reports the Moment; a stranger reports the Moment,
        // its Comment and its author.
        Assert.Equal(HttpStatusCode.OK, (await bob.PostAsJsonAsync("/api/v1/social/reports",
            new { targetType = "moment", target = world.MomentId.ToString(), reason = "Other", details = "Not what I agreed to" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await carol.PostAsJsonAsync("/api/v1/social/reports", Body("moment", world.MomentId))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await carol.PostAsJsonAsync("/api/v1/social/reports", Body("comment", world.CommentId))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await carol.PostAsJsonAsync("/api/v1/social/reports", Body("household", "tanfamily"))).StatusCode);

        Assert.Equal(before, await UnrelatedPayloadsAsync(anonymous, world));
        // Both Moment reports name the author, never the collaborator; the
        // household report names the author; the Comment report names its
        // writer (Bob, who happens to be the collaborator).
        var reported = await world.QueryAsync(db => db.CommunityReports
            .Select(item => new { item.TargetType, item.ReportedUserId })
            .ToListAsync());
        Assert.Equal(4, reported.Count);
        Assert.All(reported.Where(item => item.TargetType != CommunityReportTargetType.Comment),
            item => Assert.Equal(Alice, item.ReportedUserId));
        Assert.Equal(Bob, reported.Single(item => item.TargetType == CommunityReportTargetType.Comment).ReportedUserId);
    }

    // ---- helpers ----------------------------------------------------------

    private static object Body(string type, object target, string reason = "SpamOrScam") =>
        new { targetType = type, target = target.ToString(), reason };

    /// <summary>
    /// The Moment as the public sees it (with its collaborator), the Share and
    /// Safety Profiles, and all three Smart Tag entry points.
    /// </summary>
    private static async Task<string> UnrelatedPayloadsAsync(HttpClient client, World world)
    {
        var parts = new List<string>();
        foreach (var path in new[]
        {
            $"/api/v1/public/moments/{world.MomentId}",
            "/api/v1/public/pets/mochi-pubmochi",
            "/api/v1/public/safety/s-pubmochi",
            $"/api/v1/public/tags/{TagCode}",
            $"/api/v1/public/tags/{TagCode}/qr",
            $"/api/v1/public/tags/{TagCode}/nfc"
        })
        {
            var response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            parts.Add(Data(await response.Content.ReadAsStringAsync()).GetRawText());
        }

        Assert.Contains("LimFamily", parts[0]);
        Assert.All(parts.Skip(2), part => Assert.Contains("\"Mochi\"", part));
        return string.Join("\n", parts);
    }

    private static JsonElement Data(string body)
    {
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("data").Clone();
    }

    private static string ErrorWithoutRequestId(string body)
    {
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("error").GetRawText();
    }

    private sealed class World : IAsyncDisposable
    {
        private readonly ReportFactory _factory;

        private World(ReportFactory factory) => _factory = factory;

        public Guid MomentId { get; private set; }
        public Guid PrivateMomentId { get; private set; }
        public Guid HiddenMomentId { get; private set; }
        public Guid CommentId { get; private set; }
        public Guid DeletedCommentId { get; private set; }

        public static async Task<World> CreateAsync(int reportPermitLimit = 1000)
        {
            var world = new World(new ReportFactory(reportPermitLimit));
            using var scope = world._factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();

            SocialSurfaceHarness.AddOwner(db, Alice, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Bob, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family", true, true);
            SocialSurfaceHarness.AddOwner(db, Carol, "carol@example.com", "Carol Ng", "CarolPets", "Carol's Pets", true, false);
            SocialSurfaceHarness.AddOwner(db, Dave, "dave@example.com", "Dave Rao", "DavePets", "Dave's Pets", false, false);
            SocialSurfaceHarness.AddOwner(db, Gina, "gina@example.com", "Gina Yap", "GinaHome", "Gina's Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Hank, "hank@example.com", "Hank Koh", "HankHome", "Hank's Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Ivy, "ivy@example.com", "Ivy Lau", "IvyHome", "Ivy's Home", true, true);
            SocialSurfaceHarness.AddOwner(db, Moderator, "mod@example.com", "Moderator", "ModHome", "Mod Home", false, false);
            await db.SaveChangesAsync();

            SocialSurfaceHarness.AddPet(db, Mochi, Alice, "Mochi", "Cat", true, true);
            SocialSurfaceHarness.AddPet(db, Buddy, Bob, "Buddy", "Dog", true, true);
            (await db.Users.SingleAsync(user => user.Id == Gina)).Status = UserStatus.Suspended;
            (await db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Hank)).DisplayName = "";
            CommunityModeration.RestrictHousehold(
                await db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Ivy), Moderator, DateTimeOffset.UtcNow);
            db.SmartTags.Add(new SmartTag
            {
                TagCode = TagCode,
                OwnerUserId = Alice,
                PetId = Mochi,
                HasNfc = true,
                Status = SmartTagStatus.Active,
                ActivatedAt = DateTimeOffset.UtcNow.AddDays(-3)
            });

            var moment = Moment("Beach day", MemoryVisibility.Public);
            var privateMoment = Moment("Private", MemoryVisibility.Private);
            privateMoment.PublishedAt = null;
            var hiddenMoment = Moment("Hidden", MemoryVisibility.Public);
            CommunityModeration.HideMoment(hiddenMoment, Moderator, DateTimeOffset.UtcNow);
            db.PetMemories.AddRange(moment, privateMoment, hiddenMoment);
            db.MomentPets.AddRange(
                new MomentPet { MomentId = moment.Id, PetId = Mochi },
                new MomentPet { MomentId = privateMoment.Id, PetId = Mochi },
                new MomentPet { MomentId = hiddenMoment.Id, PetId = Mochi });

            // Bob collaborates on the Moment with Buddy.
            var collaboration = new MomentCollaboration
            {
                MomentId = moment.Id,
                InviterUserId = Alice,
                InviteeUserId = Bob,
                Status = MomentCollaborationStatus.Accepted,
                CreatedAt = DateTimeOffset.UtcNow.AddHours(-1),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(13),
                RespondedAt = DateTimeOffset.UtcNow.AddMinutes(-30)
            };
            db.MomentCollaborations.Add(collaboration);
            db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Buddy, CollaborationId = collaboration.Id });

            var comment = new MomentComment { MomentId = moment.Id, AuthorUserId = Bob, Body = "Lovely" };
            var deleted = new MomentComment
            {
                MomentId = moment.Id,
                AuthorUserId = Bob,
                Body = "",
                DeletedAt = DateTimeOffset.UtcNow,
                DeletedByUserId = Bob
            };
            db.MomentComments.AddRange(comment, deleted);
            await db.SaveChangesAsync();

            world.MomentId = moment.Id;
            world.PrivateMomentId = privateMoment.Id;
            world.HiddenMomentId = hiddenMoment.Id;
            world.CommentId = comment.Id;
            world.DeletedCommentId = deleted.Id;
            return world;
        }

        private static PetMemory Moment(string title, MemoryVisibility visibility) => new()
        {
            Id = Guid.NewGuid(),
            PetId = Mochi,
            AuthorUserId = Alice,
            Title = title,
            Type = "Memory",
            Visibility = visibility,
            PublishedAt = DateTimeOffset.UtcNow.AddHours(-2)
        };

        public async Task MutateAsync(Action<MyPetLinkDbContext> change)
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
            change(db);
            await db.SaveChangesAsync();
        }

        public async Task<T> QueryAsync<T>(Func<MyPetLinkDbContext, Task<T>> query)
        {
            using var scope = _factory.Services.CreateScope();
            return await query(scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>());
        }

        public HttpClient As(Guid? userId)
        {
            var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            if (userId.HasValue)
            {
                client.DefaultRequestHeaders.Add(TestAuthHandler.Header, userId.Value.ToString());
            }

            return client;
        }

        public ValueTask DisposeAsync() => _factory.DisposeAsync();
    }

    private sealed class ReportFactory(int reportPermitLimit) : WebApplicationFactory<Program>
    {
        private readonly string _database = $"report-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.Report.Tests",
                    ["Jwt:Audience"] = "MyPetLink.Report.Client",
                    ["Jwt:SigningKey"] = "report-http-test-signing-key-long-enough-for-hs256",
                    ["DevAuth:Enabled"] = "false",
                    ["RateLimiting:Social:Report:PermitLimit"] = reportPermitLimit.ToString(),
                    ["RateLimiting:Social:Report:WindowSeconds"] = "3600",
                    ["RateLimiting:Social:Report:QueueLimit"] = "0"
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
    }

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "ReportHttpTest";
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
