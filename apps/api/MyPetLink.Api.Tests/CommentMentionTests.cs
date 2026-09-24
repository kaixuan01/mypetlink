using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Comment @Mentions: resolution when a Comment is written, what may be shown
/// afterwards, the Activity it sends, and the suggestions a commenter sees.
/// </summary>
public sealed class CommentMentionTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;   // @TanFamily, the Moment's author
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;       // @LimFamily, the commenter
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;   // @CarolPets, not discoverable
    private static readonly Guid Dave = SocialSurfaceHarness.DaveId;     // @DavePets, Community off
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;

    private static readonly Guid Erin = Guid.Parse("e1111111-1111-1111-1111-111111111111");
    private static readonly Guid Finn = Guid.Parse("e2222222-2222-2222-2222-222222222222");
    private static readonly Guid Gina = Guid.Parse("e3333333-3333-3333-3333-333333333333");
    private static readonly Guid Hank = Guid.Parse("e4444444-4444-4444-4444-444444444444");

    private const string Mentioned = "MomentCommentMentioned";
    private const string Commented = "MomentCommented";

    [Fact]
    public async Task AMentionNamesTheAccountAndKeepsTheBodyAsWritten()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        const string body = "@CarolPets and @ErinHome look! cc @nobodyhere";

        var created = await Comment(harness, Bob, momentId, body);

        Assert.Equal(body, created.Comment.Body);
        Assert.Equal(
            ["@CarolPets", "@ErinHome"],
            created.Comment.Mentions.Select(span => body.Substring(span.Start, span.Length)).ToArray());
        Assert.Equal(["CarolPets", "ErinHome"], created.Comment.Mentions.Select(span => span.Household.Handle).ToArray());

        // An exact handle reaches a household that is not discoverable: its
        // Community Profile is public by handle already.
        var rows = await harness.Db.MomentCommentMentions.OrderBy(row => row.Start).ToListAsync();
        Assert.Equal([Carol, Erin], rows.Select(row => row.MentionedUserId).ToArray());

        var page = await harness.Comments.GetAsync(momentId, null, null, null);
        Assert.Equal(2, Assert.Single(page.Items).Mentions.Count);
    }

    [Fact]
    public async Task RepeatsUnresolvableHandlesAndTheCapAreDeterministic()
    {
        using var harness = await CreateAsync();
        var households = new List<Guid>();
        for (var index = 1; index <= 6; index += 1)
        {
            var userId = Guid.Parse($"f{index}111111-1111-1111-1111-111111111111");
            households.Add(userId);
            await harness.AddHouseholdAsync(userId, $"House{index}x", $"House {index}", Guid.NewGuid(), $"Pet{index}x");
        }

        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        const string body = "@ghosthouse @house1x @house2x @house1x @house3x @house4x @house5x @house6x";

        var created = await Comment(harness, Bob, momentId, body);

        // The first five distinct households, each at its first occurrence;
        // a handle nobody holds does not use up a place.
        Assert.Equal(
            ["@house1x", "@house2x", "@house3x", "@house4x", "@house5x"],
            created.Comment.Mentions.Select(span => body.Substring(span.Start, span.Length)).ToArray());
        Assert.Equal(body.IndexOf("@house1x", StringComparison.Ordinal), created.Comment.Mentions.First().Start);
        Assert.Equal(CommentMentionRules.MaxMentionsPerComment, await harness.Db.MomentCommentMentions.CountAsync());

        for (var index = 0; index < 5; index += 1)
        {
            Assert.Single(await ActivityAsync(harness, households[index], Mentioned));
        }

        Assert.Empty(await ActivityAsync(harness, households[5], Mentioned));
    }

    [Fact]
    public async Task SelfAndTheMomentsAuthorLinkButAreNotNotifiedTwice()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var created = await Comment(harness, Bob, momentId, "@LimFamily @TanFamily @ErinHome hello");

        Assert.Equal(["LimFamily", "TanFamily", "ErinHome"], created.Comment.Mentions.Select(span => span.Household.Handle).ToArray());
        Assert.Single(await ActivityAsync(harness, Alice, Commented));
        Assert.Empty(await ActivityAsync(harness, Alice, Mentioned));
        Assert.Empty(await ActivityAsync(harness, Bob, Mentioned));
        var erins = Assert.Single(await ActivityAsync(harness, Erin, Mentioned));
        Assert.Equal(momentId, erins.MomentId);
        Assert.Equal(created.Comment.Id, erins.CommentId);
        Assert.Equal("LimFamily", erins.Actor.Handle);

        // The author commenting on their own Moment: no "commented" to
        // themselves, a mention for the household they named.
        await Comment(harness, Alice, momentId, "Thanks @CarolPets!");
        Assert.Single(await ActivityAsync(harness, Alice, Commented));
        Assert.Single(await ActivityAsync(harness, Carol, Mentioned));
    }

    [Fact]
    public async Task HouseholdsThatCannotBeMentionedLookExactlyLikeMissingOnes()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        await harness.AddHouseholdAsync(Gina, "GinaHome", "The Yap Home", Guid.NewGuid(), "Kit");
        await harness.AddHouseholdAsync(Hank, "HankHome", "The Rao Home", Guid.NewGuid(), "Rex");
        (await harness.Db.Users.FindAsync(Gina))!.Status = UserStatus.Suspended;
        (await harness.Db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Hank)).DisplayName = "";
        await harness.Db.SaveChangesAsync();
        await harness.Graph.BlockAsync(Bob, "erinhome", null);
        await harness.Graph.BlockAsync(Finn, "tanfamily", null);

        // Community off, suspended, incomplete, blocked by the commenter,
        // blocking the Moment's author, and nobody at all.
        foreach (var handle in new[] { "DavePets", "GinaHome", "HankHome", "ErinHome", "FinnHome", "NobodyHome" })
        {
            var body = $"hello @{handle}";
            var created = await Comment(harness, Bob, momentId, body);
            Assert.Equal(body, created.Comment.Body);
            Assert.Empty(created.Comment.Mentions);
        }

        Assert.Equal(0, await harness.Db.MomentCommentMentions.CountAsync());
        Assert.Equal(0, await harness.Db.OwnerNotifications.CountAsync(item => item.Type == OwnerNotificationType.MomentCommentMentioned));
    }

    [Fact]
    public async Task ABlockHidesMentionsBothWaysAndUnblockingRestoresWithoutResending()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var created = await Comment(harness, Bob, momentId, "look @ErinHome");
        var commentId = created.Comment.Id;
        Assert.Single(await ActivityAsync(harness, Erin, Mentioned));

        // The mentioned household blocks the commenter: the link goes for
        // everybody and so does the Activity.
        await harness.Graph.BlockAsync(Erin, "limfamily", null);
        Assert.Empty(await LinkedHandlesAsync(harness, momentId, commentId, null));
        Assert.Empty(await ActivityAsync(harness, Erin, Mentioned));
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Erin)).UnreadCount);

        // Nothing new resolves across it.
        var later = await Comment(harness, Bob, momentId, "again @ErinHome");
        Assert.Empty(later.Comment.Mentions);

        await harness.Graph.UnblockAsync(Erin, "limfamily");
        Assert.Equal(["ErinHome"], await LinkedHandlesAsync(harness, momentId, commentId, null));
        Assert.Empty(await LinkedHandlesAsync(harness, momentId, later.Comment.Id, null));
        var restored = Assert.Single(await ActivityAsync(harness, Erin, Mentioned));
        Assert.Equal(commentId, restored.CommentId);
        Assert.Equal(1, await harness.Db.OwnerNotifications.CountAsync(item => item.Type == OwnerNotificationType.MomentCommentMentioned));

        // A block between the mentioned household and the Moment's author
        // hides it too, and a viewer on either side of a block with the
        // mentioned household sees the text without the link.
        await harness.Graph.BlockAsync(Erin, "tanfamily", null);
        Assert.Empty(await LinkedHandlesAsync(harness, momentId, commentId, null));
        await harness.Graph.UnblockAsync(Erin, "tanfamily");
        await harness.Graph.BlockAsync(Carol, "erinhome", null);
        Assert.Empty(await LinkedHandlesAsync(harness, momentId, commentId, Carol));
        Assert.Equal(["ErinHome"], await LinkedHandlesAsync(harness, momentId, commentId, null));
    }

    [Fact]
    public async Task LeavingCommunityTurnsAMentionIntoPlainTextUntilTheHouseholdReturns()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var created = await Comment(harness, Bob, momentId, "look @ErinHome");

        await harness.SetOwnerSocialAsync(Erin, false);
        Assert.Empty(await LinkedHandlesAsync(harness, momentId, created.Comment.Id, null));

        await harness.SetOwnerSocialAsync(Erin, true);
        (await harness.Db.Users.FindAsync(Erin))!.Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();
        Assert.Empty(await LinkedHandlesAsync(harness, momentId, created.Comment.Id, null));

        (await harness.Db.Users.FindAsync(Erin))!.Status = UserStatus.Active;
        await harness.Db.SaveChangesAsync();
        Assert.Equal(["ErinHome"], await LinkedHandlesAsync(harness, momentId, created.Comment.Id, null));
        Assert.Equal("look @ErinHome", (await harness.Comments.GetAsync(momentId, null, null, null)).Items.Single().Body);
    }

    [Fact]
    public async Task ARenamedHandleNeverRelinksOldTextToItsNextHolder()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var created = await Comment(harness, Bob, momentId, "Thanks @ErinHome");

        // Erin renames; months later a stranger ends up holding the old handle.
        var erin = await harness.Db.OwnerSocialProfiles.SingleAsync(profile => profile.UserId == Erin);
        erin.Handle = "ErinNewHome";
        erin.NormalizedHandle = "erinnewhome";
        await harness.Db.SaveChangesAsync();
        await harness.AddHouseholdAsync(Gina, "ErinHome", "A Different Home", Guid.NewGuid(), "Kit");

        var page = await harness.Comments.GetAsync(momentId, null, null, null);
        var comment = Assert.Single(page.Items);
        var span = Assert.Single(comment.Mentions);
        Assert.Equal("Thanks @ErinHome", comment.Body);
        Assert.Equal("@ErinHome", comment.Body.Substring(span.Start, span.Length));
        Assert.Equal("ErinNewHome", span.Household.Handle);
        Assert.Equal(Erin, (await harness.Db.MomentCommentMentions.SingleAsync()).MentionedUserId);
        Assert.Empty(await ActivityAsync(harness, Gina, Mentioned));

        // A new Comment typing the old handle means whoever holds it now.
        var fresh = await Comment(harness, Bob, momentId, "Hi @ErinHome");
        Assert.Equal("ErinHome", Assert.Single(fresh.Comment.Mentions).Household.Handle);
        Assert.Equal("A Different Home", fresh.Comment.Mentions.Single().Household.DisplayName);
    }

    [Fact]
    public async Task DeletingOrRemovingACommentTakesItsMentionsAndUnreadActivityWithIt()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var first = await Comment(harness, Bob, momentId, "one @ErinHome");
        var second = await Comment(harness, Bob, momentId, "two @ErinHome");

        // Coalesced: one unread line, pointing at the newest mention.
        Assert.Equal(second.Comment.Id, Assert.Single(await ActivityAsync(harness, Erin, Mentioned)).CommentId);

        await harness.Comments.DeleteAsync(Bob, momentId, second.Comment.Id);
        Assert.Equal(first.Comment.Id, Assert.Single(await ActivityAsync(harness, Erin, Mentioned)).CommentId);
        Assert.Equal(1, await harness.Db.MomentCommentMentions.CountAsync());

        // The Moment's author removing it works the same way.
        await harness.Comments.DeleteAsync(Alice, momentId, first.Comment.Id);
        Assert.Empty(await ActivityAsync(harness, Erin, Mentioned));
        Assert.Equal(0, await harness.Db.MomentCommentMentions.CountAsync());
        Assert.Equal(0, await harness.Db.OwnerNotifications.CountAsync(item => item.Type == OwnerNotificationType.MomentCommentMentioned));
    }

    [Fact]
    public async Task ReadActivityForADeletedCommentShowsNothing()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var created = await Comment(harness, Bob, momentId, "look @ErinHome");
        await harness.Notifications.MarkReadAsync(Erin, new MarkNotificationsReadRequest(null));

        await harness.Comments.DeleteAsync(Bob, momentId, created.Comment.Id);

        Assert.Empty(await ActivityAsync(harness, Erin, Mentioned));
        // Read history is kept, never shown.
        Assert.Equal(1, await harness.Db.OwnerNotifications.CountAsync(item => item.Type == OwnerNotificationType.MomentCommentMentioned));
    }

    [Fact]
    public async Task MentionActivityCoalescesPerCommenterAndMomentUntilRead()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var otherMoment = await harness.AddMomentAsync(Alice, Mochi, "Park", 20);

        await Comment(harness, Bob, momentId, "a @ErinHome");
        await Comment(harness, Bob, momentId, "b @ErinHome");
        await Comment(harness, Bob, otherMoment, "c @ErinHome");
        await Comment(harness, Carol, momentId, "d @ErinHome");
        Assert.Equal(3, (await ActivityAsync(harness, Erin, Mentioned)).Length);

        await harness.Notifications.MarkReadAsync(Erin, new MarkNotificationsReadRequest(null));
        await Comment(harness, Bob, momentId, "e @ErinHome");
        Assert.Equal(4, (await ActivityAsync(harness, Erin, Mentioned)).Length);
    }

    [Fact]
    public async Task ARetriedCommentMentionsAndNotifiesOnce()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var first = await Comment(harness, Bob, momentId, "look @ErinHome");
        var retry = await Comment(harness, Bob, momentId, "look @ErinHome");

        Assert.Equal(first.Comment.Id, retry.Comment.Id);
        Assert.Single(retry.Comment.Mentions);
        Assert.Equal(1, await harness.Db.MomentCommentMentions.CountAsync());
        Assert.Single(await ActivityAsync(harness, Erin, Mentioned));
    }

    [Fact]
    public async Task SuggestionsFollowTheMomentFirstAndNeverRevealAHiddenHousehold()
    {
        using var harness = await CreateAsync();
        await harness.AddHouseholdAsync(Gina, "GinaHome", "Gina's Home", Guid.NewGuid(), "Kit");
        await harness.AddHouseholdAsync(Hank, "HankHome", "Hank's Home", Guid.NewGuid(), "Rex", discoverable: false);
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        // Erin collaborates; Finn has commented; Bob follows Carol, who is not
        // discoverable.
        var erinsPet = await harness.Db.Pets.Where(pet => pet.OwnerUserId == Erin).Select(pet => pet.Slug).SingleAsync();
        var invited = await harness.Collaborations.InviteAsync(Alice, momentId, new CreateMomentCollaborationRequest("erinhome", [erinsPet]));
        await harness.Collaborations.AcceptAsync(Erin, invited.Items.Single().Id, new AcceptMomentCollaborationRequest([erinsPet]));
        await Comment(harness, Finn, momentId, "So cute");
        await harness.FollowAsync(Bob, "carolpets");

        var context = await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, null);
        Assert.Equal(
            ["TanFamily:author", "ErinHome:collaborator", "FinnHome:commenter", "CarolPets:following"],
            context.Items.Select(item => $"{item.Household.Handle}:{item.Context}").ToArray());

        // Anybody else only once there is enough to search, and only if
        // discoverable. Hank is not, so even his exact handle finds nothing.
        Assert.DoesNotContain(context.Items, item => item.Household.Handle is "GinaHome" or "HankHome");
        Assert.Equal(["GinaHome:discoverable"], (await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, "gi")).Items
            .Select(item => $"{item.Household.Handle}:{item.Context}").ToArray());
        Assert.Empty((await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, "@hankhome")).Items);
        Assert.Equal(["CarolPets:following"], (await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, "@car")).Items
            .Select(item => $"{item.Household.Handle}:{item.Context}").ToArray());

        // Never yourself, never Community-off, never across a block.
        Assert.Empty((await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, "lim")).Items);
        Assert.Empty((await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, "dave")).Items);
        await harness.Graph.BlockAsync(Finn, "limfamily", null);
        Assert.DoesNotContain((await harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, null)).Items,
            item => item.Household.Handle == "FinnHome");
    }

    [Fact]
    public async Task SuggestionsNeedASignedInCommenterWhoCanSeeTheMoment()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var anonymous = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetMentionSuggestionsAsync(null, momentId, null));
        Assert.Equal(StatusCodes.Status401Unauthorized, anonymous.StatusCode);

        var noProfile = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetMentionSuggestionsAsync(Dave, momentId, null));
        Assert.Equal("community_profile_required", noProfile.Code);

        await harness.Graph.BlockAsync(Alice, "limfamily", null);
        var blocked = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Comments.GetMentionSuggestionsAsync(Bob, momentId, null));
        Assert.Equal(StatusCodes.Status404NotFound, blocked.StatusCode);
    }

    [Fact]
    public async Task AMentionChangesNothingOutsideTheConversation()
    {
        using var harness = await CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var erinsPet = await harness.Db.Pets.Where(pet => pet.OwnerUserId == Erin).SingleAsync();
        var shareBefore = System.Text.Json.JsonSerializer.Serialize(await harness.PetShareProfiles.GetByPublicSlugAsync(erinsPet.Slug));

        await Comment(harness, Bob, momentId, "look @ErinHome");

        Assert.Equal(shareBefore, System.Text.Json.JsonSerializer.Serialize(await harness.PetShareProfiles.GetByPublicSlugAsync(erinsPet.Slug)));
        Assert.Equal(0, await harness.Db.MomentCollaborations.CountAsync());
        Assert.Equal(1, await harness.Db.MomentPets.CountAsync(item => item.MomentId == momentId));
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == erinsPet.Id));
    }

    // ---- helpers ----------------------------------------------------------

    private static async Task<SocialSurfaceHarness> CreateAsync()
    {
        var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Erin, "ErinHome", "The Ong Home", Guid.NewGuid(), "Pip");
        await harness.AddHouseholdAsync(Finn, "FinnHome", "The Koh Home", Guid.NewGuid(), "Tofu");
        return harness;
    }

    private static Task<CreateMomentCommentResponse> Comment(
        SocialSurfaceHarness harness, Guid actorId, Guid momentId, string body) =>
        harness.Comments.CreateAsync(actorId, momentId, new CreateMomentCommentRequest(body));

    private static async Task<string[]> LinkedHandlesAsync(
        SocialSurfaceHarness harness, Guid momentId, Guid commentId, Guid? viewerId)
    {
        harness.Db.ChangeTracker.Clear();
        var page = await harness.Comments.GetAsync(momentId, viewerId, null, 50);
        var comment = page.Items.Single(item => item.Id == commentId);
        return comment.Mentions.Select(span => span.Household.Handle).ToArray();
    }

    private static async Task<OwnerNotificationResponse[]> ActivityAsync(
        SocialSurfaceHarness harness, Guid recipientId, string type)
    {
        harness.Db.ChangeTracker.Clear();
        var page = await harness.Notifications.GetAsync(recipientId, null, 50);
        return page.Items.Where(item => item.Type == type).ToArray();
    }
}
