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
using MyPetLink.Api.Auth;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Admin Community moderation through the real HTTP pipeline and the real
/// capability policies, resolved from seeded built-in roles: who may read and
/// who may do what, that nothing the client sends decides state, that the
/// reported household never learns about a report, and that no action reaches
/// beyond Community — Owner Portal, Share and Safety Profiles, Lost Mode, the
/// Smart Tag entry points and orders all keep working. Test-only
/// authentication on an in-memory host; DevAuth stays off.
/// </summary>
public sealed class AdminCommunityModerationHttpTests
{
    private static readonly Guid Alice = Guid.Parse("ba111111-1111-1111-1111-111111111111");   // @TanFamily, reported
    private static readonly Guid Bob = Guid.Parse("ba222222-2222-2222-2222-222222222222");     // @LimFamily, commenter
    private static readonly Guid Carol = Guid.Parse("ba333333-3333-3333-3333-333333333333");   // @CarolPets, reporter
    private static readonly Guid Mochi = Guid.Parse("ba411111-1111-1111-1111-111111111111");
    private const string TagCode = "MPL-ADMN-TAG1";
    private const string SecretDetails = "SECRET-DETAILS-7731";
    private const string SecretNote = "INTERNAL-NOTE-5519";

    private static readonly Dictionary<string, Guid> Operators = new()
    {
        [AdminRoleTemplates.SuperAdminCode] = Guid.Parse("bb000001-0000-0000-0000-000000000001"),
        [AdminRoleTemplates.AdministratorCode] = Guid.Parse("bb000001-0000-0000-0000-000000000002"),
        [AdminRoleTemplates.OwnerSupportCode] = Guid.Parse("bb000001-0000-0000-0000-000000000003"),
        [AdminRoleTemplates.AuditorCode] = Guid.Parse("bb000001-0000-0000-0000-000000000004"),
        [AdminRoleTemplates.OperationsCode] = Guid.Parse("bb000001-0000-0000-0000-000000000005"),
        [AdminRoleTemplates.SalesCode] = Guid.Parse("bb000001-0000-0000-0000-000000000006"),
        [AdminRoleTemplates.MarketingCode] = Guid.Parse("bb000001-0000-0000-0000-000000000007"),
        [AdminRoleTemplates.FinanceCode] = Guid.Parse("bb000001-0000-0000-0000-000000000008"),
        [AdminRoleTemplates.SupportCode] = Guid.Parse("bb000001-0000-0000-0000-000000000009"),
    };

    private static readonly string[] Viewers =
    [
        AdminRoleTemplates.SuperAdminCode, AdminRoleTemplates.AdministratorCode, AdminRoleTemplates.OwnerSupportCode
    ];

    private static readonly string[] Enforcers =
    [
        AdminRoleTemplates.SuperAdminCode, AdminRoleTemplates.AdministratorCode
    ];

    [Fact]
    public async Task EveryEndpointIsGuardedByItsCapabilityForEveryBuiltInRole()
    {
        await using var world = await World.CreateAsync();
        var reportId = await world.SingleReportIdAsync(CommunityReportTargetType.Moment);

        var endpoints = new (string Name, HttpMethod Method, string Path, string[] Allowed)[]
        {
            ("queue", HttpMethod.Get, "/api/v1/admin/community-reports", Viewers),
            ("detail", HttpMethod.Get, $"/api/v1/admin/community-reports/{reportId}", Viewers),
            ("dismiss", HttpMethod.Post, $"/api/v1/admin/community-reports/{reportId}/dismiss", Viewers),
            ("remove-comment", HttpMethod.Post, $"/api/v1/admin/community-reports/{reportId}/remove-comment", Viewers),
            ("hide-moment", HttpMethod.Post, $"/api/v1/admin/community-reports/{reportId}/hide-moment", Enforcers),
            ("unhide-moment", HttpMethod.Post, $"/api/v1/admin/community-reports/{reportId}/unhide-moment", Enforcers),
            ("restrict-household", HttpMethod.Post, $"/api/v1/admin/community-reports/{reportId}/restrict-household", Enforcers),
            ("lift-restriction", HttpMethod.Post, $"/api/v1/admin/community-reports/{reportId}/lift-restriction", Enforcers),
        };

        var failures = new List<string>();
        foreach (var (name, method, path, allowed) in endpoints)
        {
            foreach (var (role, userId) in Operators)
            {
                // A POST without a note: an authorized caller reaches the
                // service and is told the note is missing; anyone else is
                // refused before that, so nothing changes either way.
                using var client = world.As(userId);
                using var response = await client.SendAsync(new HttpRequestMessage(method, path)
                {
                    Content = method == HttpMethod.Post ? JsonContent.Create(new { }) : null
                });

                var expected = allowed.Contains(role)
                    ? (method == HttpMethod.Get ? HttpStatusCode.OK : HttpStatusCode.UnprocessableEntity)
                    : HttpStatusCode.Forbidden;
                if (response.StatusCode != expected)
                {
                    failures.Add($"{role} {name}: {(int)response.StatusCode}, expected {(int)expected}");
                }
            }

            using var owner = world.As(Bob);
            using var ownerResponse = await owner.SendAsync(new HttpRequestMessage(method, path)
            {
                Content = method == HttpMethod.Post ? JsonContent.Create(new { }) : null
            });
            if (ownerResponse.StatusCode != HttpStatusCode.Forbidden)
            {
                failures.Add($"owner {name}: {(int)ownerResponse.StatusCode}");
            }

            using var anonymous = world.As(null);
            using var anonymousResponse = await anonymous.SendAsync(new HttpRequestMessage(method, path)
            {
                Content = method == HttpMethod.Post ? JsonContent.Create(new { }) : null
            });
            if (anonymousResponse.StatusCode != HttpStatusCode.Unauthorized)
            {
                failures.Add($"anonymous {name}: {(int)anonymousResponse.StatusCode}");
            }
        }

        Assert.True(failures.Count == 0, string.Join("\n", failures));
        await using var db = world.Db();
        Assert.All(await db.CommunityReports.ToListAsync(), report => Assert.Equal(CommunityReportStatus.Open, report.Status));
        Assert.Empty(await db.AuditLogs.Where(item => item.Action.StartsWith("Community")).ToListAsync());
    }

    [Fact]
    public async Task OwnerSupportDecidesReportsButCannotEnforce()
    {
        await using var world = await World.CreateAsync();
        using var support = world.As(Operators[AdminRoleTemplates.OwnerSupportCode]);
        var comment = await world.SingleReportIdAsync(CommunityReportTargetType.Comment);
        var moment = await world.SingleReportIdAsync(CommunityReportTargetType.Moment);
        var household = await world.SingleReportIdAsync(CommunityReportTargetType.Household);

        Assert.Equal(HttpStatusCode.Forbidden, (await Act(support, moment, "hide-moment", await RowVersion(support, moment))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Act(support, household, "restrict-household", await RowVersion(support, household))).StatusCode);

        var removed = await Act(support, comment, "remove-comment", await RowVersion(support, comment));
        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        var dismissed = await Act(support, moment, "dismiss", await RowVersion(support, moment));
        Assert.Equal(HttpStatusCode.OK, dismissed.StatusCode);

        await using var db = world.Db();
        Assert.Null((await db.PetMemories.SingleAsync()).ModeratedAt);
        Assert.Null((await db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice)).CommunityRestrictedAt);
        Assert.Equal("", (await db.MomentComments.SingleAsync()).Body);
    }

    [Fact]
    public async Task TheServerDecidesStateWhateverTheRequestSays()
    {
        await using var world = await World.CreateAsync();
        var supportId = Operators[AdminRoleTemplates.OwnerSupportCode];
        using var support = world.As(supportId);
        var comment = await world.SingleReportIdAsync(CommunityReportTargetType.Comment);

        using var response = await support.PostAsJsonAsync(
            $"/api/v1/admin/community-reports/{comment}/remove-comment",
            new
            {
                note = SecretNote,
                rowVersion = await RowVersion(support, comment),
                status = "Open",
                resolution = "Dismissed",
                reviewedByUserId = Carol,
                reviewedAt = "2020-01-01T00:00:00Z",
                moderatedByUserId = Carol,
                communityRestrictedByUserId = Carol,
                reporterUserId = Bob,
                reportedUserId = Carol,
                targetType = "Household"
            });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        await using var db = world.Db();
        var report = await db.CommunityReports.SingleAsync(item => item.Id == comment);
        Assert.Equal(CommunityReportStatus.Resolved, report.Status);
        Assert.Equal(CommunityReportResolution.CommentRemoved, report.Resolution);
        Assert.Equal(supportId, report.ReviewedByUserId);
        Assert.True(report.ReviewedAt > DateTimeOffset.UtcNow.AddMinutes(-5));
        Assert.Equal((Carol, Bob, CommunityReportTargetType.Comment), (report.ReporterUserId, report.ReportedUserId, report.TargetType));
        Assert.Equal(supportId, (await db.MomentComments.SingleAsync()).DeletedByUserId);
        Assert.Equal(supportId, (await db.AuditLogs.SingleAsync(item => item.Action == "CommunityCommentRemoved")).ActorId);
    }

    [Fact]
    public async Task EnforcementChangesCommunityOnlyAndIsFullyReversible()
    {
        await using var world = await World.CreateAsync();
        using var admin = world.As(Operators[AdminRoleTemplates.AdministratorCode]);
        using var alice = world.As(Alice);
        using var anonymous = world.As(null);
        var before = await CommunityIndependentPayloadsAsync(anonymous);
        var momentReport = await world.SingleReportIdAsync(CommunityReportTargetType.Moment);
        var householdReport = await world.SingleReportIdAsync(CommunityReportTargetType.Household);

        Assert.Equal(HttpStatusCode.OK, (await Act(admin, momentReport, "hide-moment", await RowVersion(admin, momentReport))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(admin, householdReport, "restrict-household", await RowVersion(admin, householdReport))).StatusCode);

        // Community: gone.
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync($"/api/v1/public/moments/{world.MomentId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anonymous.GetAsync("/api/v1/public/owners/tanfamily")).StatusCode);

        // Everything else: Owner Portal, the hidden Moment marked for its
        // owner, orders, Share Profile, Safety Profile and Smart Tags.
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync("/api/v1/pets")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync("/api/v1/orders")).StatusCode);
        var owned = (await Data(await alice.GetAsync($"/api/v1/pets/{Mochi}/memories"))).EnumerateArray()
            .Single(memory => memory.GetProperty("id").GetGuid() == world.MomentId);
        Assert.Equal(JsonValueKind.String, owned.GetProperty("hiddenByMyPetLinkAt").ValueKind);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/v1/public/pets/mochi-pubmochi")).StatusCode);
        var after = await CommunityIndependentPayloadsAsync(anonymous);
        Assert.Equal(before, after);

        await using (var db = world.Db())
        {
            var user = await db.Users.SingleAsync(item => item.Id == Alice);
            Assert.Equal(UserStatus.Active, user.Status);
        }

        // Lost Mode still works while Community is paused, and the finder
        // still reaches the Safety Profile.
        var lost = await alice.PostAsJsonAsync($"/api/v1/pets/{Mochi}/lost-mode",
            new UpdateLostModeRequest(true, "Near the park", null, null, null, null));
        Assert.Equal(HttpStatusCode.OK, lost.StatusCode);
        Assert.Contains("\"Mochi\"", (await Data(await anonymous.GetAsync("/api/v1/public/safety/s-pubmochi"))).GetRawText());
        await alice.PostAsJsonAsync($"/api/v1/pets/{Mochi}/lost-mode",
            new UpdateLostModeRequest(false, null, null, null, null, null));

        Assert.Equal(HttpStatusCode.OK, (await Act(admin, momentReport, "unhide-moment", null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(admin, householdReport, "lift-restriction", null)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync($"/api/v1/public/moments/{world.MomentId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync("/api/v1/public/owners/tanfamily")).StatusCode);
        Assert.Equal(before, await CommunityIndependentPayloadsAsync(anonymous));
    }

    [Fact]
    public async Task TheReportedHouseholdNeverLearnsWhoReportedThemWhyOrWhatWasDecided()
    {
        await using var world = await World.CreateAsync();
        using var admin = world.As(Operators[AdminRoleTemplates.AdministratorCode]);
        var comment = await world.SingleReportIdAsync(CommunityReportTargetType.Comment);
        var household = await world.SingleReportIdAsync(CommunityReportTargetType.Household);

        // An Admin can read the reporter and their words.
        var detail = await Data(await admin.GetAsync($"/api/v1/admin/community-reports/{household}"));
        Assert.Equal("CarolPets", detail.GetProperty("reporter").GetProperty("handle").GetString());
        Assert.Equal(SecretDetails, detail.GetProperty("details").GetString());

        await Act(admin, comment, "dismiss", await RowVersion(admin, comment));
        await Act(admin, household, "restrict-household", await RowVersion(admin, household));
        await Act(admin, household, "lift-restriction", null);

        // Everything the reported households can read about themselves.
        foreach (var (userId, paths) in new (Guid, string[])[]
                 {
                     (Alice, [
                         "/api/v1/social/me/profile",
                         "/api/v1/social/notifications",
                         "/api/v1/social/notifications/unread",
                         $"/api/v1/pets/{Mochi}/memories",
                         $"/api/v1/public/moments/{world.MomentId}",
                         "/api/v1/public/owners/tanfamily",
                     ]),
                     (Bob, [
                         "/api/v1/social/me/profile",
                         "/api/v1/social/notifications",
                         $"/api/v1/public/moments/{world.MomentId}",
                         $"/api/v1/public/moments/{world.MomentId}/comments",
                     ])
                 })
        {
            using var client = world.As(userId);
            foreach (var path in paths)
            {
                using var response = await client.GetAsync(path);
                var body = await response.Content.ReadAsStringAsync();
                Assert.True(response.IsSuccessStatusCode, $"{path}: {(int)response.StatusCode} {body}");
                Assert.DoesNotContain("carolpets", body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain(Carol.ToString(), body, StringComparison.OrdinalIgnoreCase);
                Assert.DoesNotContain(SecretDetails, body);
                Assert.DoesNotContain(SecretNote, body);
                Assert.DoesNotContain("Impersonation", body);
                Assert.DoesNotContain("HarassmentOrBullying", body);
                Assert.DoesNotContain("report", body, StringComparison.OrdinalIgnoreCase);
            }
        }
    }

    [Fact]
    public void AdminModerationTypesAreOnlyReachableFromTheAdminController()
    {
        var adminTypes = typeof(AdminCommunityReportDetailResponse).Assembly.GetTypes()
            .Where(type => type.Namespace == "MyPetLink.Api.DTOs" && type.Name.StartsWith("AdminCommunity", StringComparison.Ordinal))
            .ToHashSet();
        Assert.NotEmpty(adminTypes);

        var consumers = typeof(AdminCommunityReportDetailResponse).Assembly.GetTypes()
            .Where(type => type.Namespace?.StartsWith("MyPetLink.Api.Controllers", StringComparison.Ordinal) == true)
            .Where(type => type.GetConstructors().Any(constructor => constructor.GetParameters().Any(parameter =>
                parameter.ParameterType == typeof(IAdminCommunityReportQueryService)
                || parameter.ParameterType == typeof(IAdminCommunityModerationService))))
            .ToArray();
        Assert.Equal([typeof(Controllers.Admin.AdminCommunityReportsController)], consumers);

        // No public or owner service contract hands one of these back.
        var leaks = typeof(AdminCommunityReportDetailResponse).Assembly.GetTypes()
            .Where(type => type.IsInterface
                && type.Namespace == "MyPetLink.Api.Services"
                && type != typeof(IAdminCommunityReportQueryService)
                && type != typeof(IAdminCommunityModerationService))
            .SelectMany(type => type.GetMethods())
            .Where(method => Mentions(method.ReturnType, adminTypes)
                || method.GetParameters().Any(parameter => Mentions(parameter.ParameterType, adminTypes)))
            .Select(method => $"{method.DeclaringType!.Name}.{method.Name}")
            .ToArray();
        Assert.Empty(leaks);

        static bool Mentions(Type type, HashSet<Type> targets) =>
            targets.Contains(type) || (type.IsGenericType && type.GetGenericArguments().Any(argument => Mentions(argument, targets)));
    }

    // ---- E5: security and stale state --------------------------------------

    [Fact]
    public async Task NoMutationLetsTheRequestChooseStateIdentitiesOrTargets()
    {
        await using var world = await World.CreateAsync();
        var adminId = Operators[AdminRoleTemplates.AdministratorCode];
        using var admin = world.As(adminId);
        var comment = await world.SingleReportIdAsync(CommunityReportTargetType.Comment);
        var moment = await world.SingleReportIdAsync(CommunityReportTargetType.Moment);
        var household = await world.SingleReportIdAsync(CommunityReportTargetType.Household);

        async Task<HttpStatusCode> Post(Guid reportId, string action, string? rowVersion)
        {
            using var response = await admin.PostAsJsonAsync($"/api/v1/admin/community-reports/{reportId}/{action}", new
            {
                note = SecretNote,
                rowVersion,
                id = Guid.NewGuid(),
                status = "Open",
                resolution = "Dismissed",
                reviewedByUserId = Carol,
                reviewedAt = "2020-01-01T00:00:00Z",
                reviewNote = "forged",
                moderatedByUserId = Carol,
                moderatedAt = "2020-01-01T00:00:00Z",
                communityRestrictedByUserId = Carol,
                communityEnabledBeforeRestriction = false,
                reporterUserId = Bob,
                reportedUserId = Carol,
                targetType = "Household",
                commentId = Guid.NewGuid(),
                momentId = Guid.NewGuid(),
                ownerId = Carol
            });
            return response.StatusCode;
        }

        Assert.Equal(HttpStatusCode.OK, await Post(comment, "dismiss", await RowVersion(admin, comment)));
        Assert.Equal(HttpStatusCode.OK, await Post(moment, "hide-moment", await RowVersion(admin, moment)));
        Assert.Equal(HttpStatusCode.OK, await Post(moment, "unhide-moment", null));
        Assert.Equal(HttpStatusCode.OK, await Post(household, "restrict-household", await RowVersion(admin, household)));
        Assert.Equal(HttpStatusCode.OK, await Post(household, "lift-restriction", null));

        await using var db = world.Db();
        foreach (var report in await db.CommunityReports.ToListAsync())
        {
            Assert.Equal(CommunityReportStatus.Resolved, report.Status);
            Assert.Equal(adminId, report.ReviewedByUserId);
            Assert.Equal(SecretNote, report.ReviewNote);
            Assert.Equal(Carol, report.ReporterUserId);
            Assert.NotEqual(Carol, report.ReportedUserId);
        }

        Assert.Equal(CommunityReportResolution.Dismissed, (await db.CommunityReports.SingleAsync(item => item.Id == comment)).Resolution);
        Assert.Equal(CommunityReportResolution.MomentHidden, (await db.CommunityReports.SingleAsync(item => item.Id == moment)).Resolution);
        Assert.Equal(CommunityReportResolution.HouseholdRestricted, (await db.CommunityReports.SingleAsync(item => item.Id == household)).Resolution);
        Assert.Equal("Rude words", (await db.MomentComments.SingleAsync()).Body);
        var alice = await db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        Assert.True(alice.IsSocialEnabled);
        Assert.Null(alice.CommunityRestrictedAt);
        Assert.Null((await db.PetMemories.SingleAsync()).ModeratedAt);
        Assert.All(await db.AuditLogs.Where(item => item.Action.StartsWith("Community")).ToListAsync(),
            item => Assert.Equal(adminId, item.ActorId));
    }

    [Fact]
    public async Task ASecondModeratorWithAStalePageGetsAConflictAndNothingHappensTwice()
    {
        await using var world = await World.CreateAsync();
        using var first = world.As(Operators[AdminRoleTemplates.AdministratorCode]);
        using var second = world.As(Operators[AdminRoleTemplates.OwnerSupportCode]);
        var comment = await world.SingleReportIdAsync(CommunityReportTargetType.Comment);

        // Both open the same report.
        var firstVersion = await RowVersion(first, comment);
        var secondVersion = await RowVersion(second, comment);
        Assert.Equal(firstVersion, secondVersion);

        Assert.Equal(HttpStatusCode.OK, (await Act(first, comment, "dismiss", firstVersion)).StatusCode);
        using var stale = await Act(second, comment, "remove-comment", secondVersion);

        Assert.Equal(HttpStatusCode.Conflict, stale.StatusCode);
        Assert.Contains("community_report_already_resolved", await stale.Content.ReadAsStringAsync());
        await using var db = world.Db();
        Assert.Equal("Rude words", (await db.MomentComments.SingleAsync()).Body);
        Assert.Equal(CommunityReportResolution.Dismissed, (await db.CommunityReports.SingleAsync(item => item.Id == comment)).Resolution);
        Assert.Single(await db.AuditLogs.Where(item => item.Action.StartsWith("Community")).ToListAsync());

        // The refreshed detail shows the decision and offers no more decisions.
        var refreshed = await Data(await second.GetAsync($"/api/v1/admin/community-reports/{comment}"));
        Assert.Equal("Resolved", refreshed.GetProperty("status").GetString());
        Assert.DoesNotContain(refreshed.GetProperty("availableActions").EnumerateArray(), item => item.GetString() is "Dismiss" or "RemoveComment");
    }

    [Fact]
    public async Task AnOperatorsOwnHouseholdIsNeverShownItsReportsOrAllowedToDecideItsOwn()
    {
        await using var world = await World.CreateAsync();
        await world.GrantAsync(Alice, AdminRoleTemplates.AdministratorCode);   // reported (Moment, household)
        await world.GrantAsync(Carol, AdminRoleTemplates.OwnerSupportCode);    // the reporter
        using var alice = world.As(Alice);
        using var carol = world.As(Carol);
        var moment = await world.SingleReportIdAsync(CommunityReportTargetType.Moment);
        var household = await world.SingleReportIdAsync(CommunityReportTargetType.Household);
        var comment = await world.SingleReportIdAsync(CommunityReportTargetType.Comment);

        // Alice sees only the report about Bob, and her own read exactly like
        // a report that does not exist.
        var queue = (await Data(await alice.GetAsync("/api/v1/admin/community-reports?pageSize=100"))).EnumerateArray().ToArray();
        Assert.Equal([comment], queue.Select(item => item.GetProperty("id").GetGuid()));
        using var missing = await alice.GetAsync($"/api/v1/admin/community-reports/{Guid.NewGuid()}");
        var missingBody = await missing.Content.ReadAsStringAsync();
        foreach (var own in new[] { moment, household })
        {
            using var hidden = await alice.GetAsync($"/api/v1/admin/community-reports/{own}");
            Assert.Equal(missing.StatusCode, hidden.StatusCode);
            var body = await hidden.Content.ReadAsStringAsync();
            Assert.DoesNotContain("carolpets", body, StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(SecretDetails, body);
            Assert.Equal(ErrorCode(missingBody), ErrorCode(body));
            using var acted = await Act(alice, own, "restrict-household", "");
            Assert.Equal(HttpStatusCode.Forbidden, acted.StatusCode);
            Assert.Contains("moderation_conflict_of_interest", await acted.Content.ReadAsStringAsync());
        }

        // Carol sees her own report, is told it involves her, and cannot decide it.
        var own2 = await Data(await carol.GetAsync($"/api/v1/admin/community-reports/{comment}"));
        Assert.True(own2.GetProperty("involvesYou").GetBoolean());
        Assert.Empty(own2.GetProperty("availableActions").EnumerateArray());
        using var refused = await Act(carol, comment, "dismiss", own2.GetProperty("rowVersion").GetString());
        Assert.Equal(HttpStatusCode.Forbidden, refused.StatusCode);
        Assert.Contains("moderation_conflict_of_interest", await refused.Content.ReadAsStringAsync());

        await using var db = world.Db();
        Assert.All(await db.CommunityReports.ToListAsync(), item => Assert.Equal(CommunityReportStatus.Open, item.Status));
        Assert.Empty(await db.AuditLogs.Where(item => item.Action.StartsWith("Community")).ToListAsync());

        static string? ErrorCode(string body) =>
            JsonDocument.Parse(body).RootElement.GetProperty("error").GetProperty("code").GetString();
    }

    [Fact]
    public async Task GuessingReportIdsRevealsNothing()
    {
        await using var world = await World.CreateAsync();
        var real = await world.SingleReportIdAsync(CommunityReportTargetType.Household);
        var guessed = Guid.NewGuid();
        using var auditor = world.As(Operators[AdminRoleTemplates.AuditorCode]);
        using var owner = world.As(Bob);
        using var admin = world.As(Operators[AdminRoleTemplates.AdministratorCode]);

        // Without the capability, a real id and a guessed one answer the same,
        // before anything is looked up.
        foreach (var client in new[] { auditor, owner })
        {
            foreach (var path in new[] { "", "/dismiss", "/hide-moment", "/restrict-household" })
            {
                using var forReal = path == ""
                    ? await client.GetAsync($"/api/v1/admin/community-reports/{real}")
                    : await Act(client, real, path.TrimStart('/'), "");
                using var forGuess = path == ""
                    ? await client.GetAsync($"/api/v1/admin/community-reports/{guessed}")
                    : await Act(client, guessed, path.TrimStart('/'), "");
                Assert.Equal(HttpStatusCode.Forbidden, forReal.StatusCode);
                Assert.Equal(forGuess.StatusCode, forReal.StatusCode);
            }
        }

        // With it: an unknown id is 404 for reads and every action; a decided
        // report is 409 for every further decision.
        using var unknownDetail = await admin.GetAsync($"/api/v1/admin/community-reports/{guessed}");
        Assert.Equal(HttpStatusCode.NotFound, unknownDetail.StatusCode);
        foreach (var action in new[] { "dismiss", "remove-comment", "hide-moment", "unhide-moment", "restrict-household", "lift-restriction" })
        {
            using var unknown = await Act(admin, guessed, action, "");
            Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, (await Act(admin, real, "dismiss", await RowVersion(admin, real))).StatusCode);
        foreach (var action in new[] { "dismiss", "restrict-household" })
        {
            using var decided = await Act(admin, real, action, await RowVersion(admin, real));
            Assert.Equal(HttpStatusCode.Conflict, decided.StatusCode);
        }
    }

    [Fact]
    public async Task AnonymousVisitorsCannotReportOrModerateButStillBrowse()
    {
        await using var world = await World.CreateAsync();
        using var anonymous = world.As(null);

        using var report = await anonymous.PostAsJsonAsync("/api/v1/social/reports",
            new { targetType = "moment", target = world.MomentId.ToString(), reason = "SpamOrScam" });
        Assert.Equal(HttpStatusCode.Unauthorized, report.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/admin/community-reports")).StatusCode);

        var moment = await anonymous.GetAsync($"/api/v1/public/moments/{world.MomentId}");
        Assert.Equal(HttpStatusCode.OK, moment.StatusCode);
        var body = await moment.Content.ReadAsStringAsync();
        Assert.DoesNotContain("report", body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("carolpets", body, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ARestrictedHouseholdIsRefusedFollowAndLikeOverHttp()
    {
        await using var world = await World.CreateAsync();
        using var admin = world.As(Operators[AdminRoleTemplates.AdministratorCode]);
        var household = await world.SingleReportIdAsync(CommunityReportTargetType.Household);
        Assert.Equal(HttpStatusCode.OK, (await Act(admin, household, "restrict-household", await RowVersion(admin, household))).StatusCode);
        using var alice = world.As(Alice);

        using var follow = await alice.PostAsync("/api/v1/social/owners/carolpets/follow", null);
        using var like = await alice.PostAsync($"/api/v1/social/moments/{world.MomentId}/like", null);

        foreach (var response in new[] { follow, like })
        {
            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            Assert.Contains("community_restricted", await response.Content.ReadAsStringAsync());
        }
    }

    // ---- helpers ----------------------------------------------------------

    private static async Task<HttpResponseMessage> Act(HttpClient client, Guid reportId, string action, string? rowVersion) =>
        await client.PostAsJsonAsync(
            $"/api/v1/admin/community-reports/{reportId}/{action}",
            new { note = SecretNote, rowVersion });

    private static async Task<string> RowVersion(HttpClient client, Guid reportId) =>
        (await Data(await client.GetAsync($"/api/v1/admin/community-reports/{reportId}")))
            .GetProperty("rowVersion").GetString()!;

    private sealed record Payloads(string Safety, string Legacy, string Qr, string Nfc);

    private static async Task<Payloads> CommunityIndependentPayloadsAsync(HttpClient client)
    {
        var payloads = new Payloads(
            (await Data(await client.GetAsync("/api/v1/public/safety/s-pubmochi"))).GetRawText(),
            (await Data(await client.GetAsync($"/api/v1/public/tags/{TagCode}"))).GetRawText(),
            (await Data(await client.GetAsync($"/api/v1/public/tags/{TagCode}/qr"))).GetRawText(),
            (await Data(await client.GetAsync($"/api/v1/public/tags/{TagCode}/nfc"))).GetRawText());

        Assert.All(new[] { payloads.Safety, payloads.Legacy, payloads.Qr, payloads.Nfc },
            payload => Assert.Contains("\"Mochi\"", payload));
        return payloads;
    }

    private static async Task<JsonElement> Data(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {body}");
        using var json = JsonDocument.Parse(body);
        return json.RootElement.GetProperty("data").Clone();
    }

    private sealed class World : IAsyncDisposable
    {
        private readonly AdminFactory _factory;

        private World(AdminFactory factory, Guid momentId)
        {
            _factory = factory;
            MomentId = momentId;
        }

        public Guid MomentId { get; }

        public static async Task<World> CreateAsync()
        {
            var factory = new AdminFactory();
            _ = factory.Server; // start the host, which seeds the built-in roles

            Guid momentId;
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<MyPetLinkDbContext>();
                SocialSurfaceHarness.AddOwner(db, Alice, "alice@example.com", "Alice Tan", "TanFamily", "The Tan Family", true, true);
                SocialSurfaceHarness.AddOwner(db, Bob, "bob@example.com", "Bob Lim", "LimFamily", "The Lim Family", true, true);
                SocialSurfaceHarness.AddOwner(db, Carol, "carol@example.com", "Carol Ng", "CarolPets", "Carol's Pets", true, true);
                await db.SaveChangesAsync();

                SocialSurfaceHarness.AddPet(db, Mochi, Alice, "Mochi", "Cat", true, true);
                db.SmartTags.Add(new SmartTag
                {
                    TagCode = TagCode,
                    OwnerUserId = Alice,
                    PetId = Mochi,
                    HasNfc = true,
                    Status = SmartTagStatus.Active,
                    ActivatedAt = DateTimeOffset.UtcNow.AddDays(-3)
                });

                var moment = new PetMemory
                {
                    PetId = Mochi,
                    AuthorUserId = Alice,
                    Title = "Beach day",
                    Type = "Memory",
                    Visibility = MemoryVisibility.Public,
                    ShowOnPublicProfile = true,
                    ShowInLifeTimeline = true,
                    PublishedAt = DateTimeOffset.UtcNow.AddHours(-1)
                };
                db.PetMemories.Add(moment);
                db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Mochi });

                foreach (var (code, userId) in Operators)
                {
                    var user = new User
                    {
                        Id = userId,
                        Email = $"{code}@mypetlink.test",
                        NormalizedEmail = $"{code}@mypetlink.test".ToUpperInvariant(),
                        DisplayName = code,
                        Status = UserStatus.Active
                    };
                    var admin = new AdminUser { UserId = userId, User = user, Role = AdminRole.OwnerSupport, IsActive = true };
                    db.Add(user);
                    db.Add(admin);
                    db.AdminUserRoles.Add(new AdminUserRoleAssignment
                    {
                        AdminUserId = admin.Id,
                        AdminRoleId = (await db.AdminRoles.SingleAsync(role => role.Code == code)).Id
                    });
                }

                await db.SaveChangesAsync();
                momentId = moment.Id;
            }

            var world = new World(factory, momentId);

            // Bob comments; Carol reports the Comment, the Moment and Alice's
            // household — through the real report endpoint.
            using var bob = world.As(Bob);
            var comment = await Data(await bob.PostAsJsonAsync(
                $"/api/v1/social/moments/{momentId}/comments", new { body = "Rude words" }));
            var commentId = comment.GetProperty("comment").GetProperty("id").GetString();

            using var carol = world.As(Carol);
            foreach (var (type, target, reason) in new[]
                     {
                         ("comment", commentId, "HarassmentOrBullying"),
                         ("moment", momentId.ToString(), "SpamOrScam"),
                         ("household", "tanfamily", "Impersonation")
                     })
            {
                var submitted = await carol.PostAsJsonAsync("/api/v1/social/reports",
                    new { targetType = type, target, reason, details = SecretDetails });
                Assert.Equal(HttpStatusCode.OK, submitted.StatusCode);
            }

            return world;
        }

        public MyPetLinkDbContext Db() =>
            _factory.Services.CreateScope().ServiceProvider.GetRequiredService<MyPetLinkDbContext>();

        /// <summary>Makes an existing household an operator with one built-in role.</summary>
        public async Task GrantAsync(Guid userId, string roleCode)
        {
            await using var db = Db();
            var admin = new AdminUser { UserId = userId, Role = AdminRole.OwnerSupport, IsActive = true };
            db.Add(admin);
            db.AdminUserRoles.Add(new AdminUserRoleAssignment
            {
                AdminUserId = admin.Id,
                AdminRoleId = (await db.AdminRoles.SingleAsync(role => role.Code == roleCode)).Id
            });
            await db.SaveChangesAsync();
        }

        public async Task<Guid> SingleReportIdAsync(CommunityReportTargetType type)
        {
            await using var db = Db();
            return await db.CommunityReports.Where(item => item.TargetType == type).Select(item => item.Id).SingleAsync();
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

    private sealed class AdminFactory : WebApplicationFactory<Program>
    {
        private readonly string _database = $"admin-moderation-http-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Jwt:Issuer"] = "MyPetLink.AdminModeration.Tests",
                    ["Jwt:Audience"] = "MyPetLink.AdminModeration.Client",
                    ["Jwt:SigningKey"] = "admin-moderation-http-test-signing-key-long-enough",
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
    }

    private sealed class TestAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "AdminModerationHttpTest";
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

            // No role claim at all: Admin access must come from the database.
            var identity = new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
                SchemeName);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
