using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using static MyPetLink.Api.Tests.SocialSurfaceHarness;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Phase 2E end-to-end lifecycle across several households: reports through
/// the real submission service, decisions through the real Admin moderation
/// service, and every consequence read back through the Community, Activity,
/// Share and Safety surfaces. Each test states one product rule.
///
/// Cast (on top of <see cref="SocialSurfaceHarness"/>):
///   Alice  @tanfamily  Moment author        Bob   @limfamily  commenter / collaborator
///   Carol  @carolpets  reporter             Erin  @erinhome   second reporter
///   Finn   @finnhome   unrelated household  Dave  @davepets   Community off
/// </summary>
public sealed class CommunityModerationLifecycleTests
{
    private static readonly Guid ErinId = Guid.Parse("c7111111-1111-1111-1111-111111111111");
    private static readonly Guid FinnId = Guid.Parse("c7222222-2222-2222-2222-222222222222");
    private static readonly Guid ErinPet = Guid.Parse("c7311111-1111-1111-1111-111111111111");
    private static readonly Guid FinnPet = Guid.Parse("c7322222-2222-2222-2222-222222222222");
    private static readonly Guid Moderator = AdminCommunityModerationTests.ModeratorId;
    private const string Note = "Reviewed against the guidelines.";

    // ---- same-target resolution --------------------------------------------------

    [Fact]
    public async Task RemovingOneCommentDecidesOnlyThatCommentsReports()
    {
        using var scene = await Scene.CreateAsync();
        var x = await scene.CommentAsync(BobId, "First rude comment");
        var y = await scene.CommentAsync(BobId, "Second rude comment");
        await scene.ReportAsync([CarolId, AliceId, ErinId], "comment", x);
        await scene.ReportAsync([CarolId, AliceId], "comment", y);
        await scene.ReportAsync([CarolId], "household", "limfamily");
        var clicked = await scene.OpenReportAsync(item => item.CommentId == x);

        var result = await scene.Moderation.RemoveCommentAsync(Moderator, clicked.Id, scene.Request(clicked));

        Assert.Equal(3, result.ReportsResolved);
        Assert.All(await scene.ReportsAsync(item => item.CommentId == x), item =>
            Assert.Equal((CommunityReportStatus.Resolved, CommunityReportResolution.CommentRemoved), (item.Status, item.Resolution!.Value)));
        Assert.All(await scene.ReportsAsync(item => item.CommentId == y || item.TargetType == CommunityReportTargetType.Household), item =>
            Assert.Equal(CommunityReportStatus.Open, item.Status));
        Assert.Equal(3, (await scene.ReportsAsync(item => item.Status == CommunityReportStatus.Open)).Length);
        Assert.Equal("Second rude comment", (await scene.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == y)).Body);
    }

    [Fact]
    public async Task HidingOneMomentDecidesOnlyThatMomentsReports()
    {
        using var scene = await Scene.CreateAsync();
        var other = await scene.Harness.AddMomentAsync(AliceId, CocoId, "Nap time", 30);
        await scene.ReportAsync([BobId, CarolId, ErinId], "moment", scene.MomentId);
        await scene.ReportAsync([BobId, CarolId], "moment", other);
        await scene.ReportAsync([CarolId], "household", "tanfamily");
        var clicked = await scene.OpenReportAsync(item => item.MomentId == scene.MomentId);

        var result = await scene.Moderation.HideMomentAsync(Moderator, clicked.Id, scene.Request(clicked));

        Assert.Equal(3, result.ReportsResolved);
        Assert.All(await scene.ReportsAsync(item => item.MomentId == scene.MomentId), item =>
            Assert.Equal(CommunityReportResolution.MomentHidden, item.Resolution));
        Assert.Equal(3, (await scene.ReportsAsync(item => item.Status == CommunityReportStatus.Open)).Length);
        Assert.Null((await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == other)).ModeratedAt);
    }

    [Fact]
    public async Task RestrictingFromAHouseholdReportDecidesOnlyTheHouseholdsProfileReports()
    {
        using var scene = await Scene.CreateAsync();
        var comment = await scene.CommentAsync(BobId, "Rude comment");
        await scene.ReportAsync([CarolId, AliceId, ErinId], "household", "limfamily");
        await scene.ReportAsync([CarolId, ErinId], "comment", comment);
        var clicked = await scene.OpenReportAsync(item => item.TargetType == CommunityReportTargetType.Household);

        var result = await scene.Moderation.RestrictHouseholdAsync(Moderator, clicked.Id, scene.Request(clicked));

        Assert.Equal(3, result.ReportsResolved);
        Assert.All(await scene.ReportsAsync(item => item.TargetType == CommunityReportTargetType.Household), item =>
            Assert.Equal(CommunityReportResolution.HouseholdRestricted, item.Resolution));
        Assert.All(await scene.ReportsAsync(item => item.CommentId == comment), item =>
            Assert.Equal(CommunityReportStatus.Open, item.Status));
    }

    // ---- restricting from Comment and Moment reports (E4A §19) -----------------------

    [Fact]
    public async Task RestrictingFromAMomentReportKeepsItAMomentReportAndLeavesTheHouseholdReport()
    {
        using var scene = await Scene.CreateAsync();
        await scene.ReportAsync([BobId], "moment", scene.MomentId);
        await scene.ReportAsync([CarolId], "household", "tanfamily");
        var momentReport = await scene.OpenReportAsync(item => item.MomentId == scene.MomentId);

        await scene.Moderation.RestrictHouseholdAsync(Moderator, momentReport.Id, scene.Request(momentReport));

        var decided = await scene.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == momentReport.Id);
        Assert.Equal((CommunityReportTargetType.Moment, scene.MomentId, CommunityReportResolution.HouseholdRestricted),
            (decided.TargetType, decided.MomentId!.Value, decided.Resolution!.Value));
        Assert.Null((await scene.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == scene.MomentId)).ModeratedAt);
        var household = await scene.OpenReportAsync(item => item.TargetType == CommunityReportTargetType.Household);

        var detail = await scene.Queries.GetAsync(Moderator, household.Id);
        Assert.Equal("Open", detail.Status);
        Assert.True(detail.ReportedHousehold.CommunityRestricted);
        Assert.Contains("RestrictHousehold", detail.AvailableActions);
        Assert.Contains("LiftRestriction", detail.AvailableActions);
    }

    // ---- attribution -----------------------------------------------------------------

    [Fact]
    public async Task ACollaboratedMomentIsAttributedToItsAuthorEverywhereAModeratorLooks()
    {
        using var scene = await Scene.CreateAsync();
        var invited = await scene.Harness.Collaborations.InviteAsync(AliceId, scene.MomentId, new("limfamily", ["buddy-pubbuddy"]));
        await scene.Harness.Collaborations.AcceptAsync(BobId, invited.Items.Single().Id, new(["buddy-pubbuddy"]));
        await scene.ReportAsync([CarolId], "moment", scene.MomentId);
        var report = await scene.OpenReportAsync(item => item.MomentId == scene.MomentId);

        Assert.Equal(AliceId, report.ReportedUserId);
        var row = (await scene.Queries.ListAsync(Moderator, new AdminCommunityReportQuery())).Items.Single();
        Assert.Equal(("TanFamily", "CarolPets"), (row.ReportedHousehold.Handle, row.Reporter.Handle));
        var detail = await scene.Queries.GetAsync(Moderator, report.Id);
        Assert.Equal(AliceId, detail.ReportedHousehold.OwnerId);
        Assert.Equal(AliceId, detail.CurrentMoment!.Author.OwnerId);
        Assert.Equal("TanFamily", detail.Evidence.Handle);
        Assert.Empty((await scene.Queries.ListAsync(Moderator, new AdminCommunityReportQuery { ReportedOwnerId = BobId })).Items);
    }

    // ---- lifecycle over time ------------------------------------------------------------

    [Fact]
    public async Task ADecidedReportStaysHistoryWhenTheSameReporterReportsAgain()
    {
        using var scene = await Scene.CreateAsync();
        var comment = await scene.CommentAsync(BobId, "Rude comment");
        await scene.ReportAsync([CarolId], "comment", comment);
        var first = await scene.OpenReportAsync(item => item.CommentId == comment);
        await scene.Moderation.DismissAsync(Moderator, first.Id, scene.Request(first));

        await scene.ReportAsync([CarolId], "comment", comment);
        var second = await scene.OpenReportAsync(item => item.CommentId == comment);

        Assert.NotEqual(first.Id, second.Id);
        var stored = await scene.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == first.Id);
        Assert.Equal((CommunityReportStatus.Resolved, CommunityReportResolution.Dismissed, Note),
            (stored.Status, stored.Resolution!.Value, stored.ReviewNote));
        var (queue, _) = await scene.Queries.ListAsync(Moderator, new AdminCommunityReportQuery());
        Assert.Equal([second.Id, first.Id], queue.Select(item => item.Id));
        Assert.Equal(["Open", "Resolved"], queue.Select(item => item.Status));
        Assert.All(queue, item => Assert.Equal(1, item.OpenReportsOnTarget));
        var detail = await scene.Queries.GetAsync(Moderator, second.Id);
        Assert.Equal(first.Id, Assert.Single(detail.TargetHistory).Id);
        Assert.Equal("Dismissed", detail.TargetHistory.Single().Resolution);
    }

    [Fact]
    public async Task AReportMadeBeforeABlockStaysReviewableAndDecidable()
    {
        using var scene = await Scene.CreateAsync();
        var comment = await scene.CommentAsync(BobId, "Rude comment");
        await scene.ReportAsync([CarolId], "comment", comment);
        await scene.Harness.Graph.BlockAsync(CarolId, "limfamily", null);

        // The Block hides Bob from Carol, so she cannot report him again — the
        // same unavailable answer as anything else she cannot see.
        var again = await Assert.ThrowsAsync<ApiException>(() => scene.Harness.Reports.SubmitAsync(
            CarolId, new CreateCommunityReportRequest("household", "limfamily", "SpamOrScam", null)));
        Assert.Equal("report_target_unavailable", again.Code);

        var report = await scene.OpenReportAsync(item => item.CommentId == comment);
        var detail = await scene.Queries.GetAsync(Moderator, report.Id);
        Assert.Equal("Rude comment", detail.CurrentComment!.Body);
        await scene.Moderation.RemoveCommentAsync(Moderator, report.Id, scene.Request(report));
        Assert.Equal("", (await scene.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == comment)).Body);
        Assert.True(await scene.Db.OwnerBlocks.AnyAsync(item => item.BlockerUserId == CarolId && item.BlockedUserId == BobId));
    }

    // ---- Activity -------------------------------------------------------------------------

    [Fact]
    public async Task HidingTakesCollaborationActivityAwayAndUnhidingBringsTheSameRowsBack()
    {
        using var scene = await Scene.CreateAsync();
        var invited = await scene.Harness.Collaborations.InviteAsync(AliceId, scene.MomentId, new("limfamily", ["buddy-pubbuddy"]));
        await scene.Harness.Collaborations.AcceptAsync(BobId, invited.Items.Single().Id, new(["buddy-pubbuddy"]));
        await scene.Harness.Likes.LikeAsync(CarolId, scene.MomentId);
        var before = await scene.ActivityAsync(AliceId);
        Assert.Contains(before, item => item.Type == "MomentCollaborationAccepted");
        Assert.Contains(before, item => item.Type == "MomentLiked");
        var rows = await scene.Db.OwnerNotifications.AsNoTracking().OrderBy(item => item.Id).Select(item => item.Id).ToListAsync();
        await scene.ReportAsync([ErinId], "moment", scene.MomentId);
        var report = await scene.OpenReportAsync(item => item.MomentId == scene.MomentId);

        await scene.Moderation.HideMomentAsync(Moderator, report.Id, scene.Request(report));
        var hidden = await scene.Harness.Notifications.GetAsync(AliceId, null, 50);
        Assert.DoesNotContain(hidden.Items, item => item.MomentId == scene.MomentId);
        Assert.Equal(hidden.Items.Count(item => !item.IsRead), hidden.UnreadCount);

        await scene.Moderation.UnhideMomentAsync(Moderator, report.Id, scene.Request(report));
        Assert.Equal(before.Select(item => item.Id), (await scene.ActivityAsync(AliceId)).Select(item => item.Id));
        Assert.Equal(rows, await scene.Db.OwnerNotifications.AsNoTracking().OrderBy(item => item.Id).Select(item => item.Id).ToListAsync());
    }

    [Fact]
    public async Task ARestrictedHouseholdLeavesCommunityAndActivityAndLiftingCreatesNothingNew()
    {
        using var scene = await Scene.CreateAsync();
        var unliked = await scene.Harness.AddMomentAsync(FinnId, FinnPet, "Garden", 40);
        var bobMoment = await scene.Harness.AddMomentAsync(BobId, BuddyId, "Walk", 45);
        var pendingInvitation = (await scene.Harness.Collaborations.InviteAsync(AliceId, scene.MomentId, new("limfamily", ["buddy-pubbuddy"]))).Items.Single().Id;
        await scene.Harness.Likes.LikeAsync(BobId, scene.MomentId);
        await scene.CommentAsync(BobId, "Nice day");
        Assert.Contains((await scene.Harness.Discovery.SearchAsync(CarolId, "lim", "owners", null, null)).Owners, owner => owner.Handle == "LimFamily");
        var before = await scene.ActivityAsync(AliceId);
        Assert.Contains(before, item => item.Actor.Handle == "LimFamily");
        var rowCount = await scene.Db.OwnerNotifications.CountAsync();
        await scene.ReportAsync([CarolId], "household", "limfamily");
        var report = await scene.OpenReportAsync(item => item.TargetType == CommunityReportTargetType.Household);

        await scene.Moderation.RestrictHouseholdAsync(Moderator, report.Id, scene.Request(report));

        var paused = await scene.Harness.Notifications.GetAsync(AliceId, null, 50);
        Assert.DoesNotContain(paused.Items, item => item.Actor.Handle == "LimFamily");
        Assert.Equal(paused.Items.Count(item => !item.IsRead), paused.UnreadCount);
        Assert.Empty((await scene.Harness.Discovery.SearchAsync(CarolId, "lim", "owners", null, null)).Owners);
        Assert.Equal(0, await scene.Db.MomentComments.VisibleComments(scene.Db, null).CountAsync(item => item.MomentId == scene.MomentId));
        var refusedEverything = new List<string>();
        foreach (var (name, attempt) in new (string, Func<Task>)[]
                 {
                     ("follow", () => scene.Harness.Graph.FollowAsync(BobId, "carolpets")),
                     ("like", () => scene.Harness.Likes.LikeAsync(BobId, unliked)),
                     ("comment or mention", () => scene.Harness.Comments.CreateAsync(BobId, scene.MomentId, new CreateMomentCommentRequest("Hello @tanfamily"))),
                     ("report", () => scene.Harness.Reports.SubmitAsync(BobId, new CreateCommunityReportRequest("moment", scene.MomentId.ToString(), "SpamOrScam", null))),
                     ("accept a collaboration", () => scene.Harness.Collaborations.AcceptAsync(BobId, pendingInvitation, new(["buddy-pubbuddy"]))),
                     ("invite a collaborator", () => scene.Harness.Collaborations.InviteAsync(BobId, bobMoment, new("finnhome", ["olly-pubolly"]))),
                 })
        {
            try
            {
                await attempt();
                refusedEverything.Add(name);
            }
            catch (ApiException)
            {
            }
        }

        Assert.True(refusedEverything.Count == 0, "A restricted household could still: " + string.Join(", ", refusedEverything));
        Assert.False(await scene.Db.OwnerFollows.AnyAsync(item => item.FollowerUserId == BobId));

        await scene.Moderation.LiftRestrictionAsync(Moderator, report.Id, scene.Request(report));

        Assert.Equal(before.Select(item => item.Id), (await scene.ActivityAsync(AliceId)).Select(item => item.Id));
        Assert.Equal(rowCount, await scene.Db.OwnerNotifications.CountAsync());
        Assert.Contains((await scene.Harness.Discovery.SearchAsync(CarolId, "lim", "owners", null, null)).Owners, owner => owner.Handle == "LimFamily");
    }

    // ---- audit ---------------------------------------------------------------------------

    [Fact]
    public async Task EveryActionWritesExactlyOneAuditRowNamingWhatItDid()
    {
        using var scene = await Scene.CreateAsync();
        var comment = await scene.CommentAsync(BobId, "Rude comment");
        await scene.ReportAsync([CarolId], "comment", comment);
        await scene.ReportAsync([CarolId], "moment", scene.MomentId);
        await scene.ReportAsync([CarolId, ErinId], "household", "limfamily");
        var commentReport = await scene.OpenReportAsync(item => item.CommentId == comment);
        var momentReport = await scene.OpenReportAsync(item => item.MomentId == scene.MomentId);
        var households = await scene.ReportsAsync(item => item.TargetType == CommunityReportTargetType.Household);

        await scene.Moderation.RemoveCommentAsync(Moderator, commentReport.Id, scene.Request(commentReport));
        await scene.Moderation.HideMomentAsync(Moderator, momentReport.Id, scene.Request(momentReport));
        await scene.Moderation.UnhideMomentAsync(Moderator, momentReport.Id, scene.Request(momentReport));
        await scene.Moderation.RestrictHouseholdAsync(Moderator, households[0].Id, scene.Request(households[0]));
        await scene.Moderation.LiftRestrictionAsync(Moderator, households[0].Id, scene.Request(households[0]));
        await scene.ReportAsync([FinnId], "moment", scene.MomentId);
        var dismissed = await scene.OpenReportAsync(item => item.MomentId == scene.MomentId);
        await scene.Moderation.DismissAsync(Moderator, dismissed.Id, scene.Request(dismissed));

        var audit = await scene.Db.AuditLogs.AsNoTracking().OrderBy(item => item.CreatedAt).ToListAsync();
        Assert.Equal(
            [
                (CommunityModerationAudit.CommentRemoved, CommunityModerationAudit.CommentEntity, comment),
                (CommunityModerationAudit.MomentHidden, CommunityModerationAudit.MomentEntity, scene.MomentId),
                (CommunityModerationAudit.MomentUnhidden, CommunityModerationAudit.MomentEntity, scene.MomentId),
                (CommunityModerationAudit.HouseholdRestricted, CommunityModerationAudit.HouseholdEntity, await scene.ProfileIdAsync(BobId)),
                (CommunityModerationAudit.HouseholdRestrictionLifted, CommunityModerationAudit.HouseholdEntity, await scene.ProfileIdAsync(BobId)),
                (CommunityModerationAudit.ReportDismissed, CommunityModerationAudit.ReportEntity, dismissed.Id),
            ],
            audit.Select(item => (item.Action, item.Entity, item.EntityId!.Value)));
        Assert.All(audit, item =>
        {
            Assert.Equal((Moderator, ActorType.Admin), (item.ActorId!.Value, item.ActorType));
            Assert.Contains(Note, item.NewValue);
            Assert.False(string.IsNullOrEmpty(item.OldValue));
        });

        // Report context: the decisions name the reports they closed; the two
        // reversals name the report they were taken from.
        Assert.Contains(commentReport.Id.ToString(), audit[0].NewValue);
        Assert.Contains(households[1].Id.ToString(), audit[3].NewValue);
        Assert.Contains(momentReport.Id.ToString(), audit[2].NewValue);
        Assert.Contains(households[0].Id.ToString(), audit[4].NewValue);
    }

    // ---- hostile text ----------------------------------------------------------------------

    [Fact]
    public async Task HostileLookingTextIsKeptAsWordsAndNotesKeepEmojiButLoseControlCharacters()
    {
        using var scene = await Scene.CreateAsync();
        const string body = "<img src=x onerror=alert(1)> **bold** [link](javascript:alert(1))";
        var comment = await scene.CommentAsync(BobId, body);
        var bob = await scene.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == BobId);
        bob.Bio = "<script>alert('bio')</script>";
        await scene.Db.SaveChangesAsync();
        scene.Db.ChangeTracker.Clear();
        await scene.ReportAsync([CarolId], "comment", comment);
        await scene.ReportAsync([CarolId], "household", "limfamily", "<b>see</b> ‮evil");
        var commentReport = await scene.OpenReportAsync(item => item.CommentId == comment);
        var householdReport = await scene.OpenReportAsync(item => item.TargetType == CommunityReportTargetType.Household);

        Assert.Equal(body, (await scene.Queries.GetAsync(Moderator, commentReport.Id)).Evidence.Text);
        var household = await scene.Queries.GetAsync(Moderator, householdReport.Id);
        Assert.Equal("<script>alert('bio')</script>", household.Evidence.Text);
        Assert.Equal("<b>see</b> evil", household.Details);

        await scene.Moderation.DismissAsync(Moderator, householdReport.Id, new AdminCommunityModerationRequest(
            "Checked 🐾 <i>fine</i>\u0007‏ — ok", Convert.ToBase64String(householdReport.RowVersion)));
        Assert.Equal("Checked 🐾 <i>fine</i> — ok",
            (await scene.Queries.GetAsync(Moderator, householdReport.Id)).ReviewNote);
    }

    // ---- scene ------------------------------------------------------------------------------

    private sealed class Scene : IDisposable
    {
        private Scene(SocialSurfaceHarness harness, Guid momentId)
        {
            Harness = harness;
            MomentId = momentId;
            Moderation = new AdminCommunityModerationService(
                harness.Db,
                harness.Notifications,
                new AuditLogService(harness.Db, new HttpContextAccessor()));
            Queries = new AdminCommunityReportQueryService(harness.Db, Options.Create(new CloudflareR2Options()));
        }

        public SocialSurfaceHarness Harness { get; }
        public Data.MyPetLinkDbContext Db => Harness.Db;
        public Guid MomentId { get; }
        public AdminCommunityModerationService Moderation { get; }
        public AdminCommunityReportQueryService Queries { get; }

        public static async Task<Scene> CreateAsync()
        {
            var harness = await SocialSurfaceHarness.CreateAsync();
            await harness.AddHouseholdAsync(ErinId, "ErinHome", "Erin's Home", ErinPet, "Pip");
            await harness.AddHouseholdAsync(FinnId, "FinnHome", "Finn's Home", FinnPet, "Olly");
            AddOwner(harness.Db, Moderator, "moderator@example.com", "Moderator One", "ModOne", "Mod One", false, false);
            await harness.Db.SaveChangesAsync();
            var momentId = await harness.AddMomentAsync(AliceId, MochiId, "Beach day", 10);
            harness.Db.ChangeTracker.Clear();
            return new Scene(harness, momentId);
        }

        public async Task<Guid> CommentAsync(Guid authorId, string body) =>
            (await Harness.Comments.CreateAsync(authorId, MomentId, new CreateMomentCommentRequest(body))).Comment.Id;

        public async Task ReportAsync(Guid[] reporters, string type, object target, string? details = null)
        {
            foreach (var reporter in reporters)
            {
                await Harness.Reports.SubmitAsync(reporter, new CreateCommunityReportRequest(type, target.ToString(), "HarassmentOrBullying", details));
                await Task.Delay(5);
            }

            Db.ChangeTracker.Clear();
        }

        public Task<CommunityReport[]> ReportsAsync(System.Linq.Expressions.Expression<Func<CommunityReport, bool>> filter) =>
            Db.CommunityReports.AsNoTracking().Where(filter).OrderBy(item => item.CreatedAt).ToArrayAsync();

        public async Task<CommunityReport> OpenReportAsync(System.Linq.Expressions.Expression<Func<CommunityReport, bool>> filter) =>
            (await ReportsAsync(filter)).First(item => item.Status == CommunityReportStatus.Open);

        public AdminCommunityModerationRequest Request(CommunityReport report) =>
            new(Note, Convert.ToBase64String(report.RowVersion));

        public async Task<OwnerNotificationResponse[]> ActivityAsync(Guid recipientId) =>
            (await Harness.Notifications.GetAsync(recipientId, null, 50)).Items.ToArray();

        public Task<Guid> ProfileIdAsync(Guid userId) =>
            Db.OwnerSocialProfiles.AsNoTracking().Where(item => item.UserId == userId).Select(item => item.Id).SingleAsync();

        public void Dispose() => Harness.Dispose();
    }
}
