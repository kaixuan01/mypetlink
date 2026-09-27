using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests.Relational;

/// <summary>
/// Retargeting unread Comment Activity on real SQL Server, where "newer than
/// the last read row" is a datetimeoffset comparison between a Comment and a
/// notification written in separate transactions.
///
/// Every kind is taken through the same steps: one Comment read, two more
/// unread, the newest removed (the row moves to the middle one), then the
/// middle one removed (the row goes; the read one is never repeated).
///
/// The cast: Alice's Moment; Bob comments; Carol replies to Erin and mentions Bob.
/// </summary>
public sealed class CommentActivityRetargetRelationalTests
{
    private static readonly Guid Alice = Guid.Parse("ea111111-1111-1111-1111-111111111111");
    private static readonly Guid Bob = Guid.Parse("ea222222-2222-2222-2222-222222222222");
    private static readonly Guid Carol = Guid.Parse("ea333333-3333-3333-3333-333333333333");
    private static readonly Guid Erin = Guid.Parse("ea444444-4444-4444-4444-444444444444");
    private static readonly Guid Mochi = Guid.Parse("ea911111-1111-1111-1111-111111111111");

    [RelationalTheory]
    [InlineData("MomentCommented")]
    [InlineData("MomentCommentReplied")]
    [InlineData("MomentCommentMentioned")]
    public async Task AnUnreadRowMovesOnlyToNewsAndNeverRepeatsARow(string kind)
    {
        await using var scope = await RelationalDatabase.CreateAsync(enableRetryOnFailure: true);
        var momentId = await SeedAsync(scope);
        var parent = await CreateAsync(scope, Erin, momentId, "Erin's comment");
        var (actor, recipient, parentId, body) = kind switch
        {
            "MomentCommented" => (Bob, Alice, (Guid?)null, "Hello"),
            "MomentCommentReplied" => (Carol, Erin, parent, "Hello"),
            _ => (Carol, Bob, (Guid?)null, "@BobHome hello")
        };

        var first = await CreateAsync(scope, actor, momentId, body + " 1", parentId);
        await ReadAsync(scope, recipient);
        var second = await CreateAsync(scope, actor, momentId, body + " 2", parentId);
        var third = await CreateAsync(scope, actor, momentId, body + " 3", parentId);
        Assert.Equal([$"{kind}:{third}*", $"{kind}:{first}"], await ActivityAsync(scope, recipient, actor));

        await DeleteAsync(scope, actor, momentId, third);
        Assert.Equal([$"{kind}:{second}*", $"{kind}:{first}"], await ActivityAsync(scope, recipient, actor));

        await DeleteAsync(scope, actor, momentId, second);
        Assert.Equal([$"{kind}:{first}"], await ActivityAsync(scope, recipient, actor));

        await using var verify = scope.NewContext();
        var rows = await verify.OwnerNotifications.AsNoTracking()
            .Where(item => item.RecipientUserId == recipient && item.ActorUserId == actor)
            .ToListAsync();
        var row = Assert.Single(rows);
        Assert.Equal(first, row.CommentId);
        Assert.NotNull(row.ReadAt);
        Assert.Equal(0, (await Notifications(verify).GetUnreadSummaryAsync(recipient)).UnreadCount);
    }

    // ---- world ------------------------------------------------------------------------

    private static async Task<Guid> SeedAsync(RelationalScope scope)
    {
        await using var context = scope.NewContext();
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
        return moment.Id;
    }

    private static async Task<Guid> CreateAsync(
        RelationalScope scope, Guid author, Guid momentId, string body, Guid? parentId = null)
    {
        await using var context = scope.NewContext();
        return (await Comments(context).CreateAsync(
            author, momentId, new CreateMomentCommentRequest(body, parentId))).Comment.Id;
    }

    private static async Task DeleteAsync(RelationalScope scope, Guid actor, Guid momentId, Guid commentId)
    {
        await using var context = scope.NewContext();
        await Comments(context).DeleteAsync(actor, momentId, commentId);
    }

    private static async Task ReadAsync(RelationalScope scope, Guid household)
    {
        await using var context = scope.NewContext();
        await Notifications(context).MarkReadAsync(household, null);
    }

    /// <summary>One actor's rows in a household's Activity, newest first; "*" marks unread.</summary>
    private static async Task<string[]> ActivityAsync(RelationalScope scope, Guid household, Guid actor)
    {
        await using var context = scope.NewContext();
        var page = await Notifications(context).GetAsync(household, null, null);
        Assert.Equal(
            page.Items.Count(item => !item.IsRead),
            (await Notifications(context).GetUnreadSummaryAsync(household)).UnreadCount);
        return page.Items
            .Where(item => item.Actor.Handle == (actor == Bob ? "BobHome" : "CarolHome"))
            .Select(item => $"{item.Type}:{item.CommentId}{(item.IsRead ? "" : "*")}")
            .ToArray();
    }

    private static OwnerNotificationService Notifications(MyPetLinkDbContext context) =>
        new(context, Options.Create(new CloudflareR2Options()));

    private static MomentCommentService Comments(MyPetLinkDbContext context)
    {
        var r2 = Options.Create(new CloudflareR2Options());
        return new MomentCommentService(context, new OwnerNotificationService(context, r2), r2);
    }
}
