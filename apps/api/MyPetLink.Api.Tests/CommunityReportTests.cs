using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Report submission (Phase 2E E2): who may report what, what is resolved on
/// the server, the evidence kept, idempotency, and that a report changes
/// nothing but the report table.
/// </summary>
public sealed class CommunityReportTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;   // @TanFamily, the Moment's author
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;       // @LimFamily, commenter / collaborator
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;   // @CarolPets, the reporter
    private static readonly Guid Dave = SocialSurfaceHarness.DaveId;     // @DavePets, Community off
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Erin = Guid.Parse("f7111111-1111-1111-1111-111111111111");
    private static readonly Guid Moderator = Guid.Parse("f7222222-2222-2222-2222-222222222222");

    // ---- Comment ----------------------------------------------------------------

    [Fact]
    public async Task AReportedCommentNamesItsAuthorAndKeepsItsWords()
    {
        using var harness = await CreateAsync();
        var (momentId, commentId) = await SeedCommentAsync(harness, "Buy followers at spam.example");

        await Report(harness, Carol, "comment", commentId, "SpamOrScam");

        var report = await harness.Db.CommunityReports.SingleAsync();
        Assert.Equal(CommunityReportTargetType.Comment, report.TargetType);
        Assert.Equal(commentId, report.CommentId);
        Assert.Null(report.MomentId);
        Assert.Equal(Bob, report.ReportedUserId);
        Assert.Equal(Carol, report.ReporterUserId);
        Assert.Equal(("LimFamily", "The Lim Family"), (report.SnapshotHandle, report.SnapshotDisplayName));
        Assert.Equal("Buy followers at spam.example", report.SnapshotText);
        Assert.Null(report.SnapshotTitle);
        Assert.Null(report.SnapshotAvatarMediaFileId);
        Assert.Equal(CommunityReportStatus.Open, report.Status);
        Assert.Null(report.Resolution);

        // The Moment's author can report a Comment on their own Moment.
        await Report(harness, Alice, "comment", commentId, "HarassmentOrBullying");
        Assert.Equal(2, await harness.Db.CommunityReports.CountAsync(item => item.ReportedUserId == Bob));
        _ = momentId;
    }

    [Fact]
    public async Task ACommentTheReporterCannotSeeIsUnavailable()
    {
        using var harness = await CreateAsync();
        var (momentId, commentId) = await SeedCommentAsync(harness, "hello");

        Assert.Equal("report_own_content", (await Refused(harness, Bob, "comment", commentId)).Code);

        // Blocked either way with the commenter.
        await harness.Graph.BlockAsync(Carol, "limfamily", null);
        await AssertUnavailable(harness, Carol, "comment", commentId);
        await harness.Graph.UnblockAsync(Carol, "limfamily");

        // The Moment itself unavailable to the reporter: its author blocked them.
        await harness.Graph.BlockAsync(Alice, "carolpets", null);
        await AssertUnavailable(harness, Carol, "comment", commentId);
        await harness.Graph.UnblockAsync(Alice, "carolpets");

        // Deleted, and never a real id at all.
        await harness.Comments.DeleteAsync(Bob, momentId, commentId);
        await AssertUnavailable(harness, Carol, "comment", commentId);
        await AssertUnavailable(harness, Carol, "comment", Guid.NewGuid());
        await AssertUnavailable(harness, Carol, "comment", "not-a-guid");
        Assert.Equal(0, await harness.Db.CommunityReports.CountAsync());
    }

    // ---- Moment -------------------------------------------------------------------

    [Fact]
    public async Task AReportedMomentNamesItsAuthorAndKeepsItsTitleAndCaption()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        await SetCaptionAsync(harness, momentId, "Sand everywhere");

        await Report(harness, Carol, "moment", momentId, "InappropriateContent", "The second photo");

        var report = await harness.Db.CommunityReports.SingleAsync();
        Assert.Equal((CommunityReportTargetType.Moment, (Guid?)momentId, (Guid?)null), (report.TargetType, report.MomentId, report.CommentId));
        Assert.Equal(Alice, report.ReportedUserId);
        Assert.Equal(("TanFamily", "The Tan Family", "Beach day", "Sand everywhere"),
            (report.SnapshotHandle, report.SnapshotDisplayName, report.SnapshotTitle, report.SnapshotText));
        Assert.Equal("The second photo", report.Details);
    }

    [Fact]
    public async Task AMomentTheReporterCannotSeeIsUnavailable()
    {
        using var harness = await CreateAsync();
        var privateMoment = await harness.AddMomentAsync(Alice, Mochi, "Private", 10, MemoryVisibility.Private, published: false);
        var archived = await harness.AddMomentAsync(Alice, Mochi, "Archived", 11, archived: true);
        var hidden = await harness.AddMomentAsync(Alice, Mochi, "Hidden", 12);
        var blocked = await harness.AddMomentAsync(Alice, Mochi, "Blocked", 13);
        var mine = await harness.AddMomentAsync(Alice, Mochi, "Mine", 14);

        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == hidden);
        CommunityModeration.HideMoment(moment, Moderator, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();

        Assert.Equal("report_own_content", (await Refused(harness, Alice, "moment", mine)).Code);
        await AssertUnavailable(harness, Carol, "moment", privateMoment);
        await AssertUnavailable(harness, Carol, "moment", archived);
        await AssertUnavailable(harness, Carol, "moment", hidden);
        await AssertUnavailable(harness, Carol, "moment", Guid.NewGuid());

        await harness.Graph.BlockAsync(Carol, "tanfamily", null);
        await AssertUnavailable(harness, Carol, "moment", blocked);
        Assert.Equal(0, await harness.Db.CommunityReports.CountAsync());
    }

    [Fact]
    public async Task OnACollaboratedMomentTheAuthorIsReportedAndNothingChanges()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        var invited = await harness.Collaborations.InviteAsync(
            Alice, momentId, new CreateMomentCollaborationRequest("limfamily", ["buddy-pubbuddy"]));
        await harness.Collaborations.AcceptAsync(Bob, invited.Items.Single().Id, new AcceptMomentCollaborationRequest(["buddy-pubbuddy"]));
        var comment = await harness.Comments.CreateAsync(Erin, momentId, new CreateMomentCommentRequest("rude"));

        // The collaborator reports the Moment; a stranger reports it; a Comment
        // on it is reported.
        await Report(harness, Bob, "moment", momentId, "Other", "Not what I agreed to");
        await Report(harness, Carol, "moment", momentId, "SpamOrScam");
        await Report(harness, Carol, "comment", comment.Comment.Id, "HarassmentOrBullying");

        var reports = await harness.Db.CommunityReports.OrderBy(item => item.CreatedAt).ToListAsync();
        Assert.Equal([Alice, Alice, Erin], reports.Select(item => item.ReportedUserId).ToArray());
        Assert.Equal(MomentCollaborationStatus.Accepted, (await harness.Db.MomentCollaborations.SingleAsync()).Status);
        Assert.Equal(1, await harness.Db.MomentPets.VisibleCollaboratorSubjects(harness.Db, null).CountAsync());
    }

    // ---- Household ------------------------------------------------------------------

    [Fact]
    public async Task AReportedHouseholdKeepsItsPublicIdentityOnly()
    {
        using var harness = await CreateAsync();
        var profile = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Alice);
        profile.Bio = "Official MyPetLink support";
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();

        await Report(harness, Carol, "household", "@TanFamily", "Impersonation");

        var report = await harness.Db.CommunityReports.SingleAsync();
        Assert.Equal((CommunityReportTargetType.Household, (Guid?)null, (Guid?)null), (report.TargetType, report.CommentId, report.MomentId));
        Assert.Equal(Alice, report.ReportedUserId);
        Assert.Equal(("TanFamily", "The Tan Family", "Official MyPetLink support"),
            (report.SnapshotHandle, report.SnapshotDisplayName, report.SnapshotText));
        Assert.Null(report.SnapshotTitle);
    }

    [Fact]
    public async Task AHouseholdTheReporterCannotSeeIsUnavailable()
    {
        using var harness = await CreateAsync();
        var gina = Guid.Parse("f7333333-3333-3333-3333-333333333333");
        var hank = Guid.Parse("f7444444-4444-4444-4444-444444444444");
        var ivy = Guid.Parse("f7555555-5555-5555-5555-555555555555");
        await harness.AddHouseholdAsync(gina, "GinaHome", "Gina's Home", Guid.NewGuid(), "Kit");
        await harness.AddHouseholdAsync(hank, "HankHome", "Hank's Home", Guid.NewGuid(), "Rex");
        await harness.AddHouseholdAsync(ivy, "IvyHome", "Ivy's Home", Guid.NewGuid(), "Pip");
        (await harness.Db.Users.SingleAsync(user => user.Id == gina)).Status = UserStatus.Suspended;
        (await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == hank)).DisplayName = "";
        CommunityModeration.RestrictHousehold(
            await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == ivy), Moderator, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
        await harness.Graph.BlockAsync(Carol, "erinhome", null);

        Assert.Equal("report_own_content", (await Refused(harness, Carol, "household", "carolpets")).Code);
        foreach (var handle in new[] { "DavePets", "GinaHome", "HankHome", "IvyHome", "ErinHome", "NobodyHome", "", "!!" })
        {
            await AssertUnavailable(harness, Carol, "household", handle);
        }

        Assert.Equal(0, await harness.Db.CommunityReports.CountAsync());
    }

    // ---- reporter, reasons, details ---------------------------------------------------

    [Fact]
    public async Task OnlyASignedInCommunityHouseholdMayReport()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);

        Assert.Equal(StatusCodes.Status401Unauthorized, (await Refused(harness, null, "moment", momentId)).StatusCode);
        Assert.Equal("community_profile_required", (await Refused(harness, Dave, "moment", momentId)).Code);
        (await harness.Db.Users.SingleAsync(user => user.Id == Carol)).Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
        Assert.Equal("account_inactive", (await Refused(harness, Carol, "moment", momentId)).Code);
    }

    [Fact]
    public async Task EveryApprovedReasonIsAcceptedAndNothingElse()
    {
        using var harness = await CreateAsync();
        var momentIds = new List<Guid>();
        foreach (var reason in Enum.GetValues<CommunityReportReason>().Where(item => item != CommunityReportReason.Unknown))
        {
            var momentId = await harness.AddMomentAsync(Alice, Mochi, reason.ToString(), momentIds.Count);
            momentIds.Add(momentId);
            await Report(harness, Carol, "moment", momentId, reason.ToString().ToLowerInvariant(), "because");
            Assert.Equal(reason, (await harness.Db.CommunityReports.SingleAsync(item => item.MomentId == momentId)).Reason);
        }

        foreach (var bad in new[] { null, "", "Unknown", "1", "7", "Spam", "Other ", "Other,Spam" })
        {
            var code = (await Refused(harness, Carol, "moment", momentIds[0], bad, "x")).Code;
            Assert.True(code is "report_reason_required", $"{bad}: {code}");
        }

        Assert.Equal("report_target_type_invalid", (await Refused(harness, Carol, "pet", momentIds[0])).Code);
        Assert.Equal("report_target_type_invalid", (await Refused(harness, Carol, "Unknown", momentIds[0])).Code);
    }

    [Fact]
    public async Task DetailsAreNormalizedBoundedAndRequiredOnlyForOther()
    {
        using var harness = await CreateAsync();
        var first = await harness.AddMomentAsync(Alice, Mochi, "One", 1);
        var second = await harness.AddMomentAsync(Alice, Mochi, "Two", 2);
        var third = await harness.AddMomentAsync(Alice, Mochi, "Three", 3);

        Assert.Equal("report_details_required", (await Refused(harness, Carol, "moment", first, "Other", " ​ ")).Code);
        Assert.Equal("report_details_too_long", (await Refused(harness, Carol, "moment", first, "Other", new string('a', 501))).Code);

        await Report(harness, Carol, "moment", first, "Other", new string('a', 500));
        await Report(harness, Carol, "moment", second, "SpamOrScam", " ‮<b>scam</b> 🐶\u0007 ");
        await Report(harness, Carol, "moment", third, "SpamOrScam");

        Assert.Equal(500, (await harness.Db.CommunityReports.SingleAsync(item => item.MomentId == first)).Details!.Length);
        // Plain text, stored as typed: markup is never interpreted, only invisible controls are removed.
        Assert.Equal("<b>scam</b> 🐶", (await harness.Db.CommunityReports.SingleAsync(item => item.MomentId == second)).Details);
        Assert.Null((await harness.Db.CommunityReports.SingleAsync(item => item.MomentId == third)).Details);
    }

    // ---- evidence, duplicates, side effects -------------------------------------------

    [Fact]
    public async Task EvidenceIsNeverRewrittenWhenTheTargetChanges()
    {
        using var harness = await CreateAsync();
        var (momentId, commentId) = await SeedCommentAsync(harness, "original words");
        await Report(harness, Carol, "comment", commentId, "HarassmentOrBullying");
        await Report(harness, Carol, "moment", momentId, "SpamOrScam");
        await Report(harness, Carol, "household", "limfamily", "Impersonation");

        // Everything reported changes afterwards: the Comment is deleted, the
        // Moment edited, the household renamed.
        await harness.Comments.DeleteAsync(Bob, momentId, commentId);
        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        moment.Title = "Edited title";
        moment.Caption = "Edited caption";
        var bob = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == Bob);
        bob.Handle = "NewLim";
        bob.NormalizedHandle = "newlim";
        bob.DisplayName = "New Name";
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();

        var reports = await harness.Db.CommunityReports.ToListAsync();
        var comment = reports.Single(item => item.TargetType == CommunityReportTargetType.Comment);
        Assert.Equal(("LimFamily", "original words", Bob), (comment.SnapshotHandle, comment.SnapshotText, comment.ReportedUserId));
        Assert.Equal("", (await harness.Db.MomentComments.SingleAsync(item => item.Id == commentId)).Body);
        var reportedMoment = reports.Single(item => item.TargetType == CommunityReportTargetType.Moment);
        Assert.Equal("Beach day", reportedMoment.SnapshotTitle);
        var household = reports.Single(item => item.TargetType == CommunityReportTargetType.Household);
        Assert.Equal(("LimFamily", "The Lim Family", Bob), (household.SnapshotHandle, household.SnapshotDisplayName, household.ReportedUserId));
    }

    [Fact]
    public async Task ARepeatConvergesOnTheOpenReportAndAResolvedOneAllowsANewReport()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);

        var first = await harness.Reports.SubmitAsync(Carol, Request("moment", momentId, "SpamOrScam", "first"));
        var original = await harness.Db.CommunityReports.AsNoTracking().SingleAsync();
        var again = await harness.Reports.SubmitAsync(Carol, Request("moment", momentId, "Impersonation", "changed my mind"));
        harness.Db.ChangeTracker.Clear();

        Assert.Equal(first, again);
        var stored = await harness.Db.CommunityReports.SingleAsync();
        Assert.Equal((original.Id, original.Reason, original.Details, original.CreatedAt, original.SnapshotTitle),
            (stored.Id, stored.Reason, stored.Details, stored.CreatedAt, stored.SnapshotTitle));

        // Resolved: history. A new, genuine report is a new row.
        stored.Status = CommunityReportStatus.Resolved;
        stored.Resolution = CommunityReportResolution.Dismissed;
        stored.ReviewedAt = DateTimeOffset.UtcNow;
        stored.ReviewedByUserId = Moderator;
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();

        await Report(harness, Carol, "moment", momentId, "Impersonation");
        Assert.Equal(2, await harness.Db.CommunityReports.CountAsync());
        Assert.Equal(CommunityReportResolution.Dismissed,
            (await harness.Db.CommunityReports.SingleAsync(item => item.Id == original.Id)).Resolution);
    }

    [Fact]
    public async Task AReportChangesNothingButTheReportTable()
    {
        using var harness = await CreateAsync();
        await harness.FollowAsync(Carol, "tanfamily");
        var (momentId, commentId) = await SeedCommentAsync(harness, "hello");
        await harness.Likes.LikeAsync(Carol, momentId);
        var before = await StateAsync(harness);

        await Report(harness, Carol, "comment", commentId, "HarassmentOrBullying");
        await Report(harness, Carol, "moment", momentId, "InappropriateContent");
        await Report(harness, Carol, "household", "tanfamily", "SpamOrScam");

        Assert.Equal(before, await StateAsync(harness));
        Assert.Equal(3, await harness.Db.CommunityReports.CountAsync());
    }

    // ---- helpers ------------------------------------------------------------------

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Erin, "ErinHome", "The Ong Home", Guid.NewGuid(), "Pip");
        SocialSurfaceHarness.AddOwner(harness.Db, Moderator, "moderator@example.com", "Moderator", "ModHome",
            "Mod Home", social: false, discoverable: false);
        await harness.Db.SaveChangesAsync();
        return harness;
    }

    private static async Task<(Guid MomentId, Guid CommentId)> SeedCommentAsync(SocialSurfaceHarness harness, string body)
    {
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 20);
        var created = await harness.Comments.CreateAsync(Bob, momentId, new CreateMomentCommentRequest(body));
        harness.Db.ChangeTracker.Clear();
        return (momentId, created.Comment.Id);
    }

    private static async Task SetCaptionAsync(SocialSurfaceHarness harness, Guid momentId, string caption)
    {
        (await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId)).Caption = caption;
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }

    private static CreateCommunityReportRequest Request(string type, object target, string? reason, string? details = null) =>
        new(type, target.ToString(), reason, details);

    private static async Task Report(
        SocialSurfaceHarness harness, Guid reporter, string type, object target, string reason, string? details = null)
    {
        var response = await harness.Reports.SubmitAsync(reporter, Request(type, target, reason, details));
        Assert.True(response.Accepted);
        harness.Db.ChangeTracker.Clear();
    }

    private static async Task<ApiException> Refused(
        SocialSurfaceHarness harness, Guid? reporter, string type, object target, string? reason = "SpamOrScam", string? details = null)
    {
        var refused = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Reports.SubmitAsync(reporter, Request(type, target, reason, details)));
        harness.Db.ChangeTracker.Clear();
        return refused;
    }

    private static async Task AssertUnavailable(SocialSurfaceHarness harness, Guid reporter, string type, object target)
    {
        var refused = await Refused(harness, reporter, type, target);
        Assert.Equal(
            (StatusCodes.Status404NotFound, "report_target_unavailable", "This is no longer available to report."),
            (refused.StatusCode, refused.Code, refused.Message));
    }

    /// <summary>Everything a report must not touch.</summary>
    private static async Task<string> StateAsync(SocialSurfaceHarness harness)
    {
        harness.Db.ChangeTracker.Clear();
        var db = harness.Db;
        return string.Join("|",
            await db.OwnerBlocks.CountAsync(),
            await db.OwnerFollows.CountAsync(),
            await db.MomentLikes.CountAsync(),
            await db.MomentComments.CountAsync(item => item.DeletedAt == null),
            await db.OwnerNotifications.CountAsync(),
            await db.MomentCollaborations.CountAsync(),
            await db.MomentPets.CountAsync(),
            await db.PetMemories.CountAsync(item => item.ModeratedAt != null),
            await db.OwnerSocialProfiles.CountAsync(item => item.IsSocialEnabled),
            await db.OwnerSocialProfiles.CountAsync(item => item.CommunityRestrictedAt != null),
            await db.AuditLogs.CountAsync(),
            await db.Users.CountAsync(item => item.Status != UserStatus.Active));
    }
}
