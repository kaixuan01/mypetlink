using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Common;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Two boundaries around a pet's Share Profile, both of which were previously
/// kept by convention rather than by the API.
///
/// <b>Identity separation.</b> An anonymous Share Profile response must never
/// carry the finder-facing owner name and the household's Community identity at
/// the same time. The page suppressed one of them in React, which left the rule
/// enforced by a component: the edge preview function, any other client, and
/// anyone reading the network tab still got both.
///
/// <b>Independence from Community.</b> A Share Profile is the owner saying "I
/// will share this link". It is not a statement about joining Community, and
/// nothing that depends on the Share Profile may quietly require Community
/// instead — which is exactly what the Safety Profile's bridge used to do.
///
/// The cast comes from <see cref="SocialSurfaceHarness"/>:
///   Alice @tanfamily  Community ON   account name "Alice Tan"   pets Mochi, Coco
///   Dave  @davepets   Community OFF  account name "Dave Rao"    pet  Hidden
/// </summary>
public sealed class ShareProfileBoundaryTests
{
    // ---------------------------------------------------------------------
    // Identity separation on the anonymous Share Profile
    // ---------------------------------------------------------------------

    [Fact]
    public async Task ShareProfile_WithCommunityIdentity_OmitsFinderName()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShowOwnerNameAsync(SocialSurfaceHarness.MochiId, true);

        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");

        Assert.NotNull(profile.SharedBy);
        Assert.Equal("TanFamily", profile.SharedBy!.Handle);
        Assert.Equal("The Tan Family", profile.SharedBy.DisplayName);

        // The whole point: one payload may not name both identities.
        Assert.Null(profile.OwnerDisplayName);
    }

    [Fact]
    public async Task ShareProfile_WithoutCommunity_KeepsOwnerNameWhenOwnerEnabledIt()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShowOwnerNameAsync(SocialSurfaceHarness.HiddenId, true);

        // Dave's household is not in Community, so there is no second identity
        // to correlate against and the owner's explicit choice still stands.
        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync("hidden-pubhidden");

        Assert.Null(profile.SharedBy);
        Assert.Equal("Dave Rao", profile.OwnerDisplayName);
    }

    [Fact]
    public async Task ShareProfile_WithoutCommunity_StillHidesOwnerNameWhenSwitchedOff()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShowOwnerNameAsync(SocialSurfaceHarness.HiddenId, false);

        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync("hidden-pubhidden");

        Assert.Null(profile.SharedBy);
        Assert.Null(profile.OwnerDisplayName);
    }

    [Fact]
    public async Task ShareProfile_OwnerLeavingCommunity_RestoresTheFinderName()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShowOwnerNameAsync(SocialSurfaceHarness.MochiId, true);
        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);

        // Attribution goes with the household's participation, so the pet is
        // back to having one identity and may show it again.
        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");

        Assert.Null(profile.SharedBy);
        Assert.Equal("Alice Tan", profile.OwnerDisplayName);
    }

    [Fact]
    public async Task ShareProfile_DisabledByOwner_IsNotFound()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShareProfileEnabledAsync(SocialSurfaceHarness.MochiId, false);

        await Assert.ThrowsAsync<ApiException>(
            () => harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi"));
    }

    [Fact]
    public async Task ShareProfile_WorksWithCommunityCompletelyOff()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);
        await harness.SetPetSocialAsync(SocialSurfaceHarness.MochiId, false);

        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");

        Assert.Equal("pubmochi", profile.PublicCode);
        Assert.Null(profile.SharedBy);
        Assert.False(profile.IsSocialEnabled);
    }

    // ---------------------------------------------------------------------
    // The Safety Profile's bridge to the Share Profile
    // ---------------------------------------------------------------------

    /// <summary>Case A — Share Profile on, Community off: the bridge is offered.</summary>
    [Fact]
    public async Task SafetyBridge_ShareOnCommunityOff_OffersShareProfile()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetSocialAsync(SocialSurfaceHarness.MochiId, false);
        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);

        var safety = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("mochi-pubmochi", safety.PublicProfileSlug);
    }

    /// <summary>Case B — Share Profile off, Community on: no bridge.</summary>
    [Fact]
    public async Task SafetyBridge_ShareOffCommunityOn_OffersNothing()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShareProfileEnabledAsync(SocialSurfaceHarness.MochiId, false);

        var safety = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Null(safety.PublicProfileSlug);
    }

    /// <summary>Case C — both on: the bridge still works.</summary>
    [Fact]
    public async Task SafetyBridge_ShareOnCommunityOn_OffersShareProfile()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var safety = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("mochi-pubmochi", safety.PublicProfileSlug);
    }

    /// <summary>Case D — lifecycle no longer serves the page: no bridge.</summary>
    [Theory]
    [InlineData(PetLifecycleStatus.Memorial)]
    public async Task SafetyBridge_IneligibleLifecycle_OffersNothing(PetLifecycleStatus status)
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetLifecycleAsync(SocialSurfaceHarness.MochiId, status);

        var safety = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Null(safety.PublicProfileSlug);
    }

    /// <summary>
    /// The finder identity is not what was decoupled. A Safety Profile still
    /// names the owner when they asked it to, Community or not — a finder needs
    /// a human being to ask for.
    /// </summary>
    [Fact]
    public async Task SafetyProfile_StillNamesTheOwnerRegardlessOfCommunity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShowOwnerNameAsync(SocialSurfaceHarness.MochiId, true);

        var withCommunity = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");
        Assert.Equal("Alice Tan", withCommunity.Contact?.OwnerDisplayName);

        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);
        await harness.SetPetSocialAsync(SocialSurfaceHarness.MochiId, false);

        var withoutCommunity = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");
        Assert.Equal("Alice Tan", withoutCommunity.Contact?.OwnerDisplayName);
    }

    /// <summary>
    /// The core promise: an owner may run a Share Profile and a Safety Profile
    /// with Community switched off entirely, and neither breaks.
    /// </summary>
    [Fact]
    public async Task ShareAndSafetyProfiles_BothWorkWithCommunityOff()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetOwnerSocialAsync(SocialSurfaceHarness.AliceId, false);
        await harness.SetPetSocialAsync(SocialSurfaceHarness.MochiId, false);

        var share = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        var safety = await harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("Mochi", share.Name);
        Assert.Equal("Mochi", safety.Name);
        Assert.Equal("Active", safety.State);
        Assert.Equal("mochi-pubmochi", safety.PublicProfileSlug);
    }

    // ---------------------------------------------------------------------
    // Share Profile Moments follow Share Profile rules, not Community rules
    // ---------------------------------------------------------------------

    /// <summary>
    /// The Moments tab is offered from the Moments embedded in the Share Profile
    /// payload and filled from the paged listing. Both must answer the same
    /// question, or the page offers a tab and then fails to fill it.
    /// </summary>
    private static async Task<(string[] Embedded, PublicMomentPageResponse Listing)> ShareProfileMomentsAsync(
        SocialSurfaceHarness harness,
        string slug,
        Guid? viewerId = null)
    {
        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync(slug);
        var listing = await harness.PublicProfiles.GetPetMomentsAsync(slug, null, 50, viewerId);
        var embedded = profile.Memories.Select(memory => memory.Title).Order().ToArray();
        Assert.Equal(embedded, listing.Items.Select(item => item.Title).Order().ToArray());
        return (embedded, listing);
    }

    /// <summary>
    /// The whole contract for a card that is NOT in Community for this viewer:
    /// the Moment itself, and no Community identity or action — asserted on the
    /// API object and on its JSON, so a field no UI renders yet cannot carry
    /// the household either.
    /// </summary>
    private static void AssertPublicOnly(PublicMomentListItemResponse card, params string[] householdIdentity)
    {
        Assert.False(card.InCommunity);
        Assert.Null(card.Author);
        Assert.Empty(card.Subjects);
        Assert.Empty(card.Collaborations);
        Assert.Equal(0, card.LikeCount);
        Assert.Equal(0, card.CommentCount);
        Assert.False(card.ViewerHasLiked);
        Assert.False(string.IsNullOrEmpty(card.Title));

        var json = System.Text.Json.JsonSerializer.Serialize(card);
        foreach (var identity in householdIdentity)
        {
            Assert.DoesNotContain(identity, json, StringComparison.OrdinalIgnoreCase);
        }
    }

    /// <summary>A Community card keeps everything Community gives it.</summary>
    private static void AssertInCommunity(PublicMomentListItemResponse card, string handle)
    {
        Assert.True(card.InCommunity);
        Assert.Equal(handle, card.Author!.Handle);
    }

    [Fact]
    public async Task ShareProfileMoments_CommunityOn_ShowTheMomentWithEverythingCommunityAdds()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);

        var (embedded, listing) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi");

        Assert.Equal(["Beach day"], embedded);
        var card = Assert.Single(listing.Items);
        AssertInCommunity(card, "TanFamily");
        Assert.Contains(card.Subjects, subject => subject.Name == "Mochi");

        // Likes still land on it and show.
        await harness.Likes.LikeAsync(SocialSurfaceHarness.BobId, card.Id);
        var liked = Assert.Single((await harness.PublicProfiles.GetPetMomentsAsync(
            "mochi-pubmochi", null, 50, SocialSurfaceHarness.BobId)).Items);
        Assert.Equal(1, liked.LikeCount);
        Assert.True(liked.ViewerHasLiked);
    }

    [Fact]
    public async Task ShareProfileMoments_HouseholdCommunityOff_StillShowPublicMoments_WithNothingCommunityOnly()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(
            SocialSurfaceHarness.DaveId, SocialSurfaceHarness.HiddenId, "Park run", 10);
        await harness.AddMomentAsync(
            SocialSurfaceHarness.DaveId, SocialSurfaceHarness.HiddenId, "Kept to me", 20,
            MemoryVisibility.Private);

        // Used to be a 404 under a tab the page had just offered.
        var (embedded, listing) = await ShareProfileMomentsAsync(harness, "hidden-pubhidden");

        Assert.Equal(["Park run"], embedded);
        // No Community identity, no pet named, no Community counts.
        AssertPublicOnly(Assert.Single(listing.Items), "DavePets", "Dave's Pets");

        // Community itself is unchanged: no Moment page, no likes.
        await Assert.ThrowsAsync<ApiException>(() => harness.PublicProfiles.GetMomentAsync(momentId));
        await Assert.ThrowsAsync<ApiException>(() => harness.Likes.LikeAsync(SocialSurfaceHarness.BobId, momentId));
    }

    [Fact]
    public async Task ShareProfileMoments_CarryNoAccountFinderOrSafetyValue()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetShowOwnerNameAsync(SocialSurfaceHarness.HiddenId, true);
        await harness.AddMomentAsync(SocialSurfaceHarness.DaveId, SocialSurfaceHarness.HiddenId, "Park run", 10);

        var listing = await harness.PublicProfiles.GetPetMomentsAsync("hidden-pubhidden", null, 50);
        var serialized = System.Text.Json.JsonSerializer.Serialize(listing);

        foreach (var forbidden in new[] { "dave@example.com", "Dave Rao", "DavePets", "+60", "s-pubhidden" })
        {
            Assert.DoesNotContain(forbidden, serialized, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task ShareProfileMoments_PetOutOfCommunity_StillShowPublicMoments_WithoutNamingThePet()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Nap", 10);
        await harness.SetPetSocialAsync(SocialSurfaceHarness.MochiId, false);

        var (embedded, listing) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi");

        Assert.Equal(["Nap"], embedded);
        var card = Assert.Single(listing.Items);
        // A pet out of Community is not a Moment out of Community: the
        // household's Moment keeps its page and its byline; only the pet that
        // left is not named on it.
        AssertInCommunity(card, "TanFamily");
        Assert.DoesNotContain(card.Subjects, subject => subject.Name == "Mochi");
    }

    [Theory]
    [InlineData("alice")]
    [InlineData("dave")]
    public async Task ShareProfileMoments_NeverIncludeOnlyMe_HiddenArchivedOrDeleted(string household)
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var (author, pet, slug) = household == "alice"
            ? (SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "mochi-pubmochi")
            : (SocialSurfaceHarness.DaveId, SocialSurfaceHarness.HiddenId, "hidden-pubhidden");

        await harness.AddMomentAsync(author, pet, "Shown", 10);
        await harness.AddMomentAsync(author, pet, "Only me", 11, MemoryVisibility.Private);
        await harness.AddMomentAsync(author, pet, "Archived", 12, archived: true);
        var hidden = await harness.AddMomentAsync(author, pet, "Hidden by MyPetLink", 13);
        var deleted = await harness.AddMomentAsync(author, pet, "Deleted", 14);
        CommunityModeration.HideMoment(
            await harness.Db.PetMemories.SingleAsync(item => item.Id == hidden),
            SocialSurfaceHarness.BobId,
            DateTimeOffset.UtcNow);
        (await harness.Db.PetMemories.SingleAsync(item => item.Id == deleted)).DeletedAt = DateTimeOffset.UtcNow;
        await harness.Db.SaveChangesAsync();

        var (embedded, _) = await ShareProfileMomentsAsync(harness, slug);

        Assert.Equal(["Shown"], embedded);
    }

    [Fact]
    public async Task ShareProfileMoments_ShareProfileOff_IsNotAPage_WhateverCommunitySays()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);
        await harness.SetShareProfileEnabledAsync(SocialSurfaceHarness.MochiId, false);

        await Assert.ThrowsAsync<ApiException>(
            () => harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi"));
        await Assert.ThrowsAsync<ApiException>(
            () => harness.PublicProfiles.GetPetMomentsAsync("mochi-pubmochi", null, 50));
    }

    [Theory]
    [InlineData(PetLifecycleStatus.Archived, false, false)]
    [InlineData(PetLifecycleStatus.Memorial, false, false)]
    [InlineData(PetLifecycleStatus.Memorial, true, true)]
    public async Task ShareProfileMoments_FollowTheShareProfilesOwnLifecycleRule(
        PetLifecycleStatus status,
        bool showMemorial,
        bool served)
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == SocialSurfaceHarness.MochiId);
        pet.LifecycleStatus = status;
        pet.ShowMemorialOnPublicProfile = showMemorial;
        await harness.Db.SaveChangesAsync();

        if (served)
        {
            var (embedded, _) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi");
            Assert.Equal(["Beach day"], embedded);
        }
        else
        {
            await Assert.ThrowsAsync<ApiException>(
                () => harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi"));
            await Assert.ThrowsAsync<ApiException>(
                () => harness.PublicProfiles.GetPetMomentsAsync("mochi-pubmochi", null, 50));
        }
    }

    [Fact]
    public async Task ShareProfileMoments_RestrictedHousehold_StayOnTheShareProfile_ButLeaveCommunity()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);
        var alice = await harness.Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == SocialSurfaceHarness.AliceId);
        CommunityModeration.RestrictHousehold(alice, SocialSurfaceHarness.BobId, DateTimeOffset.UtcNow);
        await harness.Db.SaveChangesAsync();

        // Restriction is Community-only; the Share Profile still shows the
        // Moment, without the household's Community identity.
        var (_, listing) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi");
        AssertPublicOnly(Assert.Single(listing.Items), "TanFamily", "The Tan Family");

        await Assert.ThrowsAsync<ApiException>(
            () => harness.PublicProfiles.GetOwnerMomentsAsync("tanfamily", null, 50));
        Assert.Empty((await harness.Discovery.GetLatestMomentsAsync(null, null, null, 50)).Items);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ShareProfileMoments_ABlockEitherWay_RemovesCommunityIdentityForThatViewer(
        bool authorBlocksViewer)
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);
        if (authorBlocksViewer)
        {
            await harness.Graph.BlockAsync(SocialSurfaceHarness.AliceId, "limfamily", null);
        }
        else
        {
            await harness.Graph.BlockAsync(SocialSurfaceHarness.BobId, "tanfamily", null);
        }

        var (_, forBob) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi", SocialSurfaceHarness.BobId);
        var (_, forAnyone) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi");

        // The Share Profile is a public page, so the Moment still shows; the
        // block removes the Community way in — and the household's Community
        // identity with it — for this viewer only.
        AssertPublicOnly(Assert.Single(forBob.Items), "TanFamily", "The Tan Family");
        AssertInCommunity(Assert.Single(forAnyone.Items), "TanFamily");
    }

    [Theory]
    [InlineData("suspended")]
    [InlineData("deleted")]
    public async Task ShareProfileMoments_AnAuthorWhoIsNotActive_LeavesNoCommunityIdentity(string state)
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);
        var alice = await harness.Db.Users.SingleAsync(user => user.Id == SocialSurfaceHarness.AliceId);
        if (state == "suspended")
        {
            alice.Status = UserStatus.Suspended;
        }
        else
        {
            alice.DeletedAt = DateTimeOffset.UtcNow;
        }
        await harness.Db.SaveChangesAsync();

        // The Share Profile has never read account status, and that rule is
        // unchanged here. What changes is that the card, being out of
        // Community, no longer names the household: its Community Profile is
        // still switched on, which is exactly how the byline leaked before.
        var (_, listing) = await ShareProfileMomentsAsync(harness, "mochi-pubmochi");
        AssertPublicOnly(Assert.Single(listing.Items), "TanFamily", "The Tan Family");
        await Assert.ThrowsAsync<ApiException>(
            () => harness.PublicProfiles.GetMomentAsync(listing.Items.Single().Id));
    }

    [Fact]
    public async Task ShareProfile_EmbeddedMoments_NameNoHouseholdOnPublicOnlyMoments()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.DaveId, SocialSurfaceHarness.HiddenId, "Park run", 10);

        // The payload's own Moments (which offer the tab and fill the Timeline)
        // name a household only for another household's Moment that is in
        // Community; this one is neither.
        var profile = await harness.PetShareProfiles.GetByPublicSlugAsync("hidden-pubhidden");
        var memory = Assert.Single(profile.Memories);
        Assert.Null(memory.MomentBy);
        var json = System.Text.Json.JsonSerializer.Serialize(profile.Memories);
        Assert.DoesNotContain("DavePets", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ShareProfileMoments_DoNotWidenCommunity_ExploreAndSearchGainNothing()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(SocialSurfaceHarness.DaveId, SocialSurfaceHarness.HiddenId, "Park run", 10);
        await harness.AddMomentAsync(SocialSurfaceHarness.AliceId, SocialSurfaceHarness.CocoId, "Coco out", 11);
        await harness.SetPetSocialAsync(SocialSurfaceHarness.CocoId, false);

        // Both are on their Share Profiles…
        Assert.Single((await harness.PublicProfiles.GetPetMomentsAsync("hidden-pubhidden", null, 50)).Items);
        Assert.Single((await harness.PublicProfiles.GetPetMomentsAsync("coco-pubcoco", null, 50)).Items);

        // …and Community discovery is exactly as it was.
        var explore = await harness.Discovery.GetLatestMomentsAsync(null, null, null, 50);
        Assert.DoesNotContain(explore.Items, item => item.Title is "Park run" or "Coco out");
        var pets = await harness.Discovery.GetSuggestedPetsAsync(null, null, 50);
        Assert.DoesNotContain(pets.Items, pet => pet.Name is "Hidden" or "Coco");
        foreach (var term in new[] { "Hidden", "Coco", "davepets" })
        {
            var search = await harness.Discovery.SearchAsync(null, term, null, null, null);
            Assert.Empty(search.Pets);
            Assert.Empty(search.Owners);
        }
        await Assert.ThrowsAsync<ApiException>(
            () => harness.PublicProfiles.GetOwnerMomentsAsync("davepets", null, 50));
    }

    /// <summary>
    /// A Safety Profile that is switched off stays off, whatever the Share
    /// Profile says. The two switches are independent in both directions.
    /// </summary>
    [Fact]
    public async Task SafetyProfile_DisabledIsRefusedEvenWithShareProfileOn()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var safetySetting = harness.Db.PetSafetySettings.Single(
            item => item.PetId == SocialSurfaceHarness.MochiId);
        safetySetting.QrSafetyEnabled = false;
        await harness.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ApiException>(
            () => harness.QrSafety.GetBySafetyCodeAsync("s-pubmochi"));

        // …and the Share Profile is untouched by that.
        var share = await harness.PetShareProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        Assert.Equal("pubmochi", share.PublicCode);
    }
}
