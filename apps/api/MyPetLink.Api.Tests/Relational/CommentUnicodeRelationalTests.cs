using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Emoji in Comments and Replies on real SQL Server.
///
/// The database's default collation gives characters outside the Basic
/// Multilingual Plane no weight: there N'😎' = N'' and N'hello 😎' = N'hello'.
/// InMemory compares ordinally and cannot see either, so these run here. They
/// pin the deletion-state check (an emoji-only Comment is not empty) and the
/// retry check (a different emoji is different text).
///
/// The cast: Alice's Moment; Bob's top-level Comment; Carol comments and
/// replies; Erin is mentioned.
/// </summary>
public sealed class CommentUnicodeRelationalTests
{
    private static readonly Guid Alice = Guid.Parse("e9111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("e9222222-2222-2222-2222-222222222222");
    private static readonly Guid Carol = Guid.Parse("e9333333-3333-3333-3333-333333333333");
    private static readonly Guid Erin = Guid.Parse("e9444444-4444-4444-4444-444444444444");
    private static readonly Guid Mochi = Guid.Parse("e9911111-1111-1111-1111-111111111111");

    [RelationalTheory]
    [InlineData("hello")]
    [InlineData("😎")]
    [InlineData("😎😎")]
    [InlineData("hello 😎")]
    [InlineData("中文 😎")]
    [InlineData("❤️")]
    [InlineData("🐶🐱")]
    [InlineData("👨‍👩‍👧‍👦")]
    [InlineData("👍🏽")]
    public async Task ACommentAndAReplyKeepTheirTextExactlyAndReachTheirHouseholds(string body)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        CreateMomentCommentResponse comment;
        CreateMomentCommentResponse reply;
        await using (var context = scope.NewContext())
        {
            comment = await Comments(context).CreateAsync(Carol, world.MomentId, new CreateMomentCommentRequest(body));
        }

        await using (var context = scope.NewContext())
        {
            reply = await Comments(context).CreateAsync(
                Carol, world.MomentId, new CreateMomentCommentRequest(body, world.ParentId));
        }

        Assert.NotEqual(comment.Comment.Id, reply.Comment.Id);
        Assert.Equal(body, comment.Comment.Body, StringComparer.Ordinal);
        Assert.Equal(body, reply.Comment.Body, StringComparer.Ordinal);

        await using var verify = scope.NewContext();
        var stored = await verify.MomentComments.AsNoTracking()
            .Where(item => item.AuthorUserId == Carol)
            .Select(item => item.Body)
            .ToListAsync();
        Assert.Equal(2, stored.Count);
        Assert.All(stored, text => Assert.Equal(body, text, StringComparer.Ordinal));

        var page = await Comments(verify).GetAsync(world.MomentId, null, null, null);
        Assert.Equal(body, page.Items.Single(item => item.Id == comment.Comment.Id).Body, StringComparer.Ordinal);
        var replies = await Comments(verify).GetRepliesAsync(world.MomentId, world.ParentId, null, null, null);
        Assert.Equal(body, Assert.Single(replies.Items).Body, StringComparer.Ordinal);

        var activity = await verify.OwnerNotifications.AsNoTracking()
            .Where(item => item.ActorUserId == Carol)
            .Select(item => new { item.Type, item.RecipientUserId, item.CommentId })
            .ToListAsync();
        Assert.Contains(activity, item => item.Type == OwnerNotificationType.MomentCommentReplied
            && item.RecipientUserId == Bob
            && item.CommentId == reply.Comment.Id);
        Assert.Contains(activity, item => item.Type == OwnerNotificationType.MomentCommented
            && item.RecipientUserId == Alice);
    }

    [RelationalFact]
    public async Task ARetryIsExactlyTheSameTextNotTextTheCollationCallsEqual()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        var hello = await CreateAsync(scope, new CreateMomentCommentRequest("hello"));
        var helloEmoji = await CreateAsync(scope, new CreateMomentCommentRequest("hello 😎"));
        var capitalHello = await CreateAsync(scope, new CreateMomentCommentRequest("Hello"));
        var one = await CreateAsync(scope, new CreateMomentCommentRequest("😎"));
        var two = await CreateAsync(scope, new CreateMomentCommentRequest("😎😎"));
        var dog = await CreateAsync(scope, new CreateMomentCommentRequest("🐶"));
        var twoAgain = await CreateAsync(scope, new CreateMomentCommentRequest("😎😎"));

        var replyOne = await CreateAsync(scope, new CreateMomentCommentRequest("😎", world.ParentId));
        var replyTwo = await CreateAsync(scope, new CreateMomentCommentRequest("😎😎", world.ParentId));
        var replyTwoAgain = await CreateAsync(scope, new CreateMomentCommentRequest("😎😎", world.ParentId));

        Assert.Equal(6, new[] { hello, helloEmoji, capitalHello, one, two, dog }.Distinct().Count());
        Assert.Equal(two, twoAgain);
        Assert.NotEqual(replyOne, replyTwo);
        Assert.Equal(replyTwo, replyTwoAgain);
        Assert.NotEqual(two, replyTwo);

        await using var verify = scope.NewContext();
        var bodies = await verify.MomentComments.AsNoTracking()
            .Where(item => item.AuthorUserId == Carol)
            .Select(item => item.Body)
            .ToListAsync();
        Assert.Equal(
            ["Hello", "hello", "hello 😎", "🐶", "😎", "😎", "😎😎", "😎😎"],
            bodies.Order(StringComparer.Ordinal));
    }

    [RelationalFact]
    public async Task MentionsBesideEmojiPointAtTheHandleAndNotifyIt()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);

        foreach (var body in new[] { "😎 @ErinHome hello", "@ErinHome 😎 hello", "😎 @ErinHome 😎" })
        {
            foreach (var parentId in new Guid?[] { null, world.ParentId })
            {
                var id = await CreateAsync(scope, new CreateMomentCommentRequest(body, parentId));

                await using var verify = scope.NewContext();
                var mention = await verify.MomentCommentMentions.AsNoTracking().SingleAsync(item => item.CommentId == id);
                Assert.Equal(Erin, mention.MentionedUserId);
                Assert.Equal("@ErinHome", body.Substring(mention.Start, mention.Length));
                Assert.True(await verify.OwnerNotifications.AnyAsync(item =>
                    item.Type == OwnerNotificationType.MomentCommentMentioned
                    && item.RecipientUserId == Erin
                    && item.CommentId == id));
            }
        }
    }

    [RelationalFact]
    public async Task TheLimitIsFiveHundredCodeUnitsAndAnEmojiOnlyCommentRemovesCleanly()
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var world = await SeedAsync(scope);
        var full = string.Concat(Enumerable.Repeat("😎", MomentCommentBodyRules.MaxLength / 2));

        var id = await CreateAsync(scope, new CreateMomentCommentRequest(full, world.ParentId));
        await using (var context = scope.NewContext())
        {
            Assert.Equal(full, (await context.MomentComments.AsNoTracking().SingleAsync(item => item.Id == id)).Body);
            var tooLong = await Assert.ThrowsAsync<ApiException>(() => Comments(context).CreateAsync(
                Carol, world.MomentId, new CreateMomentCommentRequest(full + "a", world.ParentId)));
            Assert.Equal("comment_body_too_long", tooLong.Code);
        }

        await using (var context = scope.NewContext())
        {
            await Comments(context).DeleteAsync(Carol, world.MomentId, id);
        }

        await using var verify = scope.NewContext();
        var removed = await verify.MomentComments.AsNoTracking().SingleAsync(item => item.Id == id);
        Assert.Equal("", removed.Body);
        Assert.NotNull(removed.DeletedAt);
    }

    [RelationalFact]
    public async Task TheDeletionStateCheckStillRefusesAnEmptyLiveRowAndATombstoneWithText()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        var world = await SeedAsync(scope);

        await using (var context = scope.NewContext())
        {
            context.MomentComments.Add(new MomentComment { MomentId = world.MomentId, AuthorUserId = Carol, Body = "" });
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
        }

        await using (var context = scope.NewContext())
        {
            context.MomentComments.Add(new MomentComment
            {
                MomentId = world.MomentId,
                AuthorUserId = Carol,
                Body = "😎",
                DeletedAt = DateTimeOffset.UtcNow,
                DeletedByUserId = Carol
            });
            await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
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

        await using (var context = scope.NewContext())
        {
            var parent = await Comments(context).CreateAsync(Bob, momentId, new CreateMomentCommentRequest("Nice photo!"));
            return new World(momentId, parent.Comment.Id);
        }
    }

    private static async Task<Guid> CreateAsync(RelationalScope scope, CreateMomentCommentRequest request)
    {
        await using var context = scope.NewContext();
        var world = await context.PetMemories.AsNoTracking().Select(item => item.Id).SingleAsync();
        return (await Comments(context).CreateAsync(Carol, world, request)).Comment.Id;
    }

    private static MomentCommentService Comments(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }
}
