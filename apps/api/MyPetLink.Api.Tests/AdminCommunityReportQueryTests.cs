using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using static MyPetLink.Api.Tests.SocialSurfaceHarness;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The Admin report queue and report detail: paging, filters and ordering, the
/// open-report count per target, the right households on each side, and the
/// line between evidence (as reported) and current state (as it is now).
/// </summary>
public sealed class AdminCommunityReportQueryTests
{
    private static readonly Guid ModeratorId = AdminCommunityModerationTests.ModeratorId;

    // ---- queue ---------------------------------------------------------------

    [Fact]
    public async Task TheQueueListsOpenReportsFirstThenNewestAndPagesOnTheServer()
    {
        using var world = await ModerationWorld.CreateAsync();
        var reports = await world.Db.CommunityReports.OrderBy(item => item.CreatedAt).ToListAsync();
        var start = DateTimeOffset.UtcNow.AddDays(-1);
        for (var index = 0; index < reports.Count; index++)
        {
            reports[index].CreatedAt = start.AddMinutes(index);
        }

        // The newest report is decided, so it sorts after every open one.
        var newest = reports[^1];
        newest.Status = CommunityReportStatus.Resolved;
        newest.Resolution = CommunityReportResolution.Dismissed;
        newest.ReviewedAt = DateTimeOffset.UtcNow;
        newest.ReviewedByUserId = ModeratorId;
        await world.Db.SaveChangesAsync();
        world.Db.ChangeTracker.Clear();

        var (page1, total) = await world.Queries.ListAsync(ModeratorId, new AdminCommunityReportQuery { Page = 1, PageSize = 2 });
        var (page2, _) = await world.Queries.ListAsync(ModeratorId, new AdminCommunityReportQuery { Page = 2, PageSize = 2 });

        Assert.Equal(4, total);
        var ids = page1.Concat(page2).Select(item => item.Id).ToArray();
        Assert.Equal(
            reports.Take(3).Reverse().Select(item => item.Id).Append(newest.Id),
            ids);
        Assert.Equal(["Open", "Open", "Open", "Resolved"], page1.Concat(page2).Select(item => item.Status));
        Assert.Equal("Dismissed", page2.Last().Resolution);
        Assert.NotNull(page2.Last().ReviewedAt);
    }

    [Fact]
    public async Task TheQueueFiltersByStatusTargetReasonHouseholdAndDate()
    {
        using var world = await ModerationWorld.CreateAsync();

        async Task<string[]> Types(AdminCommunityReportQuery query) =>
            (await world.Queries.ListAsync(ModeratorId, query)).Items.Select(item => $"{item.TargetType}:{item.Reason}").OrderBy(item => item).ToArray();

        Assert.Equal(["Comment:HarassmentOrBullying", "Comment:HarassmentOrBullying"],
            await Types(new AdminCommunityReportQuery { TargetType = "comment" }));
        Assert.Equal(["Moment:SpamOrScam"], await Types(new AdminCommunityReportQuery { Reason = "SpamOrScam" }));
        Assert.Equal(["Household:Impersonation", "Moment:SpamOrScam"],
            await Types(new AdminCommunityReportQuery { ReportedOwnerId = AliceId }));
        Assert.Empty(await Types(new AdminCommunityReportQuery { Status = "Resolved" }));
        Assert.Equal(4, (await Types(new AdminCommunityReportQuery { Status = "Open" })).Length);
        Assert.Empty(await Types(new AdminCommunityReportQuery { CreatedFrom = DateTimeOffset.UtcNow.AddHours(1) }));
        Assert.Equal(4, (await Types(new AdminCommunityReportQuery { CreatedTo = DateTimeOffset.UtcNow.AddHours(1) })).Length);

        foreach (var invalid in new[]
                 {
                     new AdminCommunityReportQuery { Status = "Unknown" },
                     new AdminCommunityReportQuery { Status = "Escalated" },
                     new AdminCommunityReportQuery { TargetType = "Pet" },
                     new AdminCommunityReportQuery { Reason = "Unknown" },
                     new AdminCommunityReportQuery { Reason = "1" },
                     new AdminCommunityReportQuery { CreatedFrom = DateTimeOffset.UtcNow, CreatedTo = DateTimeOffset.UtcNow.AddDays(-1) }
                 })
        {
            var refused = await Assert.ThrowsAsync<ApiException>(() => world.Queries.ListAsync(ModeratorId, invalid));
            Assert.Equal("validation_failed", refused.Code);
        }
    }

    [Fact]
    public async Task EachRowCountsTheOpenReportsOnItsOwnTargetOnly()
    {
        using var world = await ModerationWorld.CreateAsync();

        // A third, already-decided report on the Comment is history, not a count.
        var extra = await world.AddReportDirectlyAsync(CommunityReportTargetType.Moment, DaveId, world.MomentId);
        var decided = await world.Db.CommunityReports.SingleAsync(item => item.Id == extra.Id);
        decided.Status = CommunityReportStatus.Resolved;
        decided.Resolution = CommunityReportResolution.Dismissed;
        decided.ReviewedAt = DateTimeOffset.UtcNow;
        decided.ReviewedByUserId = ModeratorId;
        await world.Db.SaveChangesAsync();
        world.Db.ChangeTracker.Clear();

        var (items, _) = await world.Queries.ListAsync(ModeratorId, new AdminCommunityReportQuery { PageSize = 100 });

        Assert.All(items.Where(item => item.TargetType == "Comment"), item => Assert.Equal(2, item.OpenReportsOnTarget));
        Assert.All(items.Where(item => item.TargetType == "Moment"), item => Assert.Equal(1, item.OpenReportsOnTarget));

        // Alice is behind both the Moment and the household report, and they
        // are still counted as two different targets.
        Assert.Equal(1, items.Single(item => item.TargetType == "Household").OpenReportsOnTarget);
    }

    [Fact]
    public async Task EachRowNamesTheReporterAndTheHouseholdResponsible()
    {
        using var world = await ModerationWorld.CreateAsync();
        var (items, _) = await world.Queries.ListAsync(ModeratorId, new AdminCommunityReportQuery { PageSize = 100 });

        var comment = items.Where(item => item.TargetType == "Comment").ToArray();
        Assert.All(comment, item => Assert.Equal(BobId, item.ReportedHousehold.OwnerId));
        Assert.Equal(new[] { "CarolPets", "TanFamily" }, comment.Select(item => item.Reporter.Handle).OrderBy(item => item));
        var moment = items.Single(item => item.TargetType == "Moment");
        Assert.Equal(("TanFamily", "LimFamily"), (moment.ReportedHousehold.Handle, moment.Reporter.Handle));
        var household = items.Single(item => item.TargetType == "Household");
        Assert.Equal((AliceId, CarolId), (household.ReportedHousehold.OwnerId, household.Reporter.OwnerId));
        Assert.Equal("TanFamily", household.SnapshotHandle);
        Assert.True(household.ReportedHousehold.CommunityEnabled);
        Assert.True(household.ReportedHousehold.AccountActive);
    }

    // ---- detail ----------------------------------------------------------------

    [Fact]
    public async Task ACommentReportKeepsItsEvidenceWhileShowingTheCommentAsItIsNow()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Comment)).First();

        // After the report: Bob renames his household and deletes the Comment.
        var bob = await world.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == BobId);
        bob.DisplayName = "Totally New Name";
        await world.Db.SaveChangesAsync();
        world.Db.ChangeTracker.Clear();
        await world.Harness.Comments.DeleteAsync(BobId, world.MomentId, world.CommentId);

        var detail = await world.Queries.GetAsync(ModeratorId, report.Id);

        Assert.Equal("Comment", detail.TargetType);
        Assert.Equal("HarassmentOrBullying", detail.Reason);
        Assert.Equal("Aimed at me", detail.Details);
        Assert.Equal("Open", detail.Status);
        Assert.Equal(("LimFamily", "The Lim Family", ModerationWorld.CommentBody),
            (detail.Evidence.Handle, detail.Evidence.DisplayName, detail.Evidence.Text));
        Assert.Null(detail.Evidence.Title);

        var current = detail.CurrentComment!;
        Assert.True(current.Removed);
        Assert.Equal("", current.Body);
        Assert.Equal("Author", current.RemovedBy);
        Assert.False(current.PubliclyVisible);
        Assert.Equal("Totally New Name", current.Author.DisplayName);
        Assert.Equal("Totally New Name", detail.ReportedHousehold.DisplayName);

        // The Moment the Comment is on, for context.
        Assert.Equal(world.MomentId, detail.CurrentMoment!.Id);
        Assert.Equal(AliceId, detail.CurrentMoment.Author.OwnerId);
        Assert.Equal(CarolId, detail.Reporter.OwnerId);
        Assert.Equal(2, detail.OpenReportsOnTarget);
        Assert.Contains("Dismiss", detail.AvailableActions);
        Assert.Contains("RemoveComment", detail.AvailableActions);
        Assert.DoesNotContain("HideMoment", detail.AvailableActions);
    }

    [Fact]
    public async Task AMomentReportShowsTheMomentHiddenOrNotWithItsMediaAndNeverStorageDetails()
    {
        using var world = await ModerationWorld.CreateAsync();
        var mediaId = await world.Harness.AddMomentMediaAsync(world.MomentId, MochiId, MediaFileType.Image, "moments/secret-object-key.jpg");
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Moment)).Single();

        var moment = await world.Db.PetMemories.SingleAsync(item => item.Id == world.MomentId);
        moment.Title = "Edited later";
        await world.Db.SaveChangesAsync();
        world.Db.ChangeTracker.Clear();
        await world.Moderation.HideMomentAsync(ModeratorId, report.Id, world.Request(report));

        var detail = await world.Queries.GetAsync(ModeratorId, report.Id);

        Assert.Equal(("Beach day", "Sand everywhere"), (detail.Evidence.Title, detail.Evidence.Text));
        var current = detail.CurrentMoment!;
        Assert.Equal("Edited later", current.Title);
        Assert.True(current.Hidden);
        Assert.NotNull(current.HiddenAt);
        Assert.False(current.PubliclyVisible);
        Assert.Equal(mediaId, Assert.Single(current.Media).MediaFileId);
        Assert.Equal("Resolved", detail.Status);
        Assert.Equal("MomentHidden", detail.Resolution);
        Assert.Equal("Moderator One", detail.ReviewedByName);
        Assert.Contains("UnhideMoment", detail.AvailableActions);
        Assert.DoesNotContain("Dismiss", detail.AvailableActions);

        var json = System.Text.Json.JsonSerializer.Serialize(detail);
        Assert.DoesNotContain("objectKey", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("bucket", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("storage", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@example.com", json);
        Assert.DoesNotContain("+60123456789", json);
    }

    [Fact]
    public async Task AHouseholdReportShowsTheHouseholdNowBesideTheEvidence()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();
        await world.Moderation.RestrictHouseholdAsync(ModeratorId, report.Id, world.Request(report));

        var detail = await world.Queries.GetAsync(ModeratorId, report.Id);

        Assert.Equal(("TanFamily", "The Tan Family"), (detail.Evidence.Handle, detail.Evidence.DisplayName));
        Assert.True(detail.ReportedHousehold.CommunityRestricted);
        Assert.False(detail.ReportedHousehold.CommunityEnabled);
        Assert.True(detail.ReportedHousehold.AccountActive);
        Assert.False(detail.HouseholdPubliclyVisible);
        Assert.Null(detail.CurrentComment);
        Assert.Null(detail.CurrentMoment);
        Assert.Equal(["LiftRestriction"], detail.AvailableActions);
    }

    [Fact]
    public async Task ModeratorsStillSeeContentThatABlockHidesFromCommunity()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Comment)).First();
        await world.Harness.Graph.BlockAsync(CarolId, "limfamily", null);

        var detail = await world.Queries.GetAsync(ModeratorId, report.Id);

        Assert.Equal(ModerationWorld.CommentBody, detail.CurrentComment!.Body);
        Assert.True(detail.CurrentComment.PubliclyVisible);
    }

    [Fact]
    public async Task PriorReportsCoverTheSameTargetAndTheSameHouseholdBoundedAndSeparately()
    {
        using var world = await ModerationWorld.CreateAsync();

        // Alice: one Moment report and one household report already. Add a
        // second Moment and enough reports on it to pass the bound.
        var otherMoment = await world.Harness.AddMomentAsync(AliceId, CocoId, "Nap time", 20);
        for (var index = 0; index < AdminCommunityReportQueryService.HistoryLimit + 3; index++)
        {
            await world.AddReportDirectlyAsync(CommunityReportTargetType.Moment, index % 2 == 0 ? BobId : CarolId, otherMoment);
        }

        var momentReport = (await world.Db.CommunityReports.AsNoTracking()
            .SingleAsync(item => item.MomentId == world.MomentId));
        var detail = await world.Queries.GetAsync(ModeratorId, momentReport.Id);

        Assert.Empty(detail.TargetHistory);
        Assert.Equal(0, detail.TargetHistoryTotal);
        Assert.Equal(AdminCommunityReportQueryService.HistoryLimit, detail.HouseholdHistory.Count);
        Assert.Equal(AdminCommunityReportQueryService.HistoryLimit + 4, detail.HouseholdHistoryTotal);
        Assert.DoesNotContain(detail.HouseholdHistory, item => item.Id == momentReport.Id);

        var onOther = (await world.Db.CommunityReports.AsNoTracking().FirstAsync(item => item.MomentId == otherMoment));
        var otherDetail = await world.Queries.GetAsync(ModerationWorldIds.Moderator, onOther.Id);
        Assert.Equal(AdminCommunityReportQueryService.HistoryLimit, otherDetail.TargetHistory.Count);
        Assert.Equal(AdminCommunityReportQueryService.HistoryLimit + 2, otherDetail.TargetHistoryTotal);
        Assert.All(otherDetail.TargetHistory, item => Assert.Equal("Moment", item.TargetType));
        Assert.Equal(AdminCommunityReportQueryService.HistoryLimit + 4, otherDetail.HouseholdHistoryTotal);

        // Bob's Comment report is about Bob, so never in Alice's history.
        Assert.DoesNotContain(detail.HouseholdHistory, item => item.TargetType == "Comment");
    }

    [Fact]
    public async Task AReportTheModeratorMadeOffersNoActions()
    {
        using var world = await ModerationWorld.CreateAsync();
        var report = (await world.ReportsAboutAsync(CommunityReportTargetType.Household)).Single();

        var asReporter = await world.Queries.GetAsync(CarolId, report.Id);
        Assert.True(asReporter.InvolvesYou);
        Assert.Empty(asReporter.AvailableActions);
        var asModerator = await world.Queries.GetAsync(ModeratorId, report.Id);
        Assert.False(asModerator.InvolvesYou);
        Assert.NotEmpty(asModerator.AvailableActions);
    }

    [Fact]
    public async Task AModeratorNeverSeesReportsAboutTheirOwnHousehold()
    {
        // Alice's household is reported (the Moment and the profile). As an
        // operator she must not learn who reported her or what they said.
        using var world = await ModerationWorld.CreateAsync();
        var aboutAlice = await world.Db.CommunityReports.AsNoTracking()
            .Where(item => item.ReportedUserId == AliceId)
            .Select(item => item.Id)
            .ToListAsync();
        Assert.Equal(2, aboutAlice.Count);

        var (items, total) = await world.Queries.ListAsync(AliceId, new AdminCommunityReportQuery { PageSize = 100 });
        Assert.Equal(2, total);
        Assert.All(items, item => Assert.NotEqual(AliceId, item.ReportedHousehold.OwnerId));
        Assert.Empty((await world.Queries.ListAsync(AliceId, new AdminCommunityReportQuery { ReportedOwnerId = AliceId })).Items);

        foreach (var id in aboutAlice)
        {
            var refused = await Assert.ThrowsAsync<ApiException>(() => world.Queries.GetAsync(AliceId, id));
            Assert.Equal("community_report_not_found", refused.Code);
        }

        // Alice reported Bob's Comment herself; that one she can see.
        var (all, _) = await world.Queries.ListAsync(ModeratorId, new AdminCommunityReportQuery { PageSize = 100 });
        Assert.Equal(4, all.Count);
    }

    [Fact]
    public async Task AnUnknownReportIsNotFound()
    {
        using var world = await ModerationWorld.CreateAsync();
        var refused = await Assert.ThrowsAsync<ApiException>(() => world.Queries.GetAsync(ModeratorId, Guid.NewGuid()));
        Assert.Equal("community_report_not_found", refused.Code);
    }

    private static class ModerationWorldIds
    {
        public static readonly Guid Moderator = AdminCommunityModerationTests.ModeratorId;
    }
}
