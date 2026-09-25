using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Admin moderation on SQL Server, where it actually runs concurrently. Two
/// moderators, a moderator and the content's owner, or a moderator and a new
/// report can race on the same target; every outcome must be one of the valid
/// serial outcomes — never a half-applied decision, a report resolved against
/// a change that did not commit, an overwritten owner choice, or an audit row
/// without its change. One side is held inside SaveChanges until the other has
/// finished (or two seconds pass, which is what happens when they serialize on
/// the target's lock).
/// </summary>
public sealed class AdminCommunityModerationRelationalTests
{
    private static readonly Guid Author = Guid.Parse("e9111111-1111-1111-1111-111111111111");
    private static readonly Guid Commenter = Guid.Parse("e9211111-1111-1111-1111-111111111111");
    private static readonly Guid Reporter = Guid.Parse("e9311111-1111-1111-1111-111111111111");
    private static readonly Guid SecondReporter = Guid.Parse("e9321111-1111-1111-1111-111111111111");
    private static readonly Guid Moderator = Guid.Parse("e9411111-1111-1111-1111-111111111111");
    private static readonly Guid SecondModerator = Guid.Parse("e9421111-1111-1111-1111-111111111111");
    private static readonly Guid Pet = Guid.Parse("e9511111-1111-1111-1111-111111111111");
    private const string Body = "Rude words @ReporterHome";
    private const string Note = "Decided against the guidelines.";

    // ---- two moderators ------------------------------------------------------

    [RelationalTheory]
    [InlineData("first")]
    [InlineData("second")]
    public async Task TwoModeratorsDismissingTheSameReportDecideItOnce(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var report = world.CommentReports[0];

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("first", context => Capture(outcomes, "first", Moderation(context).DismissAsync(Moderator, report.Id, Request(report)))),
            ("second", context => Capture(outcomes, "second", Moderation(context).DismissAsync(SecondModerator, report.Id, Request(report)))),
            scope);

        Assert.Equal(["Applied", "community_report_already_resolved"], outcomes.Values.Order());
        await using var verify = scope.NewContext();
        var winner = outcomes["first"] == "Applied" ? Moderator : SecondModerator;
        Assert.All(await verify.CommunityReports.Where(item => item.CommentId != null).ToListAsync(), item =>
        {
            Assert.Equal(CommunityReportResolution.Dismissed, item.Resolution);
            Assert.Equal(winner, item.ReviewedByUserId);
        });
        Assert.Equal(winner, (await verify.AuditLogs.SingleAsync()).ActorId);
    }

    [RelationalTheory]
    [InlineData("dismiss")]
    [InlineData("remove")]
    public async Task DismissAndRemoveOnTheSameCommentNeverBothDecide(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("dismiss", context => Capture(outcomes, "dismiss", Moderation(context).DismissAsync(Moderator, world.CommentReports[0].Id, Request(world.CommentReports[0])))),
            ("remove", context => Capture(outcomes, "remove", Moderation(context).RemoveCommentAsync(SecondModerator, world.CommentReports[1].Id, Request(world.CommentReports[1])))),
            scope);

        Assert.Equal(["Applied", "community_report_already_resolved"], outcomes.Values.Order());
        await using var verify = scope.NewContext();
        var comment = await verify.MomentComments.SingleAsync();
        var reports = await verify.CommunityReports.Where(item => item.CommentId != null).ToListAsync();
        var audit = await verify.AuditLogs.SingleAsync();
        if (outcomes["remove"] == "Applied")
        {
            Assert.Equal("", comment.Body);
            Assert.All(reports, item => Assert.Equal(CommunityReportResolution.CommentRemoved, item.Resolution));
            Assert.Equal(CommunityModerationAudit.CommentRemoved, audit.Action);
        }
        else
        {
            Assert.Equal(Body, comment.Body);
            Assert.Null(comment.DeletedAt);
            Assert.All(reports, item => Assert.Equal(CommunityReportResolution.Dismissed, item.Resolution));
            Assert.Equal(CommunityModerationAudit.ReportDismissed, audit.Action);
        }
    }

    [RelationalTheory]
    [InlineData("first")]
    [InlineData("second")]
    public async Task TwoModeratorsHidingTheSameMomentHideItOnce(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var second = await SubmitAsync(scope, SecondReporter, "moment", world.MomentId);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("first", context => Capture(outcomes, "first", Moderation(context).HideMomentAsync(Moderator, world.MomentReport.Id, Request(world.MomentReport)))),
            ("second", context => Capture(outcomes, "second", Moderation(context).HideMomentAsync(SecondModerator, second.Id, Request(second)))),
            scope);

        Assert.Equal(["Applied", "community_report_already_resolved"], outcomes.Values.Order());
        await using var verify = scope.NewContext();
        var winner = outcomes["first"] == "Applied" ? Moderator : SecondModerator;
        var moment = await verify.PetMemories.SingleAsync();
        Assert.Equal(winner, moment.ModeratedByUserId);
        Assert.All(await verify.CommunityReports.Where(item => item.MomentId != null).ToListAsync(), item =>
            Assert.Equal((CommunityReportResolution.MomentHidden, winner), (item.Resolution!.Value, item.ReviewedByUserId!.Value)));
        Assert.Equal(CommunityModerationAudit.MomentHidden, (await verify.AuditLogs.SingleAsync()).Action);
    }

    [RelationalTheory]
    [InlineData("hide")]
    [InlineData("unhide")]
    public async Task HideAndUnhideRacingLeaveOneWholeState(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        await using (var context = scope.NewContext())
        {
            await Moderation(context).HideMomentAsync(Moderator, world.MomentReport.Id, Request(world.MomentReport));
        }

        // A report that arrived around the first decision.
        var late = await InsertOpenMomentReportAsync(scope, world.MomentId);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("hide", context => Capture(outcomes, "hide", Moderation(context).HideMomentAsync(SecondModerator, late.Id, Request(late)))),
            ("unhide", context => Capture(outcomes, "unhide", Moderation(context).UnhideMomentAsync(Moderator, world.MomentReport.Id, Request(world.MomentReport)))),
            scope);

        await using var verify = scope.NewContext();
        var moment = await verify.PetMemories.SingleAsync();
        Assert.Equal(moment.ModeratedAt is null, moment.ModeratedByUserId is null);
        Assert.Equal("Applied", outcomes["unhide"]);
        if (moment.ModeratedAt is null)
        {
            Assert.Equal("AlreadyInEffect", outcomes["hide"]);
        }
        else
        {
            Assert.Equal(("Applied", SecondModerator), (outcomes["hide"], moment.ModeratedByUserId!.Value));
        }

        var reports = await verify.CommunityReports.Where(item => item.MomentId != null).ToListAsync();
        Assert.All(reports, item => Assert.Equal(CommunityReportResolution.MomentHidden, item.Resolution));
        Assert.Equal(3, await verify.AuditLogs.CountAsync());
    }

    // ---- households ------------------------------------------------------------

    [RelationalTheory]
    [InlineData("household")]
    [InlineData("moment")]
    public async Task TwoRestrictionsOfOneHouseholdKeepTheOwnersChoice(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("household", context => Capture(outcomes, "household", Moderation(context).RestrictHouseholdAsync(Moderator, world.HouseholdReport.Id, Request(world.HouseholdReport)))),
            ("moment", context => Capture(outcomes, "moment", Moderation(context).RestrictHouseholdAsync(SecondModerator, world.MomentReport.Id, Request(world.MomentReport)))),
            scope);

        Assert.Equal(["AlreadyInEffect", "Applied"], outcomes.Values.Order());
        await using var verify = scope.NewContext();
        var profile = await verify.OwnerSocialProfiles.SingleAsync(item => item.UserId == Author);
        Assert.False(profile.IsSocialEnabled);
        Assert.True(profile.CommunityEnabledBeforeRestriction);
        Assert.Equal(outcomes["household"] == "Applied" ? Moderator : SecondModerator, profile.CommunityRestrictedByUserId);
        Assert.Equal(CommunityReportResolution.HouseholdRestricted, (await verify.CommunityReports.SingleAsync(item => item.Id == world.HouseholdReport.Id)).Resolution);
        Assert.Equal(CommunityReportResolution.HouseholdRestricted, (await verify.CommunityReports.SingleAsync(item => item.Id == world.MomentReport.Id)).Resolution);
        Assert.All(await verify.CommunityReports.Where(item => item.CommentId != null).ToListAsync(), item => Assert.Equal(CommunityReportStatus.Open, item.Status));
        Assert.Equal(2, await verify.AuditLogs.CountAsync());
        Assert.Equal(UserStatus.Active, (await verify.Users.SingleAsync(item => item.Id == Author)).Status);
    }

    [RelationalTheory]
    [InlineData("restrict")]
    [InlineData("lift")]
    public async Task RestrictAndLiftRacingLeaveAConsistentHousehold(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        await using (var context = scope.NewContext())
        {
            await Moderation(context).RestrictHouseholdAsync(Moderator, world.HouseholdReport.Id, Request(world.HouseholdReport));
        }

        var late = await InsertOpenHouseholdReportAsync(scope);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("restrict", context => Capture(outcomes, "restrict", Moderation(context).RestrictHouseholdAsync(SecondModerator, late.Id, Request(late)))),
            ("lift", context => Capture(outcomes, "lift", Moderation(context).LiftRestrictionAsync(Moderator, world.HouseholdReport.Id, Request(world.HouseholdReport)))),
            scope);

        Assert.Equal("Applied", outcomes["lift"]);
        await using var verify = scope.NewContext();
        var profile = await verify.OwnerSocialProfiles.SingleAsync(item => item.UserId == Author);
        if (profile.CommunityRestrictedAt is null)
        {
            Assert.Equal("AlreadyInEffect", outcomes["restrict"]);
            Assert.True(profile.IsSocialEnabled);
            Assert.Null(profile.CommunityEnabledBeforeRestriction);
        }
        else
        {
            Assert.Equal("Applied", outcomes["restrict"]);
            Assert.False(profile.IsSocialEnabled);
            Assert.True(profile.CommunityEnabledBeforeRestriction);
        }

        Assert.Equal(CommunityReportResolution.HouseholdRestricted, (await verify.CommunityReports.SingleAsync(item => item.Id == late.Id)).Resolution);
    }

    [RelationalTheory]
    [InlineData("restrict")]
    [InlineData("owner")]
    public async Task ARestrictionRacingTheOwnersCommunitySwitchNeverLosesTheirChoice(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("restrict", context => Capture(outcomes, "restrict", Moderation(context).RestrictHouseholdAsync(Moderator, world.HouseholdReport.Id, Request(world.HouseholdReport)))),
            ("owner", async context =>
            {
                try
                {
                    await SocialProfiles(context).UpdateAsync(Author, new UpdateOwnerSocialProfileRequest(null, null, null, false, null, null, null));
                    outcomes["owner"] = "Applied";
                }
                catch (ApiException exception)
                {
                    outcomes["owner"] = exception.Code;
                }
            }),
            scope);

        await using var verify = scope.NewContext();
        var profile = await verify.OwnerSocialProfiles.SingleAsync(item => item.UserId == Author);
        var report = await verify.CommunityReports.SingleAsync(item => item.Id == world.HouseholdReport.Id);
        Assert.False(profile.IsSocialEnabled);

        if (outcomes["restrict"] == "Applied")
        {
            Assert.NotNull(profile.CommunityRestrictedAt);
            Assert.Equal(CommunityReportResolution.HouseholdRestricted, report.Resolution);

            // The owner's "off" is what a lift would restore — whether it
            // landed before the restriction or was refused as stale.
            Assert.Equal(outcomes["owner"] != "Applied", profile.CommunityEnabledBeforeRestriction);
        }
        else
        {
            Assert.Equal("concurrency_conflict", outcomes["restrict"]);
            Assert.Equal("Applied", outcomes["owner"]);
            Assert.Null(profile.CommunityRestrictedAt);
            Assert.Equal(CommunityReportStatus.Open, report.Status);
            Assert.Equal(0, await verify.AuditLogs.CountAsync(item => item.Action.StartsWith("Community")));
        }
    }

    // ---- content owners and new reports -----------------------------------------

    [RelationalTheory]
    [InlineData("author")]
    [InlineData("moderator")]
    public async Task AnAuthorDeletingWhileAModeratorRemovesDeletesOnce(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var outcomes = new Dictionary<string, string>();
        await RaceAsync(gate, held,
            ("author", context => Comments(context).DeleteAsync(Commenter, world.MomentId, world.CommentId)),
            ("moderator", context => Capture(outcomes, "moderator", Moderation(context).RemoveCommentAsync(Moderator, world.CommentReports[0].Id, Request(world.CommentReports[0])))),
            scope);

        await using var verify = scope.NewContext();
        var comment = await verify.MomentComments.SingleAsync();
        Assert.Equal("", comment.Body);
        Assert.Contains(comment.DeletedByUserId!.Value, new[] { Commenter, Moderator });
        Assert.Equal(comment.DeletedByUserId == Moderator ? "Applied" : "AlreadyInEffect", outcomes["moderator"]);
        Assert.Empty(await verify.MomentCommentMentions.ToListAsync());
        Assert.All(await verify.CommunityReports.Where(item => item.CommentId != null).ToListAsync(), item =>
        {
            Assert.Equal(CommunityReportResolution.CommentRemoved, item.Resolution);
            Assert.Equal(Body, item.SnapshotText);
        });
        var audit = await verify.AuditLogs.SingleAsync();
        Assert.Contains($"\"alreadyRemoved\":{(comment.DeletedByUserId != Moderator).ToString().ToLowerInvariant()}", audit.NewValue);
    }

    [RelationalTheory]
    [InlineData("report")]
    [InlineData("moderator")]
    public async Task AReportArrivingWhileTheCommentIsRemovedIsDecidedOrLeftDecidable(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("report", async context =>
            {
                try
                {
                    await Reports(context).SubmitAsync(SecondReporter, new CreateCommunityReportRequest("comment", world.CommentId.ToString(), "SpamOrScam", null));
                }
                catch (ApiException exception) when (exception.Code == "report_target_unavailable")
                {
                }
            }),
            ("moderator", context => Moderation(context).RemoveCommentAsync(Moderator, world.CommentReports[0].Id, Request(world.CommentReports[0]))),
            scope);

        await using (var verify = scope.NewContext())
        {
            Assert.Equal("", (await verify.MomentComments.SingleAsync()).Body);
            var arrived = await verify.CommunityReports.SingleOrDefaultAsync(item => item.ReporterUserId == SecondReporter);
            if (arrived is not null)
            {
                // Its evidence is the Comment as it was; and it is either part
                // of the decision or still open for one.
                Assert.Equal(Body, arrived.SnapshotText);
                Assert.Contains((arrived.Status, arrived.Resolution), new (CommunityReportStatus, CommunityReportResolution?)[]
                {
                    (CommunityReportStatus.Resolved, CommunityReportResolution.CommentRemoved),
                    (CommunityReportStatus.Open, null)
                });

                if (arrived.Status == CommunityReportStatus.Open)
                {
                    await using var context = scope.NewContext();
                    var result = await Moderation(context).RemoveCommentAsync(Moderator, arrived.Id, Request(arrived));
                    Assert.Equal(("AlreadyInEffect", 1), (result.Outcome, result.ReportsResolved));
                }
            }
        }

        await using var final = scope.NewContext();
        Assert.All(await final.CommunityReports.ToListAsync(), item =>
            Assert.True(item.CommentId is null || item.Resolution == CommunityReportResolution.CommentRemoved));
    }

    [RelationalTheory]
    [InlineData("owner")]
    [InlineData("moderator")]
    public async Task AnOwnerArchivingWhileAModeratorHidesKeepsBoth(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("owner", context => Memories(context).ArchiveAsync(Author, world.MomentId)),
            ("moderator", context => Moderation(context).HideMomentAsync(Moderator, world.MomentReport.Id, Request(world.MomentReport))),
            scope);

        await using var verify = scope.NewContext();
        var moment = await verify.PetMemories.SingleAsync();
        Assert.NotNull(moment.ArchivedAt);
        Assert.NotNull(moment.ModeratedAt);
        Assert.Equal(Moderator, moment.ModeratedByUserId);
        Assert.Equal(CommunityReportResolution.MomentHidden, (await verify.CommunityReports.SingleAsync(item => item.Id == world.MomentReport.Id)).Resolution);
    }

    // ---- atomicity -----------------------------------------------------------------

    [RelationalTheory]
    [InlineData("AAAAAAAAAAA=")]
    [InlineData("")]
    public async Task AStaleVersionRollsBackTheWholeDecision(string rowVersion)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        int notificationsBefore;
        await using (var context = scope.NewContext())
        {
            notificationsBefore = await context.OwnerNotifications.CountAsync();
        }

        await using (var context = scope.NewContext())
        {
            var refused = await Assert.ThrowsAsync<ApiException>(() => Moderation(context).RemoveCommentAsync(
                Moderator, world.CommentReports[0].Id, new AdminCommunityModerationRequest(Note, rowVersion)));
            Assert.Equal("concurrency_conflict", refused.Code);
        }

        await using var verify = scope.NewContext();
        var comment = await verify.MomentComments.SingleAsync();
        Assert.Equal(Body, comment.Body);
        Assert.Null(comment.DeletedAt);
        Assert.NotEmpty(await verify.MomentCommentMentions.ToListAsync());
        Assert.Equal(notificationsBefore, await verify.OwnerNotifications.CountAsync());
        Assert.All(await verify.CommunityReports.ToListAsync(), item => Assert.Equal(CommunityReportStatus.Open, item.Status));
        Assert.Empty(await verify.AuditLogs.ToListAsync());
    }

    [RelationalFact]
    public async Task EveryDecisionCommitsWithItsAuditRowAndValidKeys()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            await Moderation(context).RemoveCommentAsync(Moderator, world.CommentReports[0].Id, Request(world.CommentReports[0]));
        }

        await using (var context = scope.NewContext())
        {
            await Moderation(context).HideMomentAsync(Moderator, world.MomentReport.Id, Request(world.MomentReport));
        }

        await using (var context = scope.NewContext())
        {
            await Moderation(context).RestrictHouseholdAsync(Moderator, world.HouseholdReport.Id, Request(world.HouseholdReport));
        }

        await using var verify = scope.NewContext();
        var reports = await verify.CommunityReports.Include(item => item.ReviewedByUser).Include(item => item.Comment).Include(item => item.Moment).ToListAsync();
        Assert.All(reports, item =>
        {
            Assert.Equal(CommunityReportStatus.Resolved, item.Status);
            Assert.Equal(Moderator, item.ReviewedByUser!.Id);
            Assert.Equal(Note, item.ReviewNote);
        });
        Assert.All(reports.Where(item => item.CommentId != null), item => Assert.NotNull(item.Comment));
        Assert.All(reports.Where(item => item.MomentId != null), item => Assert.NotNull(item.Moment));
        Assert.Equal(
            [CommunityModerationAudit.CommentRemoved, CommunityModerationAudit.MomentHidden, CommunityModerationAudit.HouseholdRestricted],
            await verify.AuditLogs.OrderBy(item => item.CreatedAt).Select(item => item.Action).ToListAsync());
    }

    // ---- helpers ----------------------------------------------------------

    private sealed record World(
        Guid MomentId,
        Guid CommentId,
        CommunityReport[] CommentReports,
        CommunityReport MomentReport,
        CommunityReport HouseholdReport);

    private static async Task<World> SeedAsync(RelationalScope scope)
    {
        Guid momentId;
        await using (var context = scope.NewContext())
        {
            SocialSurfaceHarness.AddOwner(context, Author, "author@example.com", "Author", "AuthorHome", "The Author Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Commenter, "commenter@example.com", "Commenter", "CommenterHome", "The Commenter Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Reporter, "reporter@example.com", "Reporter", "ReporterHome", "The Reporter Home", true, true);
            SocialSurfaceHarness.AddOwner(context, SecondReporter, "reporter2@example.com", "Reporter Two", "SecondHome", "The Second Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Moderator, "moderator@example.com", "Moderator", "ModHome", "Mod Home", false, false);
            SocialSurfaceHarness.AddOwner(context, SecondModerator, "moderator2@example.com", "Moderator Two", "ModTwoHome", "Mod Two Home", false, false);
            await context.SaveChangesAsync();

            SocialSurfaceHarness.AddPet(context, Pet, Author, "Topu", "Cat", true, true);
            await context.SaveChangesAsync();

            var moment = new PetMemory
            {
                PetId = Pet,
                AuthorUserId = Author,
                Title = "Beach day",
                Caption = "Sand everywhere",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = DateTimeOffset.UtcNow
            };
            context.PetMemories.Add(moment);
            context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Pet });
            await context.SaveChangesAsync();
            momentId = moment.Id;
        }

        Guid commentId;
        await using (var context = scope.NewContext())
        {
            commentId = (await Comments(context).CreateAsync(Commenter, momentId, new CreateMomentCommentRequest(Body))).Comment.Id;
        }

        var first = await SubmitAsync(scope, Reporter, "comment", commentId);
        var second = await SubmitAsync(scope, Author, "comment", commentId);
        var moment2 = await SubmitAsync(scope, Reporter, "moment", momentId);
        var household = await SubmitAsync(scope, Reporter, "household", "authorhome");
        return new World(momentId, commentId, [first, second], moment2, household);
    }

    private static async Task<CommunityReport> SubmitAsync(RelationalScope scope, Guid reporter, string type, object target)
    {
        await using (var context = scope.NewContext())
        {
            await Reports(context).SubmitAsync(reporter, new CreateCommunityReportRequest(type, target.ToString(), "SpamOrScam", null));
        }

        await using var read = scope.NewContext();
        return await read.CommunityReports.AsNoTracking()
            .Where(item => item.ReporterUserId == reporter && item.Status == CommunityReportStatus.Open)
            .OrderByDescending(item => item.CreatedAt)
            .FirstAsync();
    }

    /// <summary>
    /// Open reports that arrived around an earlier decision. Submission would
    /// refuse them now (the target is hidden or the household restricted),
    /// which is exactly why they are written directly.
    /// </summary>
    private static Task<CommunityReport> InsertOpenMomentReportAsync(RelationalScope scope, Guid momentId) =>
        InsertOpenAsync(scope, new CommunityReport
        {
            ReporterUserId = SecondReporter,
            TargetType = CommunityReportTargetType.Moment,
            MomentId = momentId,
            ReportedUserId = Author,
            Reason = CommunityReportReason.SpamOrScam,
            SnapshotHandle = "AuthorHome",
            SnapshotDisplayName = "The Author Home",
            SnapshotTitle = "Beach day"
        });

    private static Task<CommunityReport> InsertOpenHouseholdReportAsync(RelationalScope scope) =>
        InsertOpenAsync(scope, new CommunityReport
        {
            ReporterUserId = SecondReporter,
            TargetType = CommunityReportTargetType.Household,
            ReportedUserId = Author,
            Reason = CommunityReportReason.Impersonation,
            SnapshotHandle = "AuthorHome",
            SnapshotDisplayName = "The Author Home"
        });

    private static async Task<CommunityReport> InsertOpenAsync(RelationalScope scope, CommunityReport report)
    {
        await using (var context = scope.NewContext())
        {
            context.CommunityReports.Add(report);
            await context.SaveChangesAsync();
        }

        await using var read = scope.NewContext();
        return await read.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id);
    }

    private static AdminCommunityModerationRequest Request(CommunityReport report) =>
        new(Note, Convert.ToBase64String(report.RowVersion));

    private static async Task Capture(
        Dictionary<string, string> outcomes,
        string name,
        Task<AdminCommunityModerationResultResponse> action)
    {
        try
        {
            var result = await action;
            lock (outcomes)
            {
                outcomes[name] = result.Outcome;
            }
        }
        catch (ApiException exception) when (exception.StatusCode == StatusCodes.Status409Conflict)
        {
            lock (outcomes)
            {
                outcomes[name] = exception.Code;
            }
        }
    }

    private static AdminCommunityModerationService Moderation(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new AdminCommunityModerationService(
            context,
            new OwnerNotificationService(context, r2),
            new AuditLogService(context, new HttpContextAccessor()));
    }

    private static CommunityReportService Reports(MyPetLinkDbContext context) => new(context);

    private static MomentCommentService Comments(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }

    private static MemoryService Memories(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()));

    private static OwnerSocialProfileService SocialProfiles(MyPetLinkDbContext context)
    {
        var auditLog = new AuditLogService(context, new HttpContextAccessor());
        return new OwnerSocialProfileService(
            context,
            new OwnerHandleService(context, Options.Create(new SocialOptions()), auditLog),
            Options.Create(new CloudflareR2Options()),
            Options.Create(new SocialOptions()),
            auditLog);
    }

    private static async Task RaceAsync(
        SaveGate gate,
        string held,
        (string Name, Func<MyPetLinkDbContext, Task> Run) first,
        (string Name, Func<MyPetLinkDbContext, Task> Run) second,
        RelationalScope scope)
    {
        async Task Run((string Name, Func<MyPetLinkDbContext, Task> Run) operation)
        {
            SaveGate.Current.Value = operation.Name;
            if (operation.Name != held)
            {
                await gate.WaitUntilHeldAsync();
            }

            await using var context = scope.NewContext();
            try
            {
                await operation.Run(context);
            }
            finally
            {
                gate.Finished(operation.Name);
            }
        }

        await Task.WhenAll(Task.Run(() => Run(first)), Task.Run(() => Run(second)));
    }

    private sealed class SaveGate(string held) : SaveChangesInterceptor
    {
        public static readonly AsyncLocal<string?> Current = new();

        private readonly TaskCompletionSource _reached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _otherFinished = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _used;

        public Task WaitUntilHeldAsync() => _reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        public void Finished(string operation)
        {
            if (operation != held)
            {
                _otherFinished.TrySetResult();
            }
        }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (Current.Value == held && Interlocked.Exchange(ref _used, 1) == 0)
            {
                _reached.TrySetResult();
                await Task.WhenAny(_otherFinished.Task, Task.Delay(TimeSpan.FromSeconds(2), cancellationToken));
            }

            return result;
        }
    }
}
