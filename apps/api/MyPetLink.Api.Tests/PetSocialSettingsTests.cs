using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Http;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The owner's route into Social for a pet.
///
/// This is the path that was missing: the switches existed, every read asked
/// about them, and nothing could set them. So these tests deliberately go
/// through <c>PetSocialSettingsService</c> rather than writing
/// <c>PetSocialProfiles</c> directly — a test that sets the column itself would
/// pass just as happily with no owner-facing route at all, which is exactly how
/// the gap survived Phase 1A–1M.
/// </summary>
public sealed class PetSocialSettingsTests
{
    private static UpdatePetSocialSettingsRequest Set(
        bool? social = null,
        bool? discoverable = null,
        string? rowVersion = null)
    {
        return new UpdatePetSocialSettingsRequest(social, discoverable, rowVersion);
    }

    // ---- the switches ---------------------------------------------------

    [Fact]
    public async Task OwnerCanEnableTheirPetForSocial()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: true));

        Assert.True(response.IsSocialEnabled);
        Assert.False(response.IsDiscoverable);

        var stored = await Stored(harness, SocialSurfaceHarness.MochiId);
        Assert.True(stored.IsSocialEnabled);

        // Consent is stamped with the person who gave it, not just the fact.
        Assert.Equal(SocialSurfaceHarness.AliceId, stored.ConsentedByUserId);
    }

    [Fact]
    public async Task OwnerCanDisableTheirPetFromSocial()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        Assert.False(response.IsSocialEnabled);

        var stored = await Stored(harness, SocialSurfaceHarness.MochiId);
        Assert.False(stored.IsSocialEnabled);

        // The stamp goes with the consent. Leaving a stale one behind would
        // make a re-enable look like it was agreed to at the wrong moment.
        Assert.Null(stored.ConsentedByUserId);
    }

    [Fact]
    public async Task OwnerCanEnableDiscoverabilityForSocialPet()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: true));

        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(discoverable: true));

        Assert.True(response.IsSocialEnabled);
        Assert.True(response.IsDiscoverable);
    }

    [Fact]
    public async Task DiscoverabilityCannotRemainOnWhenSocialIsDisabled()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        // Mochi starts social and discoverable. Turning participation off must
        // take discovery with it — otherwise switching back on later silently
        // republishes the pet to Explore and Search.
        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        Assert.False(response.IsDiscoverable);

        var stored = await Stored(harness, SocialSurfaceHarness.MochiId);
        Assert.False(stored.IsDiscoverable);
    }

    [Fact]
    public async Task AskingForDiscoverabilityWithoutParticipation_IsNormalisedNotStored()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        // The contradictory request the brief calls out: social off, discovery
        // on. Normalised the same way the owner's own profile normalises it,
        // rather than rejected — the answer to "may strangers find this pet"
        // is unambiguously no, so there is nothing for the owner to correct.
        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false, discoverable: true));

        Assert.False(response.IsSocialEnabled);
        Assert.False(response.IsDiscoverable);
    }

    [Fact]
    public async Task PetSocialDefaultsRemainOff()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var pet = NewPet(harness, SocialSurfaceHarness.AliceId, "Pip", "newpip");
        harness.Db.Pets.Add(pet);
        await harness.Db.SaveChangesAsync();

        var list = await harness.PetSettings.ListAsync(SocialSurfaceHarness.AliceId);
        var pip = list.Pets.Single(item => item.PetId == pet.Id);

        Assert.False(pip.IsSocialEnabled);
        Assert.False(pip.IsDiscoverable);
    }

    // ---- authorization --------------------------------------------------

    [Fact]
    public async Task OwnerACannotChangeOwnerBsPet()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        // Bob aims at Alice's pet. Not found, not forbidden: a different answer
        // here would confirm that the id is real and belongs to somebody.
        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.PetSettings.UpdateAsync(
                SocialSurfaceHarness.BobId,
                SocialSurfaceHarness.MochiId,
                Set(social: false)));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);

        var stored = await Stored(harness, SocialSurfaceHarness.MochiId);
        Assert.True(stored.IsSocialEnabled);
    }

    [Fact]
    public async Task APetThatDoesNotExist_AnswersExactlyLikeSomebodyElsesPet()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var missing = await Assert.ThrowsAsync<ApiException>(() =>
            harness.PetSettings.UpdateAsync(
                SocialSurfaceHarness.BobId,
                Guid.NewGuid(),
                Set(social: true)));

        var notMine = await Assert.ThrowsAsync<ApiException>(() =>
            harness.PetSettings.UpdateAsync(
                SocialSurfaceHarness.BobId,
                SocialSurfaceHarness.MochiId,
                Set(social: true)));

        Assert.Equal(missing.StatusCode, notMine.StatusCode);
        Assert.Equal(missing.Message, notMine.Message);
    }

    [Fact]
    public async Task TheListOnlyEverContainsTheCallersOwnPets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var list = await harness.PetSettings.ListAsync(SocialSurfaceHarness.AliceId);

        Assert.Equal(
            new[] { SocialSurfaceHarness.CocoId, SocialSurfaceHarness.MochiId }.OrderBy(id => id),
            list.Pets.Select(item => item.PetId).OrderBy(id => id));
    }

    [Fact]
    public async Task SocialBlockDoesNotAffectPetSettingsOwnership()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.Graph.BlockAsync(SocialSurfaceHarness.BobId, "TanFamily", null);

        // Being blocked is about who may see whom. It has nothing to say about
        // who may manage a pet, in either direction.
        var alice = await harness.PetSettings.ListAsync(SocialSurfaceHarness.AliceId);
        Assert.Equal(2, alice.Pets.Count);

        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(discoverable: false));
        Assert.False(response.IsDiscoverable);

        var bob = await harness.PetSettings.ListAsync(SocialSurfaceHarness.BobId);
        Assert.Equal(SocialSurfaceHarness.BuddyId, bob.Pets.Single().PetId);
    }

    // ---- eligibility ----------------------------------------------------

    [Fact]
    public async Task APetWithNoPublicProfile_CannotJoinAndSaysWhy()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        var publicProfile = await harness.Db.PetPublicProfiles
            .SingleAsync(item => item.PetId == SocialSurfaceHarness.MochiId);
        publicProfile.IsPublicProfileEnabled = false;
        await harness.Db.SaveChangesAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.PetSettings.UpdateAsync(
                SocialSurfaceHarness.AliceId,
                SocialSurfaceHarness.MochiId,
                Set(social: true)));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);

        var list = await harness.PetSettings.ListAsync(SocialSurfaceHarness.AliceId);
        var mochi = list.Pets.Single(item => item.PetId == SocialSurfaceHarness.MochiId);

        Assert.False(mochi.CanEnableSocial);
        Assert.Contains("publicProfile", mochi.MissingRequirements);
    }

    [Fact]
    public async Task JoiningSocial_NeverSwitchesOnThePublicShareProfile()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: true, discoverable: true));

        // Sharing a link and joining a browsable network are different
        // decisions with different audiences. Social may require the first, but
        // it may never grant it on the owner's behalf.
        var publicProfile = await harness.Db.PetPublicProfiles
            .AsNoTracking()
            .SingleAsync(item => item.PetId == SocialSurfaceHarness.MochiId);

        Assert.True(publicProfile.IsPublicProfileEnabled);
        Assert.Equal(1, await harness.Db.PetPublicProfiles
            .CountAsync(item => item.PetId == SocialSurfaceHarness.MochiId));
    }

    [Theory]
    [InlineData(PetLifecycleStatus.Archived)]
    [InlineData(PetLifecycleStatus.Memorial)]
    public async Task AnIneligibleLifecycle_CannotBecomeSocialOrDiscoverable(
        PetLifecycleStatus status)
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);
        pet.LifecycleStatus = status;
        await harness.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.PetSettings.UpdateAsync(
                SocialSurfaceHarness.AliceId,
                SocialSurfaceHarness.MochiId,
                Set(social: true, discoverable: true)));

        var stored = await Stored(harness, SocialSurfaceHarness.MochiId);
        Assert.False(stored.IsSocialEnabled);
        Assert.False(stored.IsDiscoverable);
    }

    [Fact]
    public async Task AnIneligiblePetCanStillBeWithdrawn()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);
        pet.LifecycleStatus = PetLifecycleStatus.Memorial;
        await harness.Db.SaveChangesAsync();

        // Eligibility gates joining, never leaving. A rule that blocked the way
        // out would be a privacy setting that can be entered and not exited.
        var response = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        Assert.False(response.IsSocialEnabled);
    }

    // ---- the master switch ----------------------------------------------

    [Fact]
    public async Task OwnerSocialOffMakesPetEffectivelyInvisible()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);

        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);

        var visible = await harness.Db.Pets
            .SociallyVisible()
            .AnyAsync(pet => pet.Id == SocialSurfaceHarness.MochiId);

        Assert.False(visible);
    }

    [Fact]
    public async Task TurningOwnerSocialOff_LeavesThePetsOwnChoicesAlone()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);

        // The owner switch is a master switch, not an eraser. Clearing every
        // pet row would mean an owner who pauses Social for a week comes back
        // to a blank slate and has to re-consent pet by pet.
        var stored = await Stored(harness, SocialSurfaceHarness.MochiId);
        Assert.True(stored.IsSocialEnabled);
        Assert.True(stored.IsDiscoverable);

        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, true);

        var visible = await harness.Db.Pets
            .SociallyVisible()
            .AnyAsync(pet => pet.Id == SocialSurfaceHarness.MochiId);
        Assert.True(visible);
    }

    // ---- ownership transfer ---------------------------------------------

    [Fact]
    public async Task APetThatChangesHands_LeavesSocialUntilItsNewOwnerOptsIn()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);

        Assert.True(await harness.Db.Pets
            .SociallyVisible()
            .AnyAsync(pet => pet.Id == SocialSurfaceHarness.MochiId));

        // No transfer feature exists yet, so this writes the column such a
        // feature would write. The point of the test is that consent does NOT
        // survive the move on its own — whenever transfer ships, it inherits
        // this property rather than having to remember to implement it.
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);
        pet.OwnerUserId = SocialSurfaceHarness.BobId;
        await harness.Db.SaveChangesAsync();

        Assert.False(await harness.Db.Pets
            .SociallyVisible()
            .AnyAsync(pet => pet.Id == SocialSurfaceHarness.MochiId));

        // Bob opting in himself is what brings the pet back.
        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.BobId,
            SocialSurfaceHarness.MochiId,
            Set(social: true));

        Assert.True(await harness.Db.Pets
            .SociallyVisible()
            .AnyAsync(pet => pet.Id == SocialSurfaceHarness.MochiId));
    }

    [Fact]
    public async Task APetThatChangesHands_IsNotNamedOnAnybodysMomentCard()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.CocoId,
            "Both of them",
            10,
            alsoAbout: [SocialSurfaceHarness.MochiId]);

        await harness.FollowAsync(SocialSurfaceHarness.BobId, "TanFamily");

        var before = await harness.Feed.GetFeedAsync(SocialSurfaceHarness.BobId, null, null);
        Assert.Contains(
            before.Items.Single().Subjects,
            subject => subject.Name == "Mochi");

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);
        pet.OwnerUserId = SocialSurfaceHarness.CarolId;
        await harness.Db.SaveChangesAsync();

        var after = await harness.Feed.GetFeedAsync(SocialSurfaceHarness.BobId, null, null);
        Assert.DoesNotContain(
            after.Items.Single().Subjects,
            subject => subject.Name == "Mochi");
    }

    // ---- discovery ------------------------------------------------------

    [Fact]
    public async Task PetSocialOnDiscoverableOn_AppearsInExploreAndSearch()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: true, discoverable: true));

        var explore = await harness.Discovery.GetSuggestedPetsAsync(
            SocialSurfaceHarness.BobId, null, null);
        Assert.Contains(explore.Items, pet => pet.Name == "Mochi");

        var search = await harness.Discovery.SearchAsync(
            SocialSurfaceHarness.BobId, "Mochi", null, null, null);
        Assert.Contains(search.Pets, pet => pet.Name == "Mochi");
    }

    [Fact]
    public async Task PetSocialOnDiscoverableOff_DoesNotAppearInExploreOrSearch()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(discoverable: false));

        var explore = await harness.Discovery.GetSuggestedPetsAsync(
            SocialSurfaceHarness.BobId, null, null);
        Assert.DoesNotContain(explore.Items, pet => pet.Name == "Mochi");

        var search = await harness.Discovery.SearchAsync(
            SocialSurfaceHarness.BobId, "Mochi", null, null, null);
        Assert.DoesNotContain(search.Pets, pet => pet.Name == "Mochi");
    }

    [Fact]
    public async Task PetSocialOnDiscoverableOff_StillReachesItsFollowersFeed()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Quiet morning", 10);
        await harness.FollowAsync(SocialSurfaceHarness.BobId, "TanFamily");

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(discoverable: false));

        // Discoverability is a discovery control, not a secrecy switch: somebody
        // who already follows the household keeps seeing the pet.
        var feed = await harness.Feed.GetFeedAsync(SocialSurfaceHarness.BobId, null, null);
        Assert.Contains(
            feed.Items.SelectMany(item => item.Subjects),
            subject => subject.Name == "Mochi");
    }

    [Fact]
    public async Task DisablingPetSocial_RemovesPetFromOwnerSocialProfile()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var before = await harness.PublicProfiles.GetOwnerProfileAsync("tanfamily");
        Assert.Contains(before.Pets, pet => pet.Name == "Mochi");

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        var after = await harness.PublicProfiles.GetOwnerProfileAsync("tanfamily");
        Assert.DoesNotContain(after.Pets, pet => pet.Name == "Mochi");

        // The other pet in the same household is untouched.
        Assert.Contains(after.Pets, pet => pet.Name == "Coco");
    }

    [Fact]
    public async Task EnablingPetSocial_ShowsHistoricalPublicMomentsWithNoBackfill()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        // Moments written while the pet was out of Social. Nothing about them
        // changes when it joins; only whether a social surface may read them.
        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "First walk", 10);
        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Second walk", 20);

        // While the pet is out of Social its Moments tab is not a page at all,
        // which is the existing rule: not an empty list, no such profile.
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.PublicProfiles.GetPetMomentsAsync("mochi-pubmochi", null, null));

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: true));

        var after = await harness.PublicProfiles.GetPetMomentsAsync(
            "mochi-pubmochi", null, null);
        Assert.Equal(2, after.Items.Count);
    }

    [Fact]
    public async Task DisablingPetSocial_DoesNotDeleteMoments()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        var moment = await harness.Db.PetMemories
            .AsNoTracking()
            .SingleAsync(item => item.Id == momentId);

        // Social eligibility and Moment visibility are separate concepts. The
        // Moment is still there, still public, still the owner's to manage.
        Assert.Null(moment.DeletedAt);
        Assert.Null(moment.ArchivedAt);
        Assert.Equal(MemoryVisibility.Public, moment.Visibility);
        Assert.NotNull(moment.PublishedAt);
    }

    // ---- safety isolation -----------------------------------------------

    [Fact]
    public async Task DisablingPetSocial_DoesNotChangeSafetySettings()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var before = await SafetySnapshot(harness, SocialSurfaceHarness.MochiId);

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false, discoverable: false));

        Assert.Equal(before, await SafetySnapshot(harness, SocialSurfaceHarness.MochiId));
    }

    [Fact]
    public async Task EnablingPetSocial_DoesNotChangeSafetySettings()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await WithdrawAsync(harness, SocialSurfaceHarness.MochiId);

        var before = await SafetySnapshot(harness, SocialSurfaceHarness.MochiId);

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: true, discoverable: true));

        Assert.Equal(before, await SafetySnapshot(harness, SocialSurfaceHarness.MochiId));
    }

    [Fact]
    public async Task PetSocialSettings_NeverTouchLostModeOrContact()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);
        pet.LostModeEnabled = true;
        pet.LostLastSeenArea = "Near SS2 market";
        await harness.Db.SaveChangesAsync();

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        var after = await harness.Db.Pets
            .AsNoTracking()
            .Include(item => item.Contact)
            .SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);

        Assert.True(after.LostModeEnabled);
        Assert.Equal("Near SS2 market", after.LostLastSeenArea);
        Assert.True(after.Contact!.UseOwnerDefaults);
    }

    // ---- concurrency ----------------------------------------------------
    //
    // The real optimistic-concurrency test lives in
    // PetSocialSettingsRelationalTests: the in-memory provider does not enforce
    // RowVersion, so a conflict assertion here would pass without proving
    // anything. What stays here is the part that is provider-independent.

    [Fact]
    public async Task AMalformedConcurrencyToken_IsAValidationErrorNotACrash()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.PetSettings.UpdateAsync(
                SocialSurfaceHarness.AliceId,
                SocialSurfaceHarness.MochiId,
                Set(social: false, rowVersion: "not base64 at all")));

        Assert.Equal(StatusCodes.Status400BadRequest, error.StatusCode);
    }

    // ---- audit ----------------------------------------------------------

    [Fact]
    public async Task ChangingPetSocialSettings_IsAudited()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            Set(social: false));

        var entry = await harness.Db.AuditLogs
            .AsNoTracking()
            .SingleAsync(item => item.Action == "PetSocialSettingsUpdated");

        Assert.Equal(SocialSurfaceHarness.AliceId, entry.ActorId);
        Assert.Equal(ActorType.Owner, entry.ActorType);

        // Both sides of the change, and no pet identity beyond its id.
        Assert.NotNull(entry.OldValue);
        Assert.NotNull(entry.NewValue);
        Assert.DoesNotContain("Mochi", entry.NewValue!, StringComparison.OrdinalIgnoreCase);
    }

    // ---- plumbing -------------------------------------------------------

    /// <summary>
    /// Takes a pet out of Social through the owner's own route, so a test that
    /// needs the "not yet joined" starting state gets there the way a person
    /// would.
    /// </summary>
    private static async Task WithdrawAsync(SocialSurfaceHarness harness, Guid petId)
    {
        var ownerId = await harness.Db.Pets
            .AsNoTracking()
            .Where(pet => pet.Id == petId)
            .Select(pet => pet.OwnerUserId)
            .SingleAsync();

        await harness.PetSettings.UpdateAsync(ownerId, petId, Set(social: false));
    }

    private static async Task<PetSocialProfile> Stored(SocialSurfaceHarness harness, Guid petId)
    {
        return await harness.Db.PetSocialProfiles
            .AsNoTracking()
            .SingleAsync(item => item.PetId == petId);
    }

    private static async Task<string> SafetySnapshot(SocialSurfaceHarness harness, Guid petId)
    {
        var safety = await harness.Db.PetSafetySettings
            .AsNoTracking()
            .SingleAsync(item => item.PetId == petId);

        return string.Join(
            "|",
            safety.SafetyCode,
            safety.QrSafetyEnabled,
            safety.ShowPhone,
            safety.ShowWhatsapp,
            safety.ShowEmergencyNote,
            safety.ShowFoundLocationAction);
    }

    private static Pet NewPet(SocialSurfaceHarness harness, Guid ownerId, string name, string code)
    {
        var id = Guid.NewGuid();

        return new Pet
        {
            Id = id,
            OwnerUserId = ownerId,
            Slug = $"{name.ToLowerInvariant()}-{code}",
            Name = name,
            Species = "Cat",
            PublicProfile = new PetPublicProfile
            {
                PetId = id,
                PublicCode = code,
                SlugSnapshot = $"{name.ToLowerInvariant()}-{code}",
                IsPublicProfileEnabled = true,
                ShowMoments = true
            },
            SocialProfile = new PetSocialProfile { PetId = id },
            SafetySetting = new PetSafetySetting { PetId = id, SafetyCode = $"s-{code}" },
            Contact = new PetContact { PetId = id, UseOwnerDefaults = true }
        };
    }
}
