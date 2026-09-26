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
/// Report submission on SQL Server: duplicates that race past the pre-check
/// converge on one report through the filtered unique index, and a report
/// racing a deletion, an edit, a hide or a profile change always stores one
/// consistent committed version — or nothing — never a partial or falsified
/// snapshot. Races hold one side in SaveChanges until the other has committed
/// (or two seconds pass, which is what happens when they serialize).
/// </summary>
public sealed class CommunityReportRelationalTests
{
    private static readonly Guid Author = Guid.Parse("e8111111-1111-1111-1111-111111111111");
    private static readonly Guid Commenter = Guid.Parse("e8211111-1111-1111-1111-111111111111");
    private static readonly Guid Reporter = Guid.Parse("e8311111-1111-1111-1111-111111111111");
    private static readonly Guid Moderator = Guid.Parse("e8411111-1111-1111-1111-111111111111");
    private static readonly Guid Pet = Guid.Parse("e8511111-1111-1111-1111-111111111111");

    [RelationalFact]
    public async Task ADuplicateThatRacesPastThePreCheckConvergesOnOneReport()
    {
        // The held request has passed its "already reported?" check and is
        // about to insert; the other then does the same and commits first. The
        // held insert hits the unique index and still answers accepted.
        var gate = new SaveGate("first");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, _) = await SeedAsync(scope);

        var answers = new List<bool>();
        await RaceAsync(gate, "first",
            ("first", async context => answers.Add((await Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "SpamOrScam"))).Accepted)),
            ("second", async context => answers.Add((await Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "Impersonation"))).Accepted)),
            scope);

        Assert.Equal([true, true], answers);
        await using var verify = scope.NewContext();
        var report = await verify.CommunityReports.SingleAsync();
        Assert.Equal(CommunityReportReason.Impersonation, report.Reason);
    }

    [RelationalFact]
    public async Task ManySimultaneousSubmissionsLeaveOneOpenReport()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);

        var answers = await Task.WhenAll(Enumerable.Range(0, 8).Select(index => Task.Run(async () =>
        {
            await using var context = scope.NewContext();
            return (await Reports(context).SubmitAsync(
                Reporter,
                index % 2 == 0 ? Request("comment", commentId, "SpamOrScam") : Request("household", "commenterhome", "SpamOrScam"))).Accepted;
        })));

        Assert.All(answers, Assert.True);
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.CommunityReports.CountAsync(item => item.TargetType == CommunityReportTargetType.Comment));
        Assert.Equal(1, await verify.CommunityReports.CountAsync(item => item.TargetType == CommunityReportTargetType.Household));
        _ = momentId;
    }

    [RelationalFact]
    public async Task AResolvedReportIsHistoryAndANewOneCanFollowIt()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, _) = await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            await Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "SpamOrScam"));
        }

        await using (var context = scope.NewContext())
        {
            var report = await context.CommunityReports.SingleAsync();
            report.Status = CommunityReportStatus.Resolved;
            report.Resolution = CommunityReportResolution.Dismissed;
            report.ReviewedAt = DateTimeOffset.UtcNow;
            report.ReviewedByUserId = Moderator;
            await context.SaveChangesAsync();
        }

        await using (var context = scope.NewContext())
        {
            await Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "Impersonation"));
            await Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "Impersonation"));
        }

        await using var verify = scope.NewContext();
        var reports = await verify.CommunityReports.OrderBy(item => item.CreatedAt).ToListAsync();
        Assert.Equal(
            [(CommunityReportStatus.Resolved, CommunityReportReason.SpamOrScam), (CommunityReportStatus.Open, CommunityReportReason.Impersonation)],
            reports.Select(item => (item.Status, item.Reason)).ToArray());
    }

    [RelationalTheory]
    [InlineData("report")]
    [InlineData("delete")]
    public async Task AReportRacingACommentDeletionKeepsTheWordsItSaw(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("report", context => Tolerate(Reports(context).SubmitAsync(Reporter, Request("comment", commentId, "HarassmentOrBullying")))),
            ("delete", context => Comments(context).DeleteAsync(Commenter, momentId, commentId)),
            scope);

        await using var verify = scope.NewContext();
        Assert.Equal("", (await verify.MomentComments.SingleAsync(item => item.Id == commentId)).Body);
        var reports = await verify.CommunityReports.ToListAsync();
        Assert.InRange(reports.Count, 0, 1);
        Assert.All(reports, report =>
        {
            Assert.Equal(commentId, report.CommentId);
            Assert.Equal(Commenter, report.ReportedUserId);
            Assert.Equal("Rude words", report.SnapshotText);
            Assert.Equal("CommenterHome", report.SnapshotHandle);
        });
    }

    [RelationalFact]
    public async Task ADeletedCommentCannotBeReportedAfterwards()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var (momentId, commentId) = await SeedAsync(scope);
        await using (var context = scope.NewContext())
        {
            await Comments(context).DeleteAsync(Commenter, momentId, commentId);
        }

        await using var reporting = scope.NewContext();
        var refused = await Assert.ThrowsAsync<ApiException>(() =>
            Reports(reporting).SubmitAsync(Reporter, Request("comment", commentId, "SpamOrScam")));
        Assert.Equal("report_target_unavailable", refused.Code);
    }

    [RelationalTheory]
    [InlineData("report")]
    [InlineData("edit")]
    public async Task AReportRacingAMomentEditStoresOneWholeVersion(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, _) = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("report", context => Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "InappropriateContent"))),
            ("edit", context => new MemoryService(context, Options.Create(new CloudflareR2Options())).UpdateAsync(
                Author, momentId, new UpdateMemoryRequest("Edited title", null, null, "Edited caption", null, null, null, null, null))),
            scope);

        await using var verify = scope.NewContext();
        var report = await verify.CommunityReports.SingleAsync();
        Assert.Contains((report.SnapshotTitle, report.SnapshotText), new (string?, string?)[]
        {
            ("Beach day", "Sand everywhere"),
            ("Edited title", "Edited caption")
        });
        Assert.Equal(Author, report.ReportedUserId);
    }

    [RelationalTheory]
    [InlineData("report")]
    [InlineData("hide")]
    public async Task AReportRacingAHideIsWholeOrAbsent(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var (momentId, _) = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("report", context => Tolerate(Reports(context).SubmitAsync(Reporter, Request("moment", momentId, "InappropriateContent")))),
            ("hide", async context =>
            {
                CommunityModeration.HideMoment(await context.PetMemories.SingleAsync(item => item.Id == momentId), Moderator, DateTimeOffset.UtcNow);
                await context.SaveChangesAsync();
            }),
            scope);

        await using var verify = scope.NewContext();
        Assert.NotNull((await verify.PetMemories.SingleAsync(item => item.Id == momentId)).ModeratedAt);
        var reports = await verify.CommunityReports.ToListAsync();
        Assert.InRange(reports.Count, 0, 1);
        Assert.All(reports, report => Assert.Equal(("Beach day", "Sand everywhere"), (report.SnapshotTitle, report.SnapshotText)));
    }

    [RelationalTheory]
    [InlineData("report")]
    [InlineData("edit")]
    public async Task AReportRacingAProfileEditStoresOneWholeVersion(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("report", context => Tolerate(Reports(context).SubmitAsync(Reporter, Request("household", "commenterhome", "Impersonation")))),
            ("edit", async context =>
            {
                var profile = await context.OwnerSocialProfiles.SingleAsync(item => item.UserId == Commenter);
                profile.DisplayName = "MyPetLink Support";
                profile.NormalizedDisplayName = "mypetlink support";
                profile.Bio = "Official help desk";
                await context.SaveChangesAsync();
            }),
            scope);

        await using var verify = scope.NewContext();
        var report = await verify.CommunityReports.SingleAsync();
        Assert.Equal(Commenter, report.ReportedUserId);
        Assert.Contains((report.SnapshotDisplayName, report.SnapshotText), new[]
        {
            ("The Commenter Home", (string?)null),
            ("MyPetLink Support", "Official help desk")
        });
    }

    // ---- helpers ----------------------------------------------------------

    private static CommunityReportService Reports(MyPetLinkDbContext context) => new(context);

    private static MomentCommentService Comments(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }

    private static CreateCommunityReportRequest Request(string type, object target, string reason) =>
        new(type, target.ToString(), reason, null);

    /// <summary>A report that finds its target gone is a valid outcome of a race.</summary>
    private static async Task Tolerate(Task<CommunityReportReceivedResponse> submit)
    {
        try
        {
            await submit;
        }
        catch (ApiException exception) when (exception.Code == "report_target_unavailable")
        {
        }
    }

    private static async Task<(Guid MomentId, Guid CommentId)> SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        SocialSurfaceHarness.AddOwner(context, Author, "author@example.com", "Author", "AuthorHome", "The Author Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Commenter, "commenter@example.com", "Commenter", "CommenterHome", "The Commenter Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Reporter, "reporter@example.com", "Reporter", "ReporterHome", "The Reporter Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Moderator, "moderator@example.com", "Moderator", "ModHome", "Mod Home", false, false);
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
        var comment = new MomentComment { MomentId = moment.Id, AuthorUserId = Commenter, Body = "Rude words" };
        context.MomentComments.Add(comment);
        await context.SaveChangesAsync();
        return (moment.Id, comment.Id);
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
            await operation.Run(context);
            gate.Finished(operation.Name);
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
