using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Community moderation schema on SQL Server: every check constraint, the one
/// open report per reporter per target, RowVersion on a report, Restrict keys
/// that never cascade history away, and the hidden-Moment clauses as SQL
/// Server actually runs them.
/// </summary>
public sealed class CommunityModerationRelationalTests
{
    private static readonly Guid Author = Guid.Parse("d9111111-1111-1111-1111-111111111111");
    private static readonly Guid Reporter = Guid.Parse("d9211111-1111-1111-1111-111111111111");
    private static readonly Guid OtherReporter = Guid.Parse("d9311111-1111-1111-1111-111111111111");
    private static readonly Guid Moderator = Guid.Parse("d9411111-1111-1111-1111-111111111111");
    private static readonly Guid Pet = Guid.Parse("d9511111-1111-1111-1111-111111111111");

    [RelationalFact]
    public async Task EachTargetTypeTakesExactlyItsOwnKey()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);

        // Valid: one of each.
        await InsertAsync(scope, Report(CommunityReportTargetType.Comment, commentId: commentId));
        await InsertAsync(scope, Report(CommunityReportTargetType.Moment, momentId: momentId));
        await InsertAsync(scope, Report(CommunityReportTargetType.Household));

        // Invalid: a missing key, a second key, or a key a Household report cannot have.
        foreach (var bad in new[]
        {
            Report(CommunityReportTargetType.Comment),
            Report(CommunityReportTargetType.Comment, commentId: commentId, momentId: momentId),
            Report(CommunityReportTargetType.Moment),
            Report(CommunityReportTargetType.Moment, momentId: momentId, commentId: commentId),
            Report(CommunityReportTargetType.Household, momentId: momentId),
            Report(CommunityReportTargetType.Household, commentId: commentId),
        })
        {
            bad.ReporterUserId = OtherReporter;
            await AssertRejectedAsync(scope, bad);
        }
    }

    [RelationalFact]
    public async Task ReviewDetailsAndEvidenceFollowTheirRules()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);

        // Resolved without who, when or what; Open with a decision.
        var resolvedHalfway = Report(CommunityReportTargetType.Household);
        resolvedHalfway.Status = CommunityReportStatus.Resolved;
        resolvedHalfway.Resolution = CommunityReportResolution.Dismissed;
        await AssertRejectedAsync(scope, resolvedHalfway);

        var openDecided = Report(CommunityReportTargetType.Household);
        openDecided.Resolution = CommunityReportResolution.Dismissed;
        await AssertRejectedAsync(scope, openDecided);

        // "Other" needs details.
        var otherEmpty = Report(CommunityReportTargetType.Household);
        otherEmpty.Reason = CommunityReportReason.Other;
        await AssertRejectedAsync(scope, otherEmpty);

        // A title belongs to a Moment report, an avatar to a Household report.
        var titledComment = Report(CommunityReportTargetType.Comment, commentId: commentId);
        titledComment.SnapshotTitle = "Beach day";
        await AssertRejectedAsync(scope, titledComment);

        var avatarMoment = Report(CommunityReportTargetType.Moment, momentId: momentId);
        avatarMoment.SnapshotAvatarMediaFileId = Guid.NewGuid();
        await AssertRejectedAsync(scope, avatarMoment);

        // Nobody reports themselves.
        var self = Report(CommunityReportTargetType.Household);
        self.ReporterUserId = Author;
        await AssertRejectedAsync(scope, self);

        // A fully decided report is fine.
        var decided = Report(CommunityReportTargetType.Moment, momentId: momentId);
        Resolve(decided, CommunityReportResolution.MomentHidden);
        await InsertAsync(scope, decided);
    }

    [RelationalFact]
    public async Task OneOpenReportPerReporterPerTargetButHistoryAndOthersAreFine()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);

        foreach (var make in new Func<CommunityReport>[]
        {
            () => Report(CommunityReportTargetType.Comment, commentId: commentId),
            () => Report(CommunityReportTargetType.Moment, momentId: momentId),
            () => Report(CommunityReportTargetType.Household),
        })
        {
            var first = make();
            await InsertAsync(scope, first);

            var again = make();
            again.Reason = CommunityReportReason.HarassmentOrBullying;
            await AssertRejectedAsync(scope, again);

            // Somebody else may report the same target.
            var other = make();
            other.ReporterUserId = OtherReporter;
            await InsertAsync(scope, other);

            // Once the first is resolved, a later genuine report is possible.
            await using (var context = scope.NewContext())
            {
                var stored = await context.CommunityReports.SingleAsync(item => item.Id == first.Id);
                Resolve(stored, CommunityReportResolution.Dismissed);
                await context.SaveChangesAsync();
            }

            await InsertAsync(scope, make());
        }

        await using var verify = scope.NewContext();
        Assert.Equal(9, await verify.CommunityReports.CountAsync());
        Assert.Equal(6, await verify.CommunityReports.CountAsync(item => item.Status == CommunityReportStatus.Open));
    }

    [RelationalFact]
    public async Task TwoModeratorsCannotBothDecideTheSameReport()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        await SeedAsync(scope);
        var report = Report(CommunityReportTargetType.Household);
        await InsertAsync(scope, report);

        await using var first = scope.NewContext();
        await using var second = scope.NewContext();
        var a = await first.CommunityReports.SingleAsync(item => item.Id == report.Id);
        var b = await second.CommunityReports.SingleAsync(item => item.Id == report.Id);

        Resolve(a, CommunityReportResolution.Dismissed);
        await first.SaveChangesAsync();
        Resolve(b, CommunityReportResolution.HouseholdRestricted);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => second.SaveChangesAsync());

        await using var verify = scope.NewContext();
        Assert.Equal(CommunityReportResolution.Dismissed, (await verify.CommunityReports.SingleAsync()).Resolution);
    }

    [RelationalFact]
    public async Task EvidenceAndModerationRecordsAreNeverCascadedAway()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);
        await InsertAsync(scope, Report(CommunityReportTargetType.Comment, commentId: commentId));
        await InsertAsync(scope, Report(CommunityReportTargetType.Moment, momentId: momentId));

        await using (var context = scope.NewContext())
        {
            CommunityModeration.HideMoment(await context.PetMemories.SingleAsync(item => item.Id == momentId), Moderator, DateTimeOffset.UtcNow);
            await context.SaveChangesAsync();
        }

        // The reported Comment, the reported Moment, the reporter and the
        // moderator who hid it: none can be removed from under the record.
        await AssertDeleteRejectedAsync(scope, context => context.MomentComments.Remove(context.MomentComments.Single(item => item.Id == commentId)));
        await AssertDeleteRejectedAsync(scope, context => context.PetMemories.Remove(context.PetMemories.Single(item => item.Id == momentId)));
        await AssertDeleteRejectedAsync(scope, context => context.Users.Remove(context.Users.Single(item => item.Id == Reporter)));
        await AssertDeleteRejectedAsync(scope, context => context.Users.Remove(context.Users.Single(item => item.Id == Moderator)));

        await using var verify = scope.NewContext();
        Assert.Equal(2, await verify.CommunityReports.CountAsync());
    }

    [RelationalFact]
    public async Task ARestrictionIsAllOrNothingAndAlwaysMeansCommunityOff()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, _) = await SeedAsync(scope);

        // Restricted but Community still on; a restriction with no moderator.
        await AssertProfileRejectedAsync(scope, profile =>
        {
            profile.CommunityRestrictedAt = DateTimeOffset.UtcNow;
            profile.CommunityRestrictedByUserId = Moderator;
            profile.CommunityEnabledBeforeRestriction = true;
        });
        await AssertProfileRejectedAsync(scope, profile =>
        {
            profile.IsSocialEnabled = false;
            profile.CommunityRestrictedAt = DateTimeOffset.UtcNow;
            profile.CommunityEnabledBeforeRestriction = true;
        });

        // The real transition satisfies it, and so does lifting.
        await using (var context = scope.NewContext())
        {
            var profile = await context.OwnerSocialProfiles.SingleAsync(item => item.UserId == Author);
            CommunityModeration.RestrictHousehold(profile, Moderator, DateTimeOffset.UtcNow);
            await context.SaveChangesAsync();
            CommunityModeration.LiftRestriction(profile);
            await context.SaveChangesAsync();
            Assert.True(profile.IsSocialEnabled);
        }

        // Hidden by MyPetLink always records who.
        await using (var context = scope.NewContext())
        {
            var moment = await context.PetMemories.SingleAsync(item => item.Id == momentId);
            moment.ModeratedAt = DateTimeOffset.UtcNow;
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }
    }

    [RelationalFact]
    public async Task SqlServerLeavesAHiddenMomentOutOfCommunityAndTheShareProfile()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, _) = await SeedAsync(scope);
        var r2 = Options.Create(new CloudflareR2Options());

        await using (var context = scope.NewContext())
        {
            CommunityModeration.HideMoment(await context.PetMemories.SingleAsync(item => item.Id == momentId), Moderator, DateTimeOffset.UtcNow);
            await context.SaveChangesAsync();
        }

        await using var verify = scope.NewContext();
        Assert.False(await verify.PetMemories.SociallyVisible().AnyAsync());
        Assert.Equal(0, await verify.MomentComments.VisibleComments(verify, null).CountAsync());
        var share = await new PublicProfileService(verify, r2).GetByPublicSlugAsync("topu-pubtopu");
        Assert.Empty(share.Memories);
        var cards = new SocialMomentProjection(verify, r2);
        await Assert.ThrowsAsync<ApiException>(() =>
            new PublicSocialProfileService(verify, r2, cards).GetMomentAsync(momentId));
    }

    // ---- helpers ----------------------------------------------------------

    private static CommunityReport Report(
        CommunityReportTargetType type,
        Guid? commentId = null,
        Guid? momentId = null) => new()
        {
            ReporterUserId = Reporter,
            TargetType = type,
            CommentId = commentId,
            MomentId = momentId,
            ReportedUserId = Author,
            Reason = CommunityReportReason.SpamOrScam,
            SnapshotHandle = "AuthorHome",
            SnapshotDisplayName = "The Author Home",
            SnapshotTitle = type == CommunityReportTargetType.Moment ? "Beach day" : null,
            SnapshotText = "evidence"
        };

    private static void Resolve(CommunityReport report, CommunityReportResolution resolution)
    {
        report.Status = CommunityReportStatus.Resolved;
        report.Resolution = resolution;
        report.ReviewedAt = DateTimeOffset.UtcNow;
        report.ReviewedByUserId = Moderator;
    }

    private static async Task InsertAsync(RelationalScope scope, CommunityReport report)
    {
        await using var context = scope.NewContext();
        context.CommunityReports.Add(report);
        await context.SaveChangesAsync();
    }

    private static async Task AssertRejectedAsync(RelationalScope scope, CommunityReport report)
    {
        await using var context = scope.NewContext();
        context.CommunityReports.Add(report);
        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    private static async Task AssertDeleteRejectedAsync(RelationalScope scope, Action<MyPetLinkDbContext> remove)
    {
        await using var context = scope.NewContext();
        remove(context);
        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    private static async Task AssertProfileRejectedAsync(RelationalScope scope, Action<OwnerSocialProfile> change)
    {
        await using var context = scope.NewContext();
        change(await context.OwnerSocialProfiles.SingleAsync(item => item.UserId == Author));
        await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
    }

    private static async Task<(Guid MomentId, Guid CommentId)> SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        SocialSurfaceHarness.AddOwner(context, Author, "author@example.com", "Author", "AuthorHome", "The Author Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Reporter, "reporter@example.com", "Reporter", "ReporterHome", "The Reporter Home", true, true);
        SocialSurfaceHarness.AddOwner(context, OtherReporter, "other@example.com", "Other", "OtherHome", "The Other Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Moderator, "moderator@example.com", "Moderator", "ModHome", "Mod Home", false, false);
        await context.SaveChangesAsync();

        SocialSurfaceHarness.AddPet(context, Pet, Author, "Topu", "Cat", true, true);
        await context.SaveChangesAsync();

        var moment = new PetMemory
        {
            PetId = Pet,
            AuthorUserId = Author,
            Title = "Beach day",
            Type = "Memory",
            Visibility = MemoryVisibility.Public,
            ShowInLifeTimeline = true,
            PublishedAt = DateTimeOffset.UtcNow
        };
        context.PetMemories.Add(moment);
        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Pet });
        var comment = new MomentComment { MomentId = moment.Id, AuthorUserId = Reporter, Body = "Lovely" };
        context.MomentComments.Add(comment);
        await context.SaveChangesAsync();
        return (moment.Id, comment.Id);
    }
}
