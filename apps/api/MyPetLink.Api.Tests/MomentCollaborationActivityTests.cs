using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Collaboration activity: an invitation shows only while it can be answered,
/// a join only while it stands, and nothing else about a collaboration — no
/// decline, revoke, leave or expiry notice — ever reaches anybody.
/// </summary>
public sealed class MomentCollaborationActivityTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Rex = Guid.Parse("c6111111-1111-1111-1111-111111111111");

    [Fact]
    public async Task AnInvitationReachesTheInviteeNamingTheRequestedPets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddPetAsync(Bob, Rex, "Rex");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Collaborations.InviteAsync(Alice, momentId, new("limfamily", ["buddy-pubbuddy", "pubrex"]));

        var page = await harness.Notifications.GetAsync(Bob, null, null);
        var item = Assert.Single(page.Items);
        Assert.Equal("MomentCollaborationRequested", item.Type);
        Assert.Equal("TanFamily", item.Actor.Handle);
        Assert.Equal(momentId, item.MomentId);
        Assert.Equal(new[] { "Buddy", "Rex" }, item.CollaborationPetNames);
        Assert.Equal(1, page.UnreadCount);
        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
    }

    [Fact]
    public async Task AcceptingReplacesTheInvitationWithAJoinForTheAuthor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddPetAsync(Bob, Rex, "Rex");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAsync(harness, momentId, "buddy-pubbuddy", "pubrex");

        // Bob has already seen the invitation; read history must not linger
        // as an actionable invitation once it is answered either.
        await harness.Notifications.MarkReadAsync(Bob, new MarkNotificationsReadRequest(null));
        await harness.Collaborations.AcceptAsync(Bob, collaborationId, new(["pubrex"]));

        Assert.Empty((await harness.Notifications.GetAsync(Bob, null, null)).Items);
        var joined = Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items);
        Assert.Equal("MomentCollaborationAccepted", joined.Type);
        Assert.Equal("LimFamily", joined.Actor.Handle);
        Assert.Equal(new[] { "Rex" }, joined.CollaborationPetNames);
    }

    [Fact]
    public async Task DeclineRevokeAndLeaveNotifyNobodyAndClearWhatTheyEnd()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var declined = await harness.AddMomentAsync(Alice, Mochi, "Declined", 10);
        var revoked = await harness.AddMomentAsync(Alice, Mochi, "Revoked", 11);
        var left = await harness.AddMomentAsync(Alice, Mochi, "Left", 12);

        await harness.Collaborations.DeclineAsync(Bob, await InviteAsync(harness, declined, "buddy-pubbuddy"));

        var revokedId = await InviteAsync(harness, revoked, "buddy-pubbuddy");
        await harness.Collaborations.RevokeAsync(Alice, revoked, revokedId);

        var leftId = await InviteAsync(harness, left, "buddy-pubbuddy");
        await harness.Collaborations.AcceptAsync(Bob, leftId, new(["buddy-pubbuddy"]));
        Assert.Single((await harness.Notifications.GetAsync(Alice, null, null)).Items);
        await harness.Collaborations.LeaveAsync(Bob, leftId);

        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
        Assert.Empty((await harness.Notifications.GetAsync(Bob, null, null)).Items);
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Alice)).UnreadCount);
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Bob)).UnreadCount);
    }

    [Fact]
    public async Task AnInvitationThatCanNoLongerBeAnsweredDisappears()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var expired = await harness.AddMomentAsync(Alice, Mochi, "Expired", 10);
        var hidden = await harness.AddMomentAsync(Alice, Mochi, "Hidden", 11);
        await InviteAsync(harness, expired, "buddy-pubbuddy");
        await InviteAsync(harness, hidden, "buddy-pubbuddy");
        Assert.Equal(2, (await harness.Notifications.GetUnreadSummaryAsync(Bob)).UnreadCount);

        var pending = await harness.Db.MomentCollaborations.SingleAsync(item => item.MomentId == expired);
        pending.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        (await harness.Db.PetMemories.FindAsync(hidden))!.Visibility = MemoryVisibility.Private;
        await harness.Db.SaveChangesAsync();

        var page = await harness.Notifications.GetAsync(Bob, null, null);
        Assert.Empty(page.Items);
        Assert.Equal(0, page.UnreadCount);
        Assert.Equal(0, (await harness.Notifications.GetUnreadSummaryAsync(Bob)).UnreadCount);
    }

    [Fact]
    public async Task ABlockTakesCollaborationActivityWithIt()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var pending = await harness.AddMomentAsync(Alice, Mochi, "Pending", 10);
        var joined = await harness.AddMomentAsync(Alice, Mochi, "Joined", 11);
        await InviteAsync(harness, pending, "buddy-pubbuddy");
        await harness.Collaborations.AcceptAsync(Bob, await InviteAsync(harness, joined, "buddy-pubbuddy"), new(["buddy-pubbuddy"]));

        await harness.Graph.BlockAsync(Alice, "limfamily", null);
        await harness.Graph.UnblockAsync(Alice, "limfamily");

        Assert.Empty((await harness.Notifications.GetAsync(Alice, null, null)).Items);
        Assert.Empty((await harness.Notifications.GetAsync(Bob, null, null)).Items);
        Assert.False(await harness.Db.OwnerNotifications.AnyAsync(item =>
            item.CollaborationId != null && item.ReadAt == null));
    }

    private static async Task<Guid> InviteAsync(SocialSurfaceHarness harness, Guid momentId, params string[] pets)
    {
        var list = await harness.Collaborations.InviteAsync(Alice, momentId, new("limfamily", pets));
        return list.Items.Single(item => item.Status == "Pending").Id;
    }
}
