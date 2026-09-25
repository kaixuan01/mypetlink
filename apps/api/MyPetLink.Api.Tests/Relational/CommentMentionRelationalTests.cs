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
/// Comment @Mentions on SQL Server: the Comment, its mentions and their
/// Activity commit together or not at all; the schema refuses a doubled or
/// malformed mention and never cascades one away; and every race that could
/// leave a mention visible across a block, pointing at a deleted Comment, or
/// naming the wrong account is forced both ways. Races hold one side in
/// SaveChanges until the other has committed (or two seconds pass, which is
/// what happens when the two correctly serialize).
/// </summary>
public sealed class CommentMentionRelationalTests
{
    private static readonly Guid Author = Guid.Parse("c7111111-1111-1111-1111-111111111111");
    private static readonly Guid AuthorPet = Guid.Parse("c7122222-2222-2222-2222-222222222222");
    private static readonly Guid Commenter = Guid.Parse("c7211111-1111-1111-1111-111111111111");
    private static readonly Guid Erin = Guid.Parse("c7311111-1111-1111-1111-111111111111");
    private static readonly Guid Finn = Guid.Parse("c7411111-1111-1111-1111-111111111111");

    [RelationalFact]
    public async Task ACommentItsMentionsAndTheirActivityCommitTogether()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            await Comments(context).CreateAsync(Commenter, momentId, new CreateMomentCommentRequest("hi @ErinHome and @FinnHome"));
        }

        await using var verify = scope.NewContext();
        var comment = await verify.MomentComments.SingleAsync();
        Assert.Equal(
            [Erin, Finn],
            await verify.MomentCommentMentions.OrderBy(item => item.Start).Select(item => item.MentionedUserId).ToArrayAsync());
        Assert.Equal(1, await verify.OwnerNotifications.CountAsync(item =>
            item.Type == OwnerNotificationType.MomentCommented && item.RecipientUserId == Author && item.CommentId == comment.Id));
        Assert.Equal(2, await verify.OwnerNotifications.CountAsync(item =>
            item.Type == OwnerNotificationType.MomentCommentMentioned && item.CommentId == comment.Id));
    }

    [RelationalFact]
    public async Task AFailedWriteLeavesNoCommentMentionOrActivityBehind()
    {
        var failing = new FailingSave();
        await using var scope = await RelationalDatabase.CreateAsync(failing, enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        FailingSave.Armed.Value = true;
        await using (var context = scope.NewContext())
        {
            await Assert.ThrowsAnyAsync<Exception>(() =>
                Comments(context).CreateAsync(Commenter, momentId, new CreateMomentCommentRequest("hi @ErinHome")));
        }

        FailingSave.Armed.Value = false;
        await using var verify = scope.NewContext();
        Assert.Equal(0, await verify.MomentComments.CountAsync());
        Assert.Equal(0, await verify.MomentCommentMentions.CountAsync());
        Assert.Equal(0, await verify.OwnerNotifications.CountAsync());
    }

    [RelationalFact]
    public async Task TheSchemaRefusesDoubledOrMalformedMentionsAndNeverCascades()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);
        Guid commentId;
        await using (var context = scope.NewContext())
        {
            commentId = (await Comments(context).CreateAsync(
                Commenter, momentId, new CreateMomentCommentRequest("hi @ErinHome and @FinnHome"))).Comment.Id;
        }

        MomentCommentMention Row(Guid userId, int start, int length) => new()
        {
            CommentId = commentId,
            MentionedUserId = userId,
            Start = start,
            Length = length
        };

        // The same household twice, the same span twice, and spans the body
        // could never contain.
        foreach (var row in new[]
        {
            Row(Erin, 40, 9),
            Row(Author, 3, 9),
            Row(Author, 40, 2),
            Row(Author, 495, 9),
            Row(Author, -1, 9)
        })
        {
            await using var context = scope.NewContext();
            context.MomentCommentMentions.Add(row);
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }

        // Restrict, not cascade: neither the Comment nor the account can be
        // removed out from under a mention.
        await using (var context = scope.NewContext())
        {
            context.MomentComments.Remove(await context.MomentComments.SingleAsync());
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }

        await using (var context = scope.NewContext())
        {
            context.Users.Remove(await context.Users.SingleAsync(user => user.Id == Erin));
            await Assert.ThrowsAnyAsync<Exception>(() => context.SaveChangesAsync());
        }

        await using var verify = scope.NewContext();
        Assert.Equal(2, await verify.MomentCommentMentions.CountAsync());
    }

    [RelationalTheory]
    [InlineData("comment")]
    [InlineData("block")]
    public async Task ACommentRacingABlockNeverShowsAMentionAcrossIt(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("comment", context => Comments(context).CreateAsync(
                Commenter, momentId, new CreateMomentCommentRequest("look @ErinHome"))),
            ("block", context => Graph(context).BlockAsync(Erin, "commenterhome", null)),
            scope);

        await using var verify = scope.NewContext();
        // Resolution reads before the Comment is saved, so in either order the
        // Comment may have named Erin before the block committed. That row is
        // history; what matters is that nothing shows it across the block.
        Assert.InRange(await verify.MomentCommentMentions.CountAsync(), 0, 1);
        Assert.Equal(0, await verify.MomentCommentMentions.VisibleCommentMentions(verify, null).CountAsync());
        var erinsActivity = await Notifications(verify).GetAsync(Erin, null, 50);
        Assert.DoesNotContain(erinsActivity.Items, item => item.Type == nameof(OwnerNotificationType.MomentCommentMentioned));
        Assert.Equal(0, (await Notifications(verify).GetUnreadSummaryAsync(Erin)).UnreadCount);
    }

    [RelationalTheory]
    [InlineData("delete")]
    [InlineData("create")]
    public async Task DeletingOneMentionWhileAnotherIsWrittenKeepsOneAccurateActivityRow(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);
        Guid firstId;
        await using (var context = scope.NewContext())
        {
            firstId = (await Comments(context).CreateAsync(
                Commenter, momentId, new CreateMomentCommentRequest("one @ErinHome"))).Comment.Id;
        }

        Guid secondId = Guid.Empty;
        await RaceAsync(gate, held,
            ("delete", context => Comments(context).DeleteAsync(Commenter, momentId, firstId)),
            ("create", async context => secondId = (await Comments(context).CreateAsync(
                Commenter, momentId, new CreateMomentCommentRequest("two @ErinHome"))).Comment.Id),
            scope);

        await using var verify = scope.NewContext();
        var unread = await verify.OwnerNotifications
            .Where(item => item.Type == OwnerNotificationType.MomentCommentMentioned && item.RecipientUserId == Erin)
            .ToListAsync();
        Assert.Equal(secondId, Assert.Single(unread).CommentId);
        Assert.Equal(secondId, (await verify.MomentCommentMentions.SingleAsync()).CommentId);
    }

    [RelationalFact]
    public async Task SimultaneousRetriesOfOneCommentMentionAndNotifyOnce()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        var ids = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => Task.Run(async () =>
        {
            await using var context = scope.NewContext();
            return (await Comments(context).CreateAsync(
                Commenter, momentId, new CreateMomentCommentRequest("look @ErinHome"))).Comment.Id;
        })));

        Assert.Equal(ids[0], ids[1]);
        await using var verify = scope.NewContext();
        Assert.Equal(1, await verify.MomentComments.CountAsync());
        Assert.Equal(1, await verify.MomentCommentMentions.CountAsync());
        Assert.Equal(1, await verify.OwnerNotifications.CountAsync(item =>
            item.Type == OwnerNotificationType.MomentCommentMentioned));
    }

    [RelationalTheory]
    [InlineData("comment")]
    [InlineData("rename")]
    public async Task ARenameDuringACommentNeverMentionsSomebodyElse(string held)
    {
        var gate = new SaveGate(held);
        await using var scope = await RelationalDatabase.CreateAsync(gate, enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);

        await RaceAsync(gate, held,
            ("comment", context => Comments(context).CreateAsync(
                Commenter, momentId, new CreateMomentCommentRequest("thanks @ErinHome"))),
            ("rename", async context =>
            {
                var profile = await context.OwnerSocialProfiles.SingleAsync(item => item.UserId == Erin);
                profile.Handle = "ErinNewHome";
                profile.NormalizedHandle = "erinnewhome";
                await context.SaveChangesAsync();
            }),
            scope);

        await using var verify = scope.NewContext();
        var rows = await verify.MomentCommentMentions.ToListAsync();
        // Resolved before the rename commits: Erin. After it: nobody holds the
        // name. Never any other account, and the link follows Erin.
        Assert.InRange(rows.Count, 0, 1);
        Assert.All(rows, row => Assert.Equal(Erin, row.MentionedUserId));

        var page = await Comments(verify).GetAsync(momentId, null, null, null);
        var comment = Assert.Single(page.Items);
        Assert.Equal("thanks @ErinHome", comment.Body);
        Assert.All(comment.Mentions, span => Assert.Equal("ErinNewHome", span.Household.Handle));
    }

    // ---- helpers ----------------------------------------------------------

    private static MomentCommentService Comments(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }

    private static OwnerNotificationService Notifications(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()));

    private static SocialGraphService Graph(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new SocialGraphService(context, r2, new OwnerNotificationService(context, r2));
    }

    private static async Task<Guid> SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
        SocialSurfaceHarness.AddOwner(context, Author, "author@example.com", "Author", "AuthorHome", "The Author Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Commenter, "commenter@example.com", "Commenter", "CommenterHome", "The Commenter Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Erin, "erin@example.com", "Erin", "ErinHome", "The Ong Home", true, true);
        SocialSurfaceHarness.AddOwner(context, Finn, "finn@example.com", "Finn", "FinnHome", "The Koh Home", true, true);
        await context.SaveChangesAsync();

        SocialSurfaceHarness.AddPet(context, AuthorPet, Author, "Topu", "Cat", true, true);
        await context.SaveChangesAsync();

        var moment = new PetMemory
        {
            PetId = AuthorPet,
            AuthorUserId = Author,
            Title = "Beach day",
            Type = "Memory",
            Visibility = MemoryVisibility.Public,
            PublishedAt = DateTimeOffset.UtcNow
        };
        context.PetMemories.Add(moment);
        context.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = AuthorPet });
        await context.SaveChangesAsync();
        return moment.Id;
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

    /// <summary>Fails the next save after the rows reach the database, inside its transaction.</summary>
    private sealed class FailingSave : SaveChangesInterceptor
    {
        public static readonly AsyncLocal<bool> Armed = new();

        public override ValueTask<int> SavedChangesAsync(
            SaveChangesCompletedEventData eventData,
            int result,
            CancellationToken cancellationToken = default)
        {
            if (Armed.Value)
            {
                throw new InvalidOperationException("Simulated failure after the rows were written.");
            }

            return ValueTask.FromResult(result);
        }
    }
}
