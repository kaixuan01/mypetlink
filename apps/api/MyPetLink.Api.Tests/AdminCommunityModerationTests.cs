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
/// The Admin moderation actions, decided from reports: what each one changes,
/// what it deliberately leaves alone, which reports it decides, and the one
/// audit row it writes. HTTP authorization and SQL Server races are covered
/// separately.
/// </summary>
public sealed class AdminCommunityModerationTests
{
    internal static readonly Guid ModeratorId = Guid.Parse("c9111111-1111-1111-1111-111111111111");
    internal static readonly Guid SecondModeratorId = Guid.Parse("c9222222-2222-2222-2222-222222222222");
    private const string Note = "Checked against the Community guidelines.";

    // ---- Dismiss --------------------------------------------------------------

    [Fact]
    public async Task DismissDecidesEveryOpenReportOnTheSameTargetAndChangesNothingElse()
    {
        using var world = await ModerationWorld.CreateAsync();
        var commentReports = await world.ReportsAboutAsync(CommunityReportTargetType.Comment);
        Assert.Equal(2, commentReports.Length);

        var result = await world.Moderation.DismissAsync(ModeratorId, commentReports[0].Id, world.Request(commentReports[0]));

        Assert.Equal(new AdminCommunityModerationResultResponse(commentReports[0].Id, "Applied", 2), result);
        foreach (var report in await world.ReportsAboutAsync(CommunityReportTargetType.Comment))
        {
            Assert.Equal(CommunityReportStatus.Resolved, report.Status);
            Assert.Equal(CommunityReportResolution.Dismissed, report.Resolution);
            Assert.Equal(ModeratorId, report.ReviewedByUserId);
            Assert.Equal(Note, report.ReviewNote);
            Assert.NotNull(report.ReviewedAt);
        }

        // Other targets — the Moment and the household — stay undecided, and
        // the Comment is untouched.
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Moment), report => Assert.Equal(CommunityReportStatus.Open, report.Status));
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Household), report => Assert.Equal(CommunityReportStatus.Open, report.Status));
        var comment = await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == world.CommentId);
        Assert.Null(comment.DeletedAt);
        Assert.Equal(ModerationWorld.CommentBody, comment.Body);

        var audit = Assert.Single(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
        Assert.Equal(CommunityModerationAudit.ReportDismissed, audit.Action);
        Assert.Equal(ModeratorId, audit.ActorId);
        Assert.Equal(ActorType.Admin, audit.ActorType);
        Assert.Equal(commentReports[0].Id, audit.EntityId);
        Assert.Contains(Note, audit.NewValue);
        Assert.Contains(commentReports[1].Id.ToString(), audit.NewValue);
    }

    [Fact]
    public async Task AReportIsDecidedOnlyOnce()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();
        await world.Moderation.DismissAsync(ModeratorId, report.Id, world.Request(report));

        foreach (var again in new Func<Task>[]
                 {
                     () => world.Moderation.DismissAsync(SecondModeratorId, report.Id, world.Request(report)),
                     () => world.Moderation.HideMomentAsync(SecondModeratorId, report.Id, world.Request(report)),
                     () => world.Moderation.RestrictHouseholdAsync(SecondModeratorId, report.Id, world.Request(report))
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(again);
            Assert.Equal(StatusCodes.Status409Conflict, refused.StatusCode);
            Assert.Equal("community_report_already_resolved", refused.Code);
        }

        var stored = await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id);
        Assert.Equal(ModeratorId, stored.ReviewedByUserId);
        Assert.Null((await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId)).ModeratedAt);
        Assert.Single(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task AStaleRowVersionIsAConflict()
    {
        // The in-memory provider has no transactions, so "and nothing was
        // written" is proven on SQL Server (AdminCommunityModerationRelationalTests).
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();

        var refused = await Assert.ThrowsAsync<ApiException>(() => world.Moderation.DismissAsync(
            ModeratorId, report.Id, new AdminCommunityModerationRequest(Note, Convert.ToBase64String([1, 2, 3, 4]))));

        Assert.Equal(StatusCodes.Status409Conflict, refused.StatusCode);
        Assert.Equal("concurrency_conflict", refused.Code);
    }

    // ---- Remove Comment ---------------------------------------------------------

    [Fact]
    public async Task RemovingACommentIsTheSameRemovalAsDeletingItAndKeepsTheEvidence()
    {
        using var world = await ModerationWorld.CreateAsync();
        Assert.Equal(1, await world.VisibleCommentCountAsync());
        Assert.NotEmpty(await world.Db.MomentCommentMentions.AsNoTracking().Where(item => item.CommentId == world.CommentId).ToListAsync());
        Assert.Contains(await world.ActivityTypesAsync(AliceId), type => type == "MomentCommented");
        Assert.Contains(await world.ActivityTypesAsync(CarolId), type => type == "MomentCommentMentioned");
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Comment)).First();

        var result = await world.Moderation.RemoveCommentAsync(ModeratorId, report.Id, world.Request(report));

        Assert.Equal("Applied", result.Outcome);
        Assert.Equal(2, result.ReportsResolved);
        var comment = await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == world.CommentId);
        Assert.Equal("", comment.Body);
        Assert.Equal(ModeratorId, comment.DeletedByUserId);
        Assert.Equal(BobId, comment.AuthorUserId);
        Assert.Empty(await world.Db.MomentCommentMentions.AsNoTracking().Where(item => item.CommentId == world.CommentId).ToListAsync());
        Assert.Equal(0, await world.VisibleCommentCountAsync());
        Assert.DoesNotContain(await world.ActivityTypesAsync(AliceId), type => type == "MomentCommented");
        Assert.DoesNotContain(await world.ActivityTypesAsync(CarolId), type => type == "MomentCommentMentioned");

        // Nothing else about the Moment, its author or the commenter changed.
        var moment = await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId);
        Assert.Equal(AliceId, moment.AuthorUserId);
        Assert.Null(moment.ModeratedAt);
        var bob = await world.Db.Users.AsNoTracking().Include(item => item.SocialProfile).SingleAsync(item => item.Id == BobId);
        Assert.Equal(UserStatus.Active, bob.Status);
        Assert.True(bob.SocialProfile!.IsSocialEnabled);

        // The reports keep the words that were removed.
        foreach (var decided in await world.ReportsAboutAsync(CommunityReportTargetType.Comment))
        {
            Assert.Equal(CommunityReportResolution.CommentRemoved, decided.Resolution);
            Assert.Equal(ModerationWorld.CommentBody, decided.SnapshotText);
            Assert.Equal(BobId, decided.ReportedUserId);
        }

        var audit = Assert.Single(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
        Assert.Equal(CommunityModerationAudit.CommentRemoved, audit.Action);
        Assert.Equal(CommunityModerationAudit.CommentEntity, audit.Entity);
        Assert.Equal(world.CommentId, audit.EntityId);
        Assert.Contains("\"removed\":false", audit.OldValue);
        Assert.Contains("\"alreadyRemoved\":false", audit.NewValue);
        Assert.Contains(report.Id.ToString(), audit.NewValue);
    }

    [Fact]
    public async Task RemovingACommentItsAuthorAlreadyDeletedDecidesTheReportsWithoutTouchingIt()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Comment)).First();
        await world.Harness.Comments.DeleteAsync(BobId, world.MomentId, world.CommentId);
        var deleted = await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == world.CommentId);

        var result = await world.Moderation.RemoveCommentAsync(ModeratorId, report.Id, world.Request(report));

        Assert.Equal("AlreadyInEffect", result.Outcome);
        Assert.Equal(2, result.ReportsResolved);
        var comment = await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == world.CommentId);
        Assert.Equal(BobId, comment.DeletedByUserId);
        Assert.Equal(deleted.DeletedAt, comment.DeletedAt);
        Assert.Equal("", comment.Body);
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Comment),
            item => Assert.Equal(CommunityReportResolution.CommentRemoved, item.Resolution));
        var audit = Assert.Single(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
        Assert.Contains("\"alreadyRemoved\":true", audit.NewValue);
        Assert.Contains(BobId.ToString(), audit.OldValue);
    }

    [Fact]
    public async Task EachActionAppliesOnlyToItsOwnKindOfReport()
    {
        using var world = await ModerationWorld.CreateAsync();
        var momentReport = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();
        var householdReport = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();
        var commentReport = (await world.ReportsAboutAsync(CommunityReportTargetType.Comment)).First();

        foreach (var attempt in new Func<Task>[]
                 {
                     () => world.Moderation.RemoveCommentAsync(ModeratorId, momentReport.Id, world.Request(momentReport)),
                     () => world.Moderation.RemoveCommentAsync(ModeratorId, householdReport.Id, world.Request(householdReport)),
                     () => world.Moderation.HideMomentAsync(ModeratorId, commentReport.Id, world.Request(commentReport)),
                     () => world.Moderation.HideMomentAsync(ModeratorId, householdReport.Id, world.Request(householdReport)),
                     () => world.Moderation.UnhideMomentAsync(ModeratorId, commentReport.Id, world.Request(commentReport))
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(attempt);
            Assert.Equal("moderation_action_not_applicable", refused.Code);
        }

        Assert.Empty(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
        Assert.All(await world.Db.CommunityReports.AsNoTracking().ToListAsync(), item => Assert.Equal(CommunityReportStatus.Open, item.Status));
    }

    // ---- Hide / Unhide Moment -----------------------------------------------------

    [Fact]
    public async Task HidingAMomentTakesItAndItsActivityOffCommunityAndUnhidingBringsThemBack()
    {
        using var world = await ModerationWorld.CreateAsync();
        var aliceBefore = await world.ActivityTypesAsync(AliceId);
        var carolBefore = await world.ActivityTypesAsync(CarolId);
        Assert.Contains("MomentLiked", aliceBefore);
        Assert.Contains("MomentCommented", aliceBefore);
        Assert.Contains("MomentCommentMentioned", carolBefore);
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();

        var result = await world.Moderation.HideMomentAsync(ModeratorId, report.Id, world.Request(report));

        Assert.Equal(new AdminCommunityModerationResultResponse(report.Id, "Applied", 1), result);
        var moment = await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId);
        Assert.Equal(ModeratorId, moment.ModeratedByUserId);
        Assert.Equal(MemoryVisibility.Public, moment.Visibility);
        Assert.Null(moment.ArchivedAt);
        Assert.Null(moment.DeletedAt);
        await Assert.ThrowsAsync<ApiException>(() => world.Harness.PublicProfiles.GetMomentAsync(world.MomentId));
        Assert.Empty((await world.Harness.Feed.GetFeedAsync(CarolId, null, null)).Items);

        // No Activity is left linking to a Moment nobody can open — and the
        // unread badge is counted the same way.
        Assert.Equal(aliceBefore.Where(type => type == "NewFollower"), await world.ActivityTypesAsync(AliceId));
        Assert.Empty(await world.ActivityTypesAsync(CarolId));
        Assert.Equal(0, (await world.Harness.Notifications.GetUnreadSummaryAsync(CarolId)).UnreadCount);

        // Only the Moment's own report is decided.
        Assert.Equal(CommunityReportResolution.MomentHidden,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id)).Resolution);
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Comment), item => Assert.Equal(CommunityReportStatus.Open, item.Status));
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Household), item => Assert.Equal(CommunityReportStatus.Open, item.Status));

        await world.Moderation.UnhideMomentAsync(ModeratorId, report.Id, world.Request(report, "Hidden in error."));

        var unhidden = await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId);
        Assert.Null(unhidden.ModeratedAt);
        Assert.Null(unhidden.ModeratedByUserId);
        Assert.Equal(world.MomentId, (await world.Harness.PublicProfiles.GetMomentAsync(world.MomentId)).Id);
        Assert.Equal(aliceBefore, await world.ActivityTypesAsync(AliceId));
        Assert.Equal(carolBefore, await world.ActivityTypesAsync(CarolId));

        // History is not rewritten by the reversal.
        var decided = await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id);
        Assert.Equal(CommunityReportStatus.Resolved, decided.Status);
        Assert.Equal(CommunityReportResolution.MomentHidden, decided.Resolution);
        Assert.Equal(Note, decided.ReviewNote);

        var audits = await world.Db.AuditLogs.AsNoTracking().OrderBy(item => item.CreatedAt).ToListAsync();
        Assert.Equal([CommunityModerationAudit.MomentHidden, CommunityModerationAudit.MomentUnhidden], audits.Select(item => item.Action));
        Assert.All(audits, item => Assert.Equal(world.MomentId, item.EntityId));
        Assert.Contains("Hidden in error.", audits[1].NewValue);
    }

    [Fact]
    public async Task UnhidingRestoresOnlyWhatTheOwnersOwnSettingsAllow()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();
        await world.Moderation.HideMomentAsync(ModeratorId, report.Id, world.Request(report));

        // While hidden, the owner makes it private.
        var moment = await world.Db.PetMemories.SingleAsync(item => item.Id == world.MomentId);
        moment.Visibility = MemoryVisibility.Private;
        await world.Db.SaveChangesAsync();
        world.Db.ChangeTracker.Clear();

        await world.Moderation.UnhideMomentAsync(ModeratorId, report.Id, world.Request(report));

        var after = await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId);
        Assert.Null(after.ModeratedAt);
        Assert.Equal(MemoryVisibility.Private, after.Visibility);
        await Assert.ThrowsAsync<ApiException>(() => world.Harness.PublicProfiles.GetMomentAsync(world.MomentId));

        var again = await Assert.ThrowsAsync<ApiException>(() =>
            world.Moderation.UnhideMomentAsync(ModeratorId, report.Id, world.Request(report)));
        Assert.Equal("moment_not_hidden", again.Code);
    }

    [Fact]
    public async Task HidingAnAlreadyHiddenMomentDecidesTheReportWithoutChangingIt()
    {
        using var world = await ModerationWorld.CreateAsync();
        var first = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();
        await world.Moderation.HideMomentAsync(ModeratorId, first.Id, world.Request(first));
        var hiddenAt = (await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId)).ModeratedAt;

        // A report that arrived around the decision.
        var late = await world.AddReportDirectlyAsync(CommunityReportTargetType.Moment, DaveId, world.MomentId);
        var result = await world.Moderation.HideMomentAsync(SecondModeratorId, late.Id, world.Request(late));

        Assert.Equal("AlreadyInEffect", result.Outcome);
        var moment = await world.Db.PetMemories.AsNoTracking().SingleAsync(item => item.Id == world.MomentId);
        Assert.Equal(hiddenAt, moment.ModeratedAt);
        Assert.Equal(ModeratorId, moment.ModeratedByUserId);
        Assert.Equal(CommunityReportResolution.MomentHidden,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == late.Id)).Resolution);
    }

    // ---- Restrict / Lift household ------------------------------------------------

    [Fact]
    public async Task RestrictingFromAHouseholdReportPausesCommunityOnlyAndDecidesOnlyThatTarget()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();
        Assert.Equal(AliceId, report.ReportedUserId);

        var result = await world.Moderation.RestrictHouseholdAsync(ModeratorId, report.Id, world.Request(report));

        Assert.Equal("Applied", result.Outcome);
        var alice = await world.Db.Users.AsNoTracking().Include(item => item.SocialProfile).SingleAsync(item => item.Id == AliceId);
        Assert.Equal(UserStatus.Active, alice.Status);
        Assert.Null(alice.DeletedAt);
        Assert.False(alice.SocialProfile!.IsSocialEnabled);
        Assert.True(alice.SocialProfile.CommunityEnabledBeforeRestriction);
        Assert.Equal(ModeratorId, alice.SocialProfile.CommunityRestrictedByUserId);
        Assert.Equal(CommunityReportResolution.HouseholdRestricted,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id)).Resolution);

        // Reports about Alice's Moment are separate evidence and stay open.
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Moment), item => Assert.Equal(CommunityReportStatus.Open, item.Status));

        // Community is gone; the Share and Safety Profiles are not.
        await Assert.ThrowsAsync<ApiException>(() => world.Harness.PublicProfiles.GetMomentAsync(world.MomentId));
        Assert.Equal("Mochi", (await world.Harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi")).Name);
        Assert.NotNull(await world.Harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi"));

        var audit = Assert.Single(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
        Assert.Equal(CommunityModerationAudit.HouseholdRestricted, audit.Action);
        Assert.Equal(CommunityModerationAudit.HouseholdEntity, audit.Entity);
        Assert.Contains("\"restricted\":false", audit.OldValue);
        Assert.Contains("\"ownerChoiceKept\":true", audit.NewValue);
    }

    [Fact]
    public async Task RestrictingFromACommentReportRestrictsItsAuthorAndDecidesOnlyThatComment()
    {
        using var world = await ModerationWorld.CreateAsync();
        var commentReport = (await world.ReportsAboutAsync(CommunityReportTargetType.Comment)).First();
        var bobHousehold = await world.AddReportDirectlyAsync(CommunityReportTargetType.Household, CarolId, reportedUserId: BobId);

        var result = await world.Moderation.RestrictHouseholdAsync(ModeratorId, commentReport.Id, world.Request(commentReport));

        Assert.Equal("Applied", result.Outcome);
        Assert.Equal(2, result.ReportsResolved);
        Assert.NotNull((await world.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId)).CommunityRestrictedAt);
        Assert.Null((await world.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == AliceId)).CommunityRestrictedAt);
        Assert.All(await world.ReportsAboutAsync(CommunityReportTargetType.Comment),
            item => Assert.Equal(CommunityReportResolution.HouseholdRestricted, item.Resolution));

        // The Comment is not removed — the restriction hides it, and lifting
        // would bring it back — and Bob's own household report is still open.
        Assert.Equal(ModerationWorld.CommentBody, (await world.Db.MomentComments.AsNoTracking().SingleAsync(item => item.Id == world.CommentId)).Body);
        Assert.Equal(0, await world.VisibleCommentCountAsync());
        Assert.Equal(CommunityReportStatus.Open,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == bobHousehold.Id)).Status);

        // Deciding that one too converges on the restriction already in place.
        var second = await world.Moderation.RestrictHouseholdAsync(SecondModeratorId, bobHousehold.Id, world.Request(bobHousehold));
        Assert.Equal("AlreadyInEffect", second.Outcome);
        var bob = await world.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == BobId);
        Assert.Equal(ModeratorId, bob.CommunityRestrictedByUserId);
        Assert.True(bob.CommunityEnabledBeforeRestriction);
        Assert.Equal(CommunityReportResolution.HouseholdRestricted,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == bobHousehold.Id)).Resolution);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task LiftingRestoresExactlyTheOwnersChoiceAndKeepsTheDecision(bool ownerHadCommunityOn)
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();
        if (!ownerHadCommunityOn)
        {
            await world.Harness.SetOwnerSocialAsync(AliceId, false);
        }

        await world.Moderation.RestrictHouseholdAsync(ModeratorId, report.Id, world.Request(report));
        var result = await world.Moderation.LiftRestrictionAsync(ModeratorId, report.Id, world.Request(report, "Appeal by e-mail accepted."));

        Assert.Equal(new AdminCommunityModerationResultResponse(report.Id, "Applied", 0), result);
        var profile = await world.Db.OwnerSocialProfiles.AsNoTracking().SingleAsync(item => item.UserId == AliceId);
        Assert.Equal(ownerHadCommunityOn, profile.IsSocialEnabled);
        Assert.Null(profile.CommunityRestrictedAt);
        Assert.Null(profile.CommunityRestrictedByUserId);
        Assert.Null(profile.CommunityEnabledBeforeRestriction);
        Assert.Equal(CommunityReportResolution.HouseholdRestricted,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id)).Resolution);

        var lift = (await world.Db.AuditLogs.AsNoTracking().ToListAsync())
            .Single(item => item.Action == CommunityModerationAudit.HouseholdRestrictionLifted);
        Assert.Contains("Appeal by e-mail accepted.", lift.NewValue);
        Assert.Contains($"\"communityEnabled\":{ownerHadCommunityOn.ToString().ToLowerInvariant()}", lift.NewValue);

        var again = await Assert.ThrowsAsync<ApiException>(() =>
            world.Moderation.LiftRestrictionAsync(ModeratorId, report.Id, world.Request(report)));
        Assert.Equal("household_not_restricted", again.Code);
    }

    // ---- notes, versions and who may decide -------------------------------------

    [Theory]
    [InlineData(null, "moderation_note_required")]
    [InlineData("", "moderation_note_required")]
    [InlineData("   ​ ", "moderation_note_required")]
    public async Task EveryActionNeedsAnInternalNote(string? note, string code)
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();
        var request = new AdminCommunityModerationRequest(note, Convert.ToBase64String(report.RowVersion));

        foreach (var action in world.AllActions(report.Id, request))
        {
            var refused = await Assert.ThrowsAsync<ApiException>(action);
            Assert.Equal(StatusCodes.Status422UnprocessableEntity, refused.StatusCode);
            Assert.Equal(code, refused.Code);
        }

        Assert.Empty(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task NotesAreBoundedPlainTextAndDecisionsNeedTheReportVersion()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();

        var tooLong = await Assert.ThrowsAsync<ApiException>(() => world.Moderation.DismissAsync(
            ModeratorId, report.Id, new AdminCommunityModerationRequest(new string('a', 1001), "")));
        Assert.Equal("moderation_note_too_long", tooLong.Code);

        foreach (var rowVersion in new[] { null, "not base64!" })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(() => world.Moderation.DismissAsync(
                ModeratorId, report.Id, new AdminCommunityModerationRequest(Note, rowVersion)));
            Assert.Equal("validation_failed", refused.Code);
            Assert.True(refused.Details!.ContainsKey("rowVersion"));
        }

        // Markup is stored as the moderator's words, never interpreted; control
        // and bidi characters are removed.
        await world.Moderation.DismissAsync(ModeratorId, report.Id,
            new AdminCommunityModerationRequest("<script>alert(1)</script>‮ ok", ""));
        Assert.Equal("<script>alert(1)</script> ok",
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == report.Id)).ReviewNote);
    }

    [Fact]
    public async Task AModeratorNeverDecidesAReportTheirOwnHouseholdIsPartOf()
    {
        using var world = await ModerationWorld.CreateAsync();

        // Carol reported Alice's household; Alice is the subject of it.
        var household = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();
        foreach (var moderator in new[] { CarolId, AliceId })
        {
            foreach (var action in world.AllActions(household.Id, world.Request(household), moderator))
            {
                var refused = await Assert.ThrowsAsync<ApiException>(action);
                Assert.Equal(StatusCodes.Status403Forbidden, refused.StatusCode);
                Assert.Equal("moderation_conflict_of_interest", refused.Code);
            }
        }

        Assert.Equal(CommunityReportStatus.Open,
            (await world.Db.CommunityReports.AsNoTracking().SingleAsync(item => item.Id == household.Id)).Status);
        Assert.Empty(await world.Db.AuditLogs.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task AnUnknownReportIsNotFoundForEveryAction()
    {
        using var world = await ModerationWorld.CreateAsync();
        foreach (var action in world.AllActions(Guid.NewGuid(), new AdminCommunityModerationRequest(Note, "")))
        {
            var refused = await Assert.ThrowsAsync<ApiException>(action);
            Assert.Equal(StatusCodes.Status404NotFound, refused.StatusCode);
            Assert.Equal("community_report_not_found", refused.Code);
        }
    }

    [Fact]
    public async Task ModerationNeverNotifiesAnybody()
    {
        using var world = await ModerationWorld.CreateAsync();
        var before = await world.Db.OwnerNotifications.AsNoTracking().CountAsync();
        var moment = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();
        var household = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();

        await world.Moderation.HideMomentAsync(ModeratorId, moment.Id, world.Request(moment));
        await world.Moderation.UnhideMomentAsync(ModeratorId, moment.Id, world.Request(moment));
        await world.Moderation.RestrictHouseholdAsync(ModeratorId, household.Id, world.Request(household));
        await world.Moderation.LiftRestrictionAsync(ModeratorId, household.Id, world.Request(household));

        Assert.Equal(before, await world.Db.OwnerNotifications.AsNoTracking().CountAsync());
        Assert.Empty(await world.Db.EmailOutbox.AsNoTracking().ToListAsync());
    }
}

/// <summary>
/// The standing moderation scene, on top of <see cref="SocialSurfaceHarness"/>:
/// Alice's public Moment of Mochi, liked by Bob, with Bob's Comment naming
/// Carol. Carol and Alice report the Comment, Bob reports the Moment, and Carol
/// reports Alice's household. Two moderators without Community profiles.
/// </summary>
internal sealed class ModerationWorld : IDisposable
{
    public const string CommentBody = "Rude words for @CarolPets";
    private const string Note = "Checked against the Community guidelines.";

    private ModerationWorld(SocialSurfaceHarness harness, Guid momentId, Guid commentId)
    {
        Harness = harness;
        MomentId = momentId;
        CommentId = commentId;
        var r2 = Options.Create(new CloudflareR2Options());
        Moderation = new AdminCommunityModerationService(
            harness.Db,
            harness.Notifications,
            new AuditLogService(harness.Db, new HttpContextAccessor()));
        Queries = new AdminCommunityReportQueryService(harness.Db, r2);
    }

    public SocialSurfaceHarness Harness { get; }
    public Data.MyPetLinkDbContext Db => Harness.Db;
    public Guid MomentId { get; }
    public Guid CommentId { get; }
    public AdminCommunityModerationService Moderation { get; }
    public AdminCommunityReportQueryService Queries { get; }

    public static async Task<ModerationWorld> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        AddOwner(harness.Db, AdminCommunityModerationTests.ModeratorId, "mod1@example.com", "Moderator One", "ModOne", "Mod One", false, false);
        AddOwner(harness.Db, AdminCommunityModerationTests.SecondModeratorId, "mod2@example.com", "Moderator Two", "ModTwo", "Mod Two", false, false);
        await harness.Db.SaveChangesAsync();

        var momentId = await harness.AddMomentAsync(AliceId, MochiId, "Beach day", 10);
        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == momentId);
        moment.Caption = "Sand everywhere";
        moment.ShowOnPublicProfile = true;
        moment.ShowInLifeTimeline = true;
        await harness.Db.SaveChangesAsync();

        await harness.FollowAsync(BobId, "tanfamily");
        await harness.Likes.LikeAsync(BobId, momentId);
        var comment = await harness.Comments.CreateAsync(BobId, momentId, new CreateMomentCommentRequest(CommentBody));

        await harness.Reports.SubmitAsync(CarolId, new CreateCommunityReportRequest("comment", comment.Comment.Id.ToString(), "HarassmentOrBullying", "Aimed at me"));
        await harness.Reports.SubmitAsync(AliceId, new CreateCommunityReportRequest("comment", comment.Comment.Id.ToString(), "HarassmentOrBullying", null));
        await harness.Reports.SubmitAsync(BobId, new CreateCommunityReportRequest("moment", momentId.ToString(), "SpamOrScam", null));
        await harness.Reports.SubmitAsync(CarolId, new CreateCommunityReportRequest("household", "tanfamily", "Impersonation", "Pretends to be a shelter"));
        harness.Db.ChangeTracker.Clear();

        return new ModerationWorld(harness, momentId, comment.Comment.Id);
    }

    public AdminCommunityModerationRequest Request(CommunityReport report, string note = Note) =>
        new(note, Convert.ToBase64String(report.RowVersion));

    public Task<CommunityReport[]> ReportsAboutAsync(CommunityReportTargetType type) =>
        Db.CommunityReports.AsNoTracking()
            .Where(item => item.TargetType == type)
            .OrderBy(item => item.CreatedAt)
            .ToArrayAsync();

    /// <summary>
    /// A report written straight to the table — one that arrived around a
    /// decision, which submission itself would now refuse.
    /// </summary>
    public async Task<CommunityReport> AddReportDirectlyAsync(
        CommunityReportTargetType type,
        Guid reporterId,
        Guid? momentId = null,
        Guid? reportedUserId = null)
    {
        var report = new CommunityReport
        {
            ReporterUserId = reporterId,
            TargetType = type,
            MomentId = momentId,
            ReportedUserId = reportedUserId ?? AliceId,
            Reason = CommunityReportReason.SpamOrScam,
            SnapshotHandle = "Evidence",
            SnapshotDisplayName = "Evidence",
            Status = CommunityReportStatus.Open,
            CreatedAt = DateTimeOffset.UtcNow
        };
        Db.CommunityReports.Add(report);
        await Db.SaveChangesAsync();
        Db.ChangeTracker.Clear();
        return report;
    }

    public async Task<string[]> ActivityTypesAsync(Guid recipientId) =>
        (await Harness.Notifications.GetAsync(recipientId, null, 50)).Items
            .Select(item => item.Type)
            .OrderBy(type => type, StringComparer.Ordinal)
            .ToArray();

    public Task<int> VisibleCommentCountAsync() =>
        Db.MomentComments.VisibleComments(Db, null).CountAsync(item => item.MomentId == MomentId);

    public IEnumerable<Func<Task>> AllActions(
        Guid reportId,
        AdminCommunityModerationRequest request,
        Guid? moderatorId = null)
    {
        var moderator = moderatorId ?? AdminCommunityModerationTests.ModeratorId;
        yield return () => Moderation.DismissAsync(moderator, reportId, request);
        yield return () => Moderation.RemoveCommentAsync(moderator, reportId, request);
        yield return () => Moderation.HideMomentAsync(moderator, reportId, request);
        yield return () => Moderation.UnhideMomentAsync(moderator, reportId, request);
        yield return () => Moderation.RestrictHouseholdAsync(moderator, reportId, request);
        yield return () => Moderation.LiftRestrictionAsync(moderator, reportId, request);
    }

    public void Dispose() => Harness.Dispose();
}
