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
/// Writing Replies on real SQL Server, against everything that can change
/// underneath a write: the parent's removal, a block, a Moment hidden by
/// MyPetLink, a Community restriction, a report, a double submit.
///
/// Each race is forced both ways. <see cref="HoldGate"/> stops one side at
/// SaveChanges — after every check it makes, before anything is written — until
/// the other side has committed; the plain sequential order covers the other
/// side winning outright. Whatever the order, a committed Reply is either one
/// that was valid when written or one that no read, count or Activity shows.
///
/// The cast: Alice's Moment; Bob's top-level Comment; Carol replies; Erin
/// reports and is mentioned; a moderator.
/// </summary>
public sealed class CommentReplyWriteRelationalTests
{
    private static readonly Guid Alice = Guid.Parse("e8111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("e8222222-2222-2222-2222-222222222222");
    private static readonly Guid Carol = Guid.Parse("e8333333-3333-3333-3333-333333333333");
    private static readonly Guid Erin = Guid.Parse("e8444444-4444-4444-4444-444444444444");
    private static readonly Guid Moderator = Guid.Parse("e8555555-5555-5555-5555-555555555555");
    private static readonly Guid Mochi = Guid.Parse("e8911111-1111-1111-1111-111111111111");

    // ---- retries and coalescing --------------------------------------------------------

    [RelationalFact]
    public async Task ADoubleSubmittedReplyLeavesOneReplyOneMentionAndOneRowOfActivityEach()
    {
        var gate = new HoldGate("none");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var ids = await Task.WhenAll(
            ReplyAsync(scope, Carol, world, "@ErinHome same words"),
            ReplyAsync(scope, Carol, world, "@ErinHome same words"));

        Assert.Equal(ids[0], ids[1]);
        await using var verify = scope.NewContext();
        Assert.Single(await verify.MomentComments.Where(item => item.ParentCommentId == world.ParentId).ToListAsync());
        Assert.Single(await verify.MomentCommentMentions.Where(item => item.CommentId == ids[0]).ToListAsync());
        var activity = await verify.OwnerNotifications.AsNoTracking()
            .Where(item => item.ActorUserId == Carol)
            .Select(item => new { item.Type, item.RecipientUserId })
            .ToListAsync();
        Assert.Equal(
            ["MomentCommentMentioned:" + Erin, "MomentCommentReplied:" + Bob, "MomentCommented:" + Alice],
            activity.Select(item => $"{item.Type}:{item.RecipientUserId}").Order(StringComparer.Ordinal));
        Assert.Equal(1, (await Comments(verify).GetRepliesAsync(world.MomentId, world.ParentId, null, null, null)).ReplyCount);
    }

    [RelationalFact]
    public async Task TheSameWordsAtTopLevelAndUnderTwoParentsAreThreeComments()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        Guid secondParent;
        await using (var context = scope.NewContext())
        {
            secondParent = (await Comments(context).CreateAsync(
                Erin, world.MomentId, new CreateMomentCommentRequest("Erin's comment"))).Comment.Id;
        }

        var ids = await Task.WhenAll(
            CreateAsync(scope, Carol, world.MomentId, new CreateMomentCommentRequest("Same words")),
            CreateAsync(scope, Carol, world.MomentId, new CreateMomentCommentRequest("Same words", world.ParentId)),
            CreateAsync(scope, Carol, world.MomentId, new CreateMomentCommentRequest("Same words", secondParent)));

        Assert.Equal(3, ids.Distinct().Count());
        await using var verify = scope.NewContext();
        var rows = await verify.MomentComments.AsNoTracking()
            .Where(item => item.AuthorUserId == Carol)
            .Select(item => item.ParentCommentId)
            .ToListAsync();
        Assert.Equal(3, rows.Count);
        Assert.Equal(3, rows.Distinct().Count());
    }

    [RelationalFact]
    public async Task ConcurrentRepliesToOneHouseholdCoalesceIntoOneUnreadRow()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        Guid secondParent;
        await using (var context = scope.NewContext())
        {
            secondParent = (await Comments(context).CreateAsync(
                Bob, world.MomentId, new CreateMomentCommentRequest("Bob again"))).Comment.Id;
        }

        var ids = await Task.WhenAll(
            CreateAsync(scope, Carol, world.MomentId, new CreateMomentCommentRequest("One", world.ParentId)),
            CreateAsync(scope, Carol, world.MomentId, new CreateMomentCommentRequest("Two", secondParent)));

        await using var verify = scope.NewContext();
        var replied = Assert.Single(await verify.OwnerNotifications.AsNoTracking()
            .Where(item => item.RecipientUserId == Bob && item.Type == OwnerNotificationType.MomentCommentReplied)
            .ToListAsync());
        var newest = await verify.MomentComments.AsNoTracking()
            .Where(item => ids.Contains(item.Id))
            .OrderByDescending(item => item.CreatedAt).ThenByDescending(item => item.Id)
            .Select(item => item.Id)
            .FirstAsync();
        Assert.Equal(newest, replied.CommentId);
        Assert.Single(await verify.OwnerNotifications.AsNoTracking()
            .Where(item => item.RecipientUserId == Alice && item.ActorUserId == Carol)
            .ToListAsync());
    }

    [RelationalFact]
    public async Task RemovingRepliesRetargetsThenWithdrawsInOneUnitOfWork()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var first = await ReplyAsync(scope, Carol, world, "First");
        var second = await ReplyAsync(scope, Carol, world, "Second");

        await using (var context = scope.NewContext())
        {
            await Comments(context).DeleteAsync(Carol, world.MomentId, second);
        }

        Assert.Equal([$"MomentCommentReplied:{first}"], await UnreadAsync(scope, Bob));
        Assert.Contains($"MomentCommented:{first}", await UnreadAsync(scope, Alice));

        await using (var context = scope.NewContext())
        {
            await Comments(context).DeleteAsync(Alice, world.MomentId, first);
        }

        Assert.Empty(await UnreadAsync(scope, Bob));
        await using var verify = scope.NewContext();
        Assert.Empty(await verify.OwnerNotifications.Where(item => item.ActorUserId == Carol).ToListAsync());
    }

    // ---- races ------------------------------------------------------------------------

    [RelationalTheory]
    [InlineData("replyFirst")]
    [InlineData("removedDuringWrite")]
    [InlineData("removedFirst")]
    public async Task AReplyRacingItsParentsRemovalIsNeverShownWithoutIt(string order)
    {
        var gate = new HoldGate("reply");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var outcome = await RaceAsync(
            gate,
            order,
            reply: () => ReplyAsync(scope, Carol, world, "@ErinHome racing"),
            other: async () =>
            {
                await using var context = scope.NewContext();
                await Comments(context).DeleteAsync(Bob, world.MomentId, world.ParentId);
            });

        if (order == "removedFirst")
        {
            Assert.Equal("comment_not_found", outcome.Error);
            await AssertNoRepliesAsync(scope, world);
        }
        else
        {
            Assert.Null(outcome.Error);
            await AssertStoredButUnseenAsync(scope, world, outcome.ReplyId!.Value, momentReadable: true);
        }
    }

    [RelationalTheory]
    [InlineData("replyFirst")]
    [InlineData("blockedDuringWrite")]
    [InlineData("blockedFirst")]
    public async Task AReplyRacingABlockBetweenItsAuthorAndTheParentsIsNeverShown(string order)
    {
        var gate = new HoldGate("reply");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var outcome = await RaceAsync(
            gate,
            order,
            reply: () => ReplyAsync(scope, Carol, world, "@ErinHome racing"),
            other: async () =>
            {
                await using var context = scope.NewContext();
                await Graph(context).BlockAsync(Bob, "carolhome", null);
            });

        if (order == "blockedFirst")
        {
            Assert.Equal("comment_not_found", outcome.Error);
            await AssertNoRepliesAsync(scope, world);
        }
        else
        {
            Assert.Null(outcome.Error);
            await AssertStoredButUnseenAsync(scope, world, outcome.ReplyId!.Value, momentReadable: true);
        }
    }

    [RelationalTheory]
    [InlineData("replyFirst")]
    [InlineData("hiddenDuringWrite")]
    [InlineData("hiddenFirst")]
    public async Task AReplyRacingAMomentHiddenByMyPetLinkIsNeverShown(string order)
    {
        var gate = new HoldGate("reply");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var report = await ReportAsync(scope, Erin, "moment", world.MomentId.ToString());

        var outcome = await RaceAsync(
            gate,
            order,
            reply: () => ReplyAsync(scope, Carol, world, "@ErinHome racing"),
            other: async () =>
            {
                await using var context = scope.NewContext();
                await Moderation(context).HideMomentAsync(Moderator, report.Id, Request(report));
            });

        if (order == "hiddenFirst")
        {
            Assert.Equal("social_moment_not_found", outcome.Error);
            await AssertNoRepliesAsync(scope, world);
        }
        else
        {
            Assert.Null(outcome.Error);
            await AssertStoredButUnseenAsync(scope, world, outcome.ReplyId!.Value, momentReadable: false);
        }
    }

    [RelationalTheory]
    [InlineData("replyFirst")]
    [InlineData("restrictedDuringWrite")]
    [InlineData("restrictedFirst")]
    public async Task AReplyRacingItsAuthorsRestrictionIsNeverShown(string order)
    {
        var gate = new HoldGate("reply");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var report = await ReportAsync(scope, Erin, "household", "carolhome");

        var outcome = await RaceAsync(
            gate,
            order,
            reply: () => ReplyAsync(scope, Carol, world, "@ErinHome racing"),
            other: async () =>
            {
                await using var context = scope.NewContext();
                await Moderation(context).RestrictHouseholdAsync(Moderator, report.Id, Request(report));
            });

        if (order == "restrictedFirst")
        {
            Assert.Equal("community_profile_required", outcome.Error);
            await AssertNoRepliesAsync(scope, world);
        }
        else
        {
            Assert.Null(outcome.Error);
            await AssertStoredButUnseenAsync(scope, world, outcome.ReplyId!.Value, momentReadable: true);
        }

        // And nothing more gets through while the restriction stands.
        var again = await Assert.ThrowsAsync<ApiException>(() => ReplyAsync(scope, Carol, world, "Trying again"));
        Assert.Equal("community_profile_required", again.Code);
    }

    [RelationalTheory]
    [InlineData("reportHeld")]
    [InlineData("deleteHeld")]
    [InlineData("deletedFirst")]
    public async Task AReportRacingTheReplysDeletionIsWholeOrRefused(string order)
    {
        var gate = new HoldGate(order == "deleteHeld" ? "delete" : "report");
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var replyId = await ReplyAsync(scope, Carol, world, "Reportable reply");

        async Task Report()
        {
            HoldGate.Operation.Value = "report";
            await using var context = scope.NewContext();
            await new CommunityReportService(context).SubmitAsync(
                Erin, new CreateCommunityReportRequest("comment", replyId.ToString(), "HarassmentOrBullying", null));
        }

        async Task Delete()
        {
            HoldGate.Operation.Value = "delete";
            await using var context = scope.NewContext();
            await Comments(context).DeleteAsync(Carol, world.MomentId, replyId);
        }

        string? error = null;
        if (order == "deletedFirst")
        {
            await Delete();
            error = (await Assert.ThrowsAsync<ApiException>(Report)).Code;
        }
        else
        {
            Func<Task> held = order == "reportHeld" ? Report : Delete;
            Func<Task> other = order == "reportHeld" ? Delete : Report;
            var holding = Task.Run(held);
            await gate.Reached;
            await Task.Run(other);
            gate.Release();
            await holding;
        }

        await using var verify = scope.NewContext();
        var reply = await verify.MomentComments.AsNoTracking().SingleAsync(item => item.Id == replyId);
        Assert.Equal("", reply.Body);
        var reports = await verify.CommunityReports.AsNoTracking().ToListAsync();

        if (order == "deletedFirst")
        {
            Assert.Equal("report_target_unavailable", error);
            Assert.Empty(reports);
        }
        else
        {
            // The report saw the Reply standing, so it keeps what it saw.
            var report = Assert.Single(reports);
            Assert.Equal((replyId, Carol, "Reportable reply"), (report.CommentId!.Value, report.ReportedUserId, report.SnapshotText));
            Assert.Equal(CommunityReportStatus.Open, report.Status);
        }
    }

    // ---- assertions ------------------------------------------------------------------

    /// <summary>
    /// A Reply that committed but must not be seen: its row is intact, and no
    /// read — the thread, its Replies, the counts, a report, anyone's Activity
    /// or unread badge — acknowledges it.
    /// </summary>
    private static async Task AssertStoredButUnseenAsync(
        RelationalScope scope, World world, Guid replyId, bool momentReadable)
    {
        await using var context = scope.NewContext();
        var row = await context.MomentComments.AsNoTracking().SingleAsync(item => item.Id == replyId);
        Assert.Equal((world.ParentId, Carol), (row.ParentCommentId!.Value, row.AuthorUserId));
        Assert.NotEqual("", row.Body);

        var comments = Comments(context);
        foreach (var viewer in new Guid?[] { null, Alice, Erin })
        {
            if (momentReadable)
            {
                var page = await comments.GetAsync(world.MomentId, viewer, null, null, default, replyId);
                Assert.Null(page.AnchorParentCommentId);
                Assert.DoesNotContain(page.Items, item => item.Id == replyId);
                Assert.All(page.Items, item => Assert.Equal(0, item.ReplyCount));
                Assert.Equal(page.Items.Count, page.CommentCount);
            }
            else
            {
                await Assert.ThrowsAsync<ApiException>(() => comments.GetAsync(world.MomentId, viewer, null, null));
            }
        }

        var report = await Assert.ThrowsAsync<ApiException>(() => new CommunityReportService(context).SubmitAsync(
            Erin, new CreateCommunityReportRequest("comment", replyId.ToString(), "SpamOrScam", null)));
        Assert.Equal("report_target_unavailable", report.Code);

        foreach (var household in new[] { Alice, Bob, Erin })
        {
            Assert.DoesNotContain(await UnreadAsync(scope, household), item => item.EndsWith(replyId.ToString(), StringComparison.Ordinal));
        }
    }

    private static async Task AssertNoRepliesAsync(RelationalScope scope, World world)
    {
        await using var context = scope.NewContext();
        Assert.Empty(await context.MomentComments.Where(item => item.ParentCommentId != null).ToListAsync());
        Assert.Empty(await context.OwnerNotifications.Where(item => item.ActorUserId == Carol).ToListAsync());
        Assert.Empty(await context.MomentCommentMentions.Where(item => item.Comment.ParentCommentId != null).ToListAsync());
    }

    /// <summary>
    /// A household's visible unread Activity as "Type:CommentId", checked
    /// against the unread badge every time.
    /// </summary>
    private static async Task<string[]> UnreadAsync(RelationalScope scope, Guid household)
    {
        await using var context = scope.NewContext();
        var notifications = new OwnerNotificationService(context, Options.Create(new CloudflareR2Options()));
        var page = await notifications.GetAsync(household, null, null);
        var unread = page.Items.Where(item => !item.IsRead).ToArray();
        Assert.Equal(unread.Length, (await notifications.GetUnreadSummaryAsync(household)).UnreadCount);
        return unread.Select(item => $"{item.Type}:{item.CommentId}").ToArray();
    }

    // ---- racing -------------------------------------------------------------------------

    private sealed record Outcome(Guid? ReplyId, string? Error);

    /// <summary>
    /// "…First": the named side runs alone first, then the Reply. "…DuringWrite":
    /// the Reply is stopped at SaveChanges, after its parent and Moment checks,
    /// while the other side commits. "replyFirst": the Reply commits, then the
    /// other side runs.
    /// </summary>
    private static async Task<Outcome> RaceAsync(HoldGate gate, string order, Func<Task<Guid>> reply, Func<Task> other)
    {
        async Task<Outcome> Attempt()
        {
            try
            {
                return new Outcome(await reply(), null);
            }
            catch (ApiException exception)
            {
                return new Outcome(null, exception.Code);
            }
        }

        if (order == "replyFirst")
        {
            var first = await Attempt();
            await other();
            return first;
        }

        if (order.EndsWith("First", StringComparison.Ordinal))
        {
            await other();
            return await Attempt();
        }

        var holding = Task.Run(() =>
        {
            HoldGate.Operation.Value = "reply";
            return Attempt();
        });
        await gate.Reached;
        await Task.Run(other);
        gate.Release();
        return await holding;
    }

    /// <summary>
    /// Stops the first SaveChanges made under one named operation until the test
    /// releases it — after that operation's reads and checks, before it writes.
    /// </summary>
    private sealed class HoldGate(string held) : SaveChangesInterceptor
    {
        public static readonly AsyncLocal<string?> Operation = new();

        private readonly TaskCompletionSource _reached = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int _used;

        public Task Reached => _reached.Task.WaitAsync(TimeSpan.FromSeconds(30));

        public void Release() => _released.TrySetResult();

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (Operation.Value == held && Interlocked.Exchange(ref _used, 1) == 0)
            {
                _reached.TrySetResult();
                await _released.Task.WaitAsync(TimeSpan.FromSeconds(30), cancellationToken);
            }

            return result;
        }
    }

    // ---- world ------------------------------------------------------------------------

    private sealed record World(Guid MomentId, Guid ParentId);

    private static async Task<World> SeedAsync(RelationalScope scope)
    {
        Guid momentId;
        await using (var context = scope.NewContext())
        {
            SocialSurfaceHarness.AddOwner(context, Alice, "alice@example.com", "Alice", "AliceHome", "The Alice Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Bob, "bob@example.com", "Bob", "BobHome", "The Bob Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Carol, "carol@example.com", "Carol", "CarolHome", "The Carol Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Erin, "erin@example.com", "Erin", "ErinHome", "The Erin Home", true, true);
            SocialSurfaceHarness.AddOwner(context, Moderator, "moderator@example.com", "Moderator", "ModHome", "Mod Home", false, false);
            await context.SaveChangesAsync();

            SocialSurfaceHarness.AddPet(context, Mochi, Alice, "Mochi", "Cat", true, true);
            var moment = new PetMemory
            {
                PetId = Mochi,
                AuthorUserId = Alice,
                Title = "Beach day",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = DateTimeOffset.UtcNow.AddHours(-1)
            };
            context.PetMemories.Add(moment);
            context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = Mochi });
            await context.SaveChangesAsync();
            momentId = moment.Id;
        }

        var parentId = await CreateAsync(scope, Bob, momentId, new CreateMomentCommentRequest("Nice photo!"));

        // Start every race from quiet Activity.
        await using (var context = scope.NewContext())
        {
            await context.OwnerNotifications.ExecuteUpdateAsync(set => set.SetProperty(item => item.ReadAt, DateTimeOffset.UtcNow));
        }

        return new World(momentId, parentId);
    }

    private static Task<Guid> ReplyAsync(RelationalScope scope, Guid author, World world, string body) =>
        CreateAsync(scope, author, world.MomentId, new CreateMomentCommentRequest(body, world.ParentId));

    private static async Task<Guid> CreateAsync(
        RelationalScope scope, Guid author, Guid momentId, CreateMomentCommentRequest request)
    {
        await using var context = scope.NewContext();
        return (await Comments(context).CreateAsync(author, momentId, request)).Comment.Id;
    }

    private static async Task<CommunityReport> ReportAsync(RelationalScope scope, Guid reporter, string type, string target)
    {
        await using (var context = scope.NewContext())
        {
            await new CommunityReportService(context).SubmitAsync(
                reporter, new CreateCommunityReportRequest(type, target, "SpamOrScam", null));
        }

        await using var read = scope.NewContext();
        return await read.CommunityReports.AsNoTracking()
            .Where(item => item.ReporterUserId == reporter)
            .OrderByDescending(item => item.CreatedAt)
            .FirstAsync();
    }

    private static AdminCommunityModerationRequest Request(CommunityReport report) =>
        new("Checked against the Community guidelines.", Convert.ToBase64String(report.RowVersion));

    private static MomentCommentService Comments(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }

    private static SocialGraphService Graph(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new SocialGraphService(context, r2, new OwnerNotificationService(context, r2));
    }

    private static AdminCommunityModerationService Moderation(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new AdminCommunityModerationService(
            context,
            new OwnerNotificationService(context, r2),
            new AuditLogService(context, new HttpContextAccessor()));
    }
}
