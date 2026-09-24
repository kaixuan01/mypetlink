using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The Moment collaboration lifecycle: who may invite whom and with which
/// pets, what accepting / declining / revoking / leaving does, and that no step
/// ever associates a pet its owner has not accepted.
/// </summary>
public sealed class MomentCollaborationTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Dave = SocialSurfaceHarness.DaveId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;

    private static readonly Guid Rex = Guid.Parse("c6111111-1111-1111-1111-111111111111");
    private static readonly Guid Eve = Guid.Parse("c7111111-1111-1111-1111-111111111111");
    private static readonly Guid Pip = Guid.Parse("c7222222-2222-2222-2222-222222222222");
    private static readonly Guid Finn = Guid.Parse("c8111111-1111-1111-1111-111111111111");
    private static readonly Guid Tofu = Guid.Parse("c8222222-2222-2222-2222-222222222222");
    private static readonly Guid Gus = Guid.Parse("c9111111-1111-1111-1111-111111111111");
    private static readonly Guid Olive = Guid.Parse("c9222222-2222-2222-2222-222222222222");

    // ---- invite ----------------------------------------------------------

    [Fact]
    public async Task InvitingCreatesAPendingInvitationAndNoPublicAssociation()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var list = await harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "buddy-pubbuddy"));

        var item = Assert.Single(list.Items);
        Assert.Equal("author", list.ViewerRole);
        Assert.Equal("Pending", item.Status);
        Assert.Equal("LimFamily", item.Household.Handle);
        Assert.Equal("Buddy", Assert.Single(item.Pets).Name);
        Assert.False(item.Pets.Single().IsAccepted);
        Assert.Equal(item.CreatedAt.AddDays(14), item.ExpiresAt);
        Assert.False(await harness.Db.MomentPets.AnyAsync(row => row.PetId == Buddy));
    }

    [Fact]
    public async Task AnInvitationCanAskAboutSeveralPetsOfOneHousehold()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddPetAsync(Bob, Rex, "Rex");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var list = await harness.Collaborations.InviteAsync(
            Alice, momentId, Invite("limfamily", "buddy-pubbuddy", "pubrex"));

        Assert.Equal(new[] { "Buddy", "Rex" }, Assert.Single(list.Items).Pets.Select(pet => pet.Name));
    }

    [Fact]
    public async Task UpToThreeHouseholdsMayBeLiveAndAFourthIsRefused()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Eve, "EveHome", "Eve's Home", Pip, "Pip");
        await harness.AddHouseholdAsync(Finn, "FinnFamily", "The Finn Family", Tofu, "Tofu");
        await harness.AddHouseholdAsync(Gus, "GusHouse", "Gus House", Olive, "Olive");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        await harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "buddy-pubbuddy"));
        await harness.Collaborations.InviteAsync(Alice, momentId, Invite("evehome", "pubpip"));
        var third = await harness.Collaborations.InviteAsync(Alice, momentId, Invite("finnfamily", "pubtofu"));

        Assert.Equal(3, third.LiveHouseholds);
        Assert.False(third.CanInvite);
        Assert.Equal("limit-reached", third.InviteUnavailableReason);

        var fourth = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("gushouse", "pubolive")));
        Assert.Equal("collaboration_limit_reached", fourth.Code);

        // An expired invitation no longer counts.
        await ExpireAsync(harness, momentId, Eve);
        var afterExpiry = await harness.Collaborations.InviteAsync(Alice, momentId, Invite("gushouse", "pubolive"));
        Assert.Equal(3, afterExpiry.LiveHouseholds);
        Assert.Contains(afterExpiry.Items, item => item.Household.Handle == "EveHome" && item.Status == "Expired");
    }

    [Fact]
    public async Task InvitationsRefuseSelfOtherHouseholdsPetsAndUnsharedPets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddPetAsync(Bob, Rex, "Rex", social: false);
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        var self = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("tanfamily", "mochi-pubmochi")));
        Assert.Equal("collaboration_self", self.Code);

        // Carol's pet named on Bob's invitation: ownership is resolved on the
        // server, never taken from the request.
        var foreign = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "shy-pubshy")));
        Assert.Equal("collaboration_pet_unavailable", foreign.Code);

        var unshared = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "pubrex")));
        Assert.Equal("collaboration_pet_unavailable", unshared.Code);

        var empty = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily")));
        Assert.Equal("collaboration_pets_required", empty.Code);
        Assert.False(await harness.Db.MomentCollaborations.AnyAsync());
    }

    [Fact]
    public async Task IneligibleBlockedAndMissingHouseholdsAreIndistinguishable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        harness.Db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Carol, BlockedUserId = Alice });
        (await harness.Db.Users.FindAsync(Bob))!.Status = UserStatus.Suspended;
        await harness.Db.SaveChangesAsync();

        var answers = new List<(string Code, string Message, int Status)>();
        foreach (var (handle, slug) in new[]
        {
            ("nobodyhere", "x-pubx"),        // no such household
            ("davepets", "hidden-pubhidden"), // Community off
            ("limfamily", "buddy-pubbuddy"),  // account suspended
            ("carolpets", "shy-pubshy"),      // blocked the author
        })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() =>
                harness.Collaborations.InviteAsync(Alice, momentId, Invite(handle, slug)));
            answers.Add((error.Code, error.Message, error.StatusCode));
        }

        Assert.Single(answers.Distinct());
        Assert.Equal("collaboration_household_unavailable", answers[0].Code);
    }

    [Fact]
    public async Task OnlyPublicCommunityMomentsOfTheirAuthorCanInvite()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var privateMoment = await harness.AddMomentAsync(Alice, Mochi, "Private", 10, MemoryVisibility.Private);
        var archived = await harness.AddMomentAsync(Alice, Mochi, "Archived", 11, archived: true);
        var bobsMoment = await harness.AddMomentAsync(Bob, Buddy, "Bob's", 12);

        foreach (var momentId in new[] { privateMoment, archived })
        {
            var error = await Assert.ThrowsAsync<ApiException>(() =>
                harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "buddy-pubbuddy")));
            Assert.Equal("collaboration_moment_not_public", error.Code);
        }

        var notAuthor = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, bobsMoment, Invite("carolpets", "shy-pubshy")));
        Assert.Equal("social_moment_not_found", notAuthor.Code);
    }

    [Fact]
    public async Task DuplicateLiveInvitationsAndPerHouseholdPendingAreCapped()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var moments = new List<Guid>();
        for (var index = 0; index < 4; index += 1)
        {
            moments.Add(await harness.AddMomentAsync(Alice, Mochi, $"Moment {index}", 10 + index));
        }

        await harness.Collaborations.InviteAsync(Alice, moments[0], Invite("limfamily", "buddy-pubbuddy"));
        var duplicate = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, moments[0], Invite("limfamily", "buddy-pubbuddy")));
        Assert.Equal("collaboration_already_invited", duplicate.Code);

        await harness.Collaborations.InviteAsync(Alice, moments[1], Invite("limfamily", "buddy-pubbuddy"));
        await harness.Collaborations.InviteAsync(Alice, moments[2], Invite("limfamily", "buddy-pubbuddy"));
        var fourthForBob = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, moments[3], Invite("limfamily", "buddy-pubbuddy")));
        Assert.Equal("collaboration_household_pending_limit", fourthForBob.Code);
    }

    [Fact]
    public async Task ADailyInvitationCapStopsBulkInviting()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var otherMoment = await harness.AddMomentAsync(Alice, Mochi, "Other", 11);
        var now = DateTimeOffset.UtcNow;
        for (var index = 0; index < MomentCollaborationService.MaxInvitationsPerDay; index += 1)
        {
            harness.Db.MomentCollaborations.Add(new MomentCollaboration
            {
                MomentId = otherMoment,
                InviterUserId = Alice,
                InviteeUserId = Carol,
                Status = MomentCollaborationStatus.Revoked,
                CreatedAt = now.AddMinutes(-index),
                ExpiresAt = now.AddDays(14),
                EndedAt = now
            });
        }
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "buddy-pubbuddy")));
        Assert.Equal("collaboration_daily_limit", error.Code);
        Assert.Equal(StatusCodes.Status429TooManyRequests, error.StatusCode);
    }

    [Fact]
    public async Task ReinvitingFollowsTheEndingThatCameBefore()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Eve, "EveHome", "Eve's Home", Pip, "Pip");
        await harness.AddHouseholdAsync(Finn, "FinnFamily", "The Finn Family", Tofu, "Tofu");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);

        // Declined: never again for this Moment.
        var declined = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");
        await harness.Collaborations.DeclineAsync(Bob, declined);
        Assert.Equal("collaboration_reinvite_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("limfamily", "buddy-pubbuddy")))).Code);

        // Left: never again for this Moment.
        var left = await InviteAndGetIdAsync(harness, momentId, "evehome", "pubpip");
        await harness.Collaborations.AcceptAsync(Eve, left, Accept("pubpip"));
        await harness.Collaborations.LeaveAsync(Eve, left);
        Assert.Equal("collaboration_reinvite_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("evehome", "pubpip")))).Code);

        // Revoked by the author, or expired: the author may ask again.
        var revoked = await InviteAndGetIdAsync(harness, momentId, "finnfamily", "pubtofu");
        await harness.Collaborations.RevokeAsync(Alice, momentId, revoked);
        await harness.Collaborations.InviteAsync(Alice, momentId, Invite("finnfamily", "pubtofu"));
        await ExpireAsync(harness, momentId, Finn);
        var again = await harness.Collaborations.InviteAsync(Alice, momentId, Invite("finnfamily", "pubtofu"));
        Assert.Contains(again.Items, item => item.Household.Handle == "FinnFamily" && item.Status == "Pending");

        // A different Moment is a different question.
        var otherMoment = await harness.AddMomentAsync(Alice, Mochi, "Another day", 11);
        await harness.Collaborations.InviteAsync(Alice, otherMoment, Invite("limfamily", "buddy-pubbuddy"));
    }

    // ---- canonical author ------------------------------------------------

    [Fact]
    public async Task CollaborationAuthorityFollowsTheAuthorNotThePrimaryPetsOwner()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        // Mochi moves to Carol. She now owns the primary pet but did not
        // write the Moment: she gains no author view and no collaboration
        // controls.
        (await harness.Db.Pets.FindAsync(Mochi))!.OwnerUserId = Carol;
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Carol, momentId, Invite("limfamily", "buddy-pubbuddy")));
        var carolRevoke = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.RevokeAsync(Carol, momentId, collaborationId));
        Assert.Equal("social_moment_not_found", carolRevoke.Code);

        // Alice still sees and may withdraw what she started, but no longer
        // manages the Moment, so she may not invite anybody new.
        var aliceView = await harness.Collaborations.GetForMomentAsync(Alice, momentId);
        Assert.Equal("author", aliceView.ViewerRole);
        Assert.False(aliceView.CanInvite);
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.InviteAsync(Alice, momentId, Invite("carolpets", "shy-pubshy")));
        var revoked = await harness.Collaborations.RevokeAsync(Alice, momentId, collaborationId);
        Assert.Equal("Revoked", Assert.Single(revoked.Items).Status);
    }

    // ---- accept / decline --------------------------------------------------

    [Fact]
    public async Task AcceptingAllRequestedPetsAssociatesThemThroughTheCollaboration()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        var list = await harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy"));

        Assert.Equal("invitee", list.ViewerRole);
        Assert.Equal("Accepted", Assert.Single(list.Items).Status);
        var row = await harness.Db.MomentPets.SingleAsync(item => item.PetId == Buddy);
        Assert.Equal(collaborationId, row.CollaborationId);
        Assert.Equal(momentId, row.MomentId);
    }

    [Fact]
    public async Task AnInviteeMayAcceptOnlySomeOfTheRequestedPets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddPetAsync(Bob, Rex, "Rex");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy", "pubrex");

        var list = await harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("pubrex"));

        var pets = Assert.Single(list.Items).Pets;
        Assert.True(pets.Single(pet => pet.Name == "Rex").IsAccepted);
        Assert.False(pets.Single(pet => pet.Name == "Buddy").IsAccepted);
        Assert.Equal(
            new[] { Rex },
            await harness.Db.MomentPets.Where(item => item.CollaborationId == collaborationId)
                .Select(item => item.PetId).ToListAsync());
    }

    [Fact]
    public async Task AcceptRefusesAnEmptyOrUnrequestedSelection()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddPetAsync(Bob, Rex, "Rex");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        Assert.Equal("collaboration_pets_required", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept()))).Code);
        Assert.Equal("collaboration_pet_not_requested", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("pubrex")))).Code);
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.CollaborationId == collaborationId));
    }

    [Fact]
    public async Task AcceptingTwiceChangesNothingTheSecondTime()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        await harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy"));
        var again = await harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy"));

        Assert.Equal("Accepted", Assert.Single(again.Items).Status);
        Assert.Single(await harness.Db.MomentPets.Where(item => item.PetId == Buddy).ToListAsync());
    }

    [Fact]
    public async Task OnlyTheInviteeCanRespondAndStrangersSeeNothing()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        foreach (var attempt in new Func<Task>[]
        {
            () => harness.Collaborations.AcceptAsync(Carol, collaborationId, Accept("buddy-pubbuddy")),
            () => harness.Collaborations.DeclineAsync(Carol, collaborationId),
            () => harness.Collaborations.LeaveAsync(Carol, collaborationId),
            () => harness.Collaborations.AcceptAsync(Alice, collaborationId, Accept("buddy-pubbuddy")),
        })
        {
            Assert.Equal("collaboration_not_found", (await Assert.ThrowsAsync<ApiException>(attempt)).Code);
        }

        var stranger = await harness.Collaborations.GetForMomentAsync(Carol, momentId);
        Assert.Equal("none", stranger.ViewerRole);
        Assert.Empty(stranger.Items);
        Assert.Equal("Pending", (await harness.Db.MomentCollaborations.SingleAsync()).Status.ToString());
    }

    [Fact]
    public async Task ExpiredBlockedHiddenAndIneligibleInvitationsCannotBeAccepted()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var moments = new List<Guid>();
        var invitations = new List<Guid>();
        for (var index = 0; index < 3; index += 1)
        {
            var momentId = await harness.AddMomentAsync(Alice, Mochi, $"Moment {index}", 10 + index);
            moments.Add(momentId);
            invitations.Add(await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy"));
        }

        // Expired.
        await ExpireAsync(harness, moments[0], Bob);
        Assert.Equal("collaboration_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, invitations[0], Accept("buddy-pubbuddy")))).Code);

        // The Moment stopped being public.
        (await harness.Db.PetMemories.FindAsync(moments[1]))!.Visibility = MemoryVisibility.Private;
        await harness.Db.SaveChangesAsync();
        Assert.Equal("collaboration_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, invitations[1], Accept("buddy-pubbuddy")))).Code);

        // The pet is no longer shared.
        (await harness.Db.PetSocialProfiles.SingleAsync(item => item.PetId == Buddy)).IsSocialEnabled = false;
        await harness.Db.SaveChangesAsync();
        Assert.Equal("collaboration_pet_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, invitations[2], Accept("buddy-pubbuddy")))).Code);

        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.CollaborationId != null));
    }

    [Fact]
    public async Task ABlockStandingBetweenThemStopsAnAccept()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");
        harness.Db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Alice, BlockedUserId = Bob });
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy")));
        Assert.Equal("collaboration_unavailable", error.Code);
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Buddy));
    }

    [Fact]
    public async Task DecliningIsQuietFinalAndAssociatesNothing()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        await harness.Collaborations.DeclineAsync(Bob, collaborationId);
        await harness.Collaborations.DeclineAsync(Bob, collaborationId);

        var stored = await harness.Db.MomentCollaborations.SingleAsync();
        Assert.Equal(MomentCollaborationStatus.Declined, stored.Status);
        Assert.NotNull(stored.RespondedAt);
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Buddy));
        Assert.Equal("collaboration_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy")))).Code);
        // The author learns privately, in their own list.
        Assert.Equal("Declined", Assert.Single(
            (await harness.Collaborations.GetForMomentAsync(Alice, momentId)).Items).Status);
    }

    // ---- revoke / leave ----------------------------------------------------

    [Fact]
    public async Task RevokingRemovesOnlyThatHouseholdsPets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Eve, "EveHome", "Eve's Home", Pip, "Pip");
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var bobs = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");
        var eves = await InviteAndGetIdAsync(harness, momentId, "evehome", "pubpip");
        await harness.Collaborations.AcceptAsync(Bob, bobs, Accept("buddy-pubbuddy"));
        await harness.Collaborations.AcceptAsync(Eve, eves, Accept("pubpip"));

        var list = await harness.Collaborations.RevokeAsync(Alice, momentId, bobs);

        Assert.Equal("Revoked", list.Items.Single(item => item.Id == bobs).Status);
        Assert.Equal("Accepted", list.Items.Single(item => item.Id == eves).Status);
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Buddy));
        Assert.True(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Pip));
        Assert.True(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Mochi && item.CollaborationId == null));
        // History stays.
        Assert.True(await harness.Db.MomentCollaborationPets.AnyAsync(item => item.CollaborationId == bobs && item.IsAccepted));
    }

    [Fact]
    public async Task RevokingAPendingInvitationWithdrawsIt()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        await harness.Collaborations.RevokeAsync(Alice, momentId, collaborationId);

        Assert.Equal("collaboration_unavailable", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy")))).Code);
        Assert.Equal("none", (await harness.Collaborations.GetForMomentAsync(Bob, momentId)).ViewerRole);
    }

    [Fact]
    public async Task OnlyTheAuthorCanRevokeAndOnlyTheInviteeCanLeave()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");
        await harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy"));

        Assert.Equal("social_moment_not_found", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.RevokeAsync(Bob, momentId, collaborationId))).Code);
        Assert.Equal("social_moment_not_found", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.RevokeAsync(Carol, momentId, collaborationId))).Code);
        Assert.Equal("collaboration_not_found", (await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.LeaveAsync(Alice, collaborationId))).Code);
        Assert.True(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Buddy));
    }

    [Fact]
    public async Task LeavingRemovesTheHouseholdsPetsAndKeepsTheMoment()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        var notJoined = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Collaborations.LeaveAsync(Bob, collaborationId));
        Assert.Equal("collaboration_not_joined", notJoined.Code);

        await harness.Collaborations.AcceptAsync(Bob, collaborationId, Accept("buddy-pubbuddy"));
        await harness.Collaborations.LeaveAsync(Bob, collaborationId);
        await harness.Collaborations.LeaveAsync(Bob, collaborationId);

        Assert.Equal(MomentCollaborationStatus.Left, (await harness.Db.MomentCollaborations.SingleAsync()).Status);
        Assert.False(await harness.Db.MomentPets.AnyAsync(item => item.PetId == Buddy));
        Assert.NotNull(await harness.PublicProfiles.GetMomentAsync(momentId, null));
    }

    // ---- candidates --------------------------------------------------------

    [Fact]
    public async Task CandidatesListFollowedHouseholdsFirstAndNeverRevealHiddenOnes()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddHouseholdAsync(Eve, "EveHome", "Eve's Home", Pip, "Pip");
        await harness.AddHouseholdAsync(Finn, "FinnFamily", "Hidden Finns", Tofu, "Tofu", discoverable: false);
        await harness.FollowAsync(Alice, "carolpets");

        // Before typing: only households Alice follows, even non-discoverable.
        var start = await harness.Collaborations.GetCandidatesAsync(Alice, "", null);
        Assert.Equal(new[] { "CarolPets" }, start.Items.Select(item => item.Household.Handle));
        Assert.True(start.Items.Single().IsFollowed);
        Assert.Equal("Shy", Assert.Single(start.Items.Single().Pets).Name);

        // Searching adds discoverable households only.
        var eve = await harness.Collaborations.GetCandidatesAsync(Alice, "eve", null);
        Assert.Equal("EveHome", Assert.Single(eve.Items).Household.Handle);
        Assert.Empty((await harness.Collaborations.GetCandidatesAsync(Alice, "finn", null)).Items);
        Assert.Empty((await harness.Collaborations.GetCandidatesAsync(Alice, "hidden", null)).Items);

        // Never yourself, a household without Community, or one blocked either way.
        Assert.Empty((await harness.Collaborations.GetCandidatesAsync(Alice, "tan", null)).Items);
        Assert.Empty((await harness.Collaborations.GetCandidatesAsync(Alice, "dave", null)).Items);
        harness.Db.OwnerBlocks.Add(new OwnerBlock { BlockerUserId = Eve, BlockedUserId = Alice });
        await harness.Db.SaveChangesAsync();
        Assert.Empty((await harness.Collaborations.GetCandidatesAsync(Alice, "eve", null)).Items);
    }

    [Fact]
    public async Task CandidatesShowWhereEachHouseholdStandsForTheMoment()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var collaborationId = await InviteAndGetIdAsync(harness, momentId, "limfamily", "buddy-pubbuddy");

        var pending = await harness.Collaborations.GetCandidatesAsync(Alice, "lim", momentId);
        Assert.Equal("Pending", Assert.Single(pending.Items).InvitationState);

        await harness.Collaborations.DeclineAsync(Bob, collaborationId);
        var declined = await harness.Collaborations.GetCandidatesAsync(Alice, "lim", momentId);
        Assert.Equal("Unavailable", Assert.Single(declined.Items).InvitationState);
    }

    [Fact]
    public async Task IncomingListsOnlyActionableInvitationsForTheViewer()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var first = await harness.AddMomentAsync(Alice, Mochi, "Beach day", 10);
        var second = await harness.AddMomentAsync(Alice, Mochi, "Park", 11);
        await InviteAndGetIdAsync(harness, first, "limfamily", "buddy-pubbuddy");
        await InviteAndGetIdAsync(harness, second, "limfamily", "buddy-pubbuddy");
        await ExpireAsync(harness, second, Bob);

        var incoming = await harness.Collaborations.GetIncomingAsync(Bob);

        var item = Assert.Single(incoming.Items);
        Assert.Equal(first, item.MomentId);
        Assert.Equal("TanFamily", item.Author.Handle);
        Assert.Empty((await harness.Collaborations.GetIncomingAsync(Carol)).Items);
    }

    // ---- policies ----------------------------------------------------------

    [Fact]
    public void EveryRouteIsSignedInAndWritesUseTheirLimits()
    {
        var controller = typeof(MomentCollaborationsController);
        Assert.NotEmpty(controller.GetCustomAttributes(typeof(AuthorizeAttribute), inherit: true));
        Assert.Empty(controller.GetMethods().SelectMany(method =>
            method.GetCustomAttributes(typeof(AllowAnonymousAttribute), inherit: true)));

        string? Policy(string action) => controller.GetMethod(action)!
            .GetCustomAttributes(typeof(EnableRateLimitingAttribute), inherit: true)
            .Cast<EnableRateLimitingAttribute>()
            .SingleOrDefault()?.PolicyName;

        Assert.Equal(SocialRateLimitPolicies.CollaborationInvite, Policy(nameof(MomentCollaborationsController.Invite)));
        Assert.Equal("social-collaboration-invite", SocialRateLimitPolicies.CollaborationInvite);
        Assert.Equal(SocialRateLimitPolicies.ProfileMutation, Policy(nameof(MomentCollaborationsController.Accept)));
        Assert.Equal(SocialRateLimitPolicies.ProfileMutation, Policy(nameof(MomentCollaborationsController.Decline)));
        Assert.Equal(SocialRateLimitPolicies.Withdraw, Policy(nameof(MomentCollaborationsController.Revoke)));
        Assert.Equal(SocialRateLimitPolicies.Withdraw, Policy(nameof(MomentCollaborationsController.Leave)));
        Assert.Equal(SocialRateLimitPolicies.Search, Policy(nameof(MomentCollaborationsController.GetCandidates)));

        var defaults = new SocialRateLimitingOptions().CollaborationInvite;
        Assert.Equal(20, defaults.PermitLimit);
        Assert.Equal(3600, defaults.WindowSeconds);
    }

    // ---- helpers -----------------------------------------------------------

    private static CreateMomentCollaborationRequest Invite(string handle, params string[] petSlugs) =>
        new(handle, petSlugs);

    private static AcceptMomentCollaborationRequest Accept(params string[] petSlugs) => new(petSlugs);

    private static async Task<Guid> InviteAndGetIdAsync(
        SocialSurfaceHarness harness,
        Guid momentId,
        string handle,
        params string[] petSlugs)
    {
        var list = await harness.Collaborations.InviteAsync(Alice, momentId, Invite(handle, petSlugs));
        return list.Items.Single(item =>
            item.Household.Handle.Equals(handle, StringComparison.OrdinalIgnoreCase)
            && item.Status == "Pending").Id;
    }

    private static async Task ExpireAsync(SocialSurfaceHarness harness, Guid momentId, Guid inviteeId)
    {
        var pending = await harness.Db.MomentCollaborations.SingleAsync(item =>
            item.MomentId == momentId
            && item.InviteeUserId == inviteeId
            && item.Status == MomentCollaborationStatus.Pending);
        pending.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        await harness.Db.SaveChangesAsync();
        harness.Db.ChangeTracker.Clear();
    }
}
