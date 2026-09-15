using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Explore and search.
///
/// The line these tests defend: discoverability is a SEPARATE consent from
/// social participation. A household that has switched discovery off is still
/// a real profile with real followers — it has only said "do not put me in
/// front of strangers", and these are the two surfaces that must honour that.
/// </summary>
public sealed class SocialDiscoveryTests
{
    private static readonly Guid Alice = SocialSurfaceHarness.AliceId;
    private static readonly Guid Bob = SocialSurfaceHarness.BobId;
    private static readonly Guid Carol = SocialSurfaceHarness.CarolId;
    private static readonly Guid Mochi = SocialSurfaceHarness.MochiId;
    private static readonly Guid Coco = SocialSurfaceHarness.CocoId;
    private static readonly Guid Buddy = SocialSurfaceHarness.BuddyId;
    private static readonly Guid Shy = SocialSurfaceHarness.ShyId;
    private static readonly Guid Hidden = SocialSurfaceHarness.HiddenId;

    // ---- Suggested pets -------------------------------------------------

    [Fact]
    public async Task ADiscoverablePet_IsSuggested()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);

        Assert.Contains(suggestions.Items, item => item.Name == "Mochi");
        Assert.Contains(suggestions.Items, item => item.Name == "Buddy");
    }

    [Fact]
    public async Task APetWithDiscoveryOff_IsNotSuggested()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetDiscoverableAsync(Mochi, false);

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);

        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Mochi");
    }

    [Fact]
    public async Task APetWhoseHouseholdHidesFromDiscovery_IsNotSuggested()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);

        // Carol's pet is socially enabled and discoverable in its own right;
        // her household is not, and that is enough.
        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Shy");
    }

    [Fact]
    public async Task APetWithSocialOff_IsNotSuggested()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.SetPetSocialAsync(Buddy, false);

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);

        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Buddy");
    }

    [Fact]
    public async Task APetWhoseHouseholdLeftSocial_IsNotSuggested()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);

        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Hidden");
    }

    [Fact]
    public async Task YourOwnPets_AreNotSuggestedToYou()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(Alice, null, null);

        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Mochi");
        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Coco");
        Assert.Contains(suggestions.Items, item => item.Name == "Buddy");
    }

    [Fact]
    public async Task AHouseholdYouAlreadyFollow_IsNotSuggestedAgain()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(Alice, null, null);

        Assert.DoesNotContain(suggestions.Items, item => item.Name == "Buddy");
    }

    [Fact]
    public async Task ABlockedHouseholdsPets_AreNotSuggestedInEitherDirection()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        var forAlice = await harness.Discovery.GetSuggestedPetsAsync(Alice, null, null);
        var forBob = await harness.Discovery.GetSuggestedPetsAsync(Bob, null, null);

        Assert.DoesNotContain(forAlice.Items, item => item.Name == "Buddy");
        Assert.DoesNotContain(forBob.Items, item => item.Name == "Mochi");
    }

    [Fact]
    public async Task EverySuggestionNamesTheHouseholdTheFollowWouldAct_On()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var suggestion = (await harness.Discovery.GetSuggestedPetsAsync(null, null, null))
            .Items.First(item => item.Name == "Mochi");

        // The card leads with the pet; the Follow button acts on the household.
        // Both have to be on the card or the control is a guess.
        Assert.Equal("TanFamily", suggestion.Owner.Handle);
        Assert.Equal("The Tan Family", suggestion.Owner.DisplayName);
    }

    [Fact]
    public async Task ASuggestionCarriesNoPetFollowerCount()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        // Pets are content subjects, not actors in the graph. A number beside a
        // pet's name is the quickest way to imply otherwise.
        Assert.DoesNotContain(
            typeof(DTOs.SocialPetCardResponse).GetProperties(),
            property => property.Name.Contains("Follower", StringComparison.Ordinal));
    }

    [Fact]
    public async Task SuggestionsAreDeterministic_NewestSharerFirst()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 20);

        var first = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);
        var second = await harness.Discovery.GetSuggestedPetsAsync(null, null, null);

        Assert.Equal("Mochi", first.Items.First().Name);
        Assert.Equal(
            first.Items.Select(item => item.Name).ToArray(),
            second.Items.Select(item => item.Name).ToArray());
    }

    [Fact]
    public async Task SuggestionsAreBoundedAndOfferNoCursor()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var suggestions = await harness.Discovery.GetSuggestedPetsAsync(null, null, 100_000);

        // A shelf, not a listing: Explore's job is the first few follows.
        Assert.True(suggestions.Items.Count <= 24);
        Assert.Null(suggestions.NextCursor);
    }

    // ---- Species --------------------------------------------------------

    [Fact]
    public async Task SpeciesComeFromTheData_NotFromAHardcodedPair()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var species = await harness.Discovery.GetSpeciesAsync(null);

        // Cat (Mochi, Coco) and Dog (Buddy). Shy the rabbit belongs to a
        // household that is not discoverable, so it is not offered.
        Assert.Contains(species, option => option.Species == "Cat" && option.PetCount == 2);
        Assert.Contains(species, option => option.Species == "Dog" && option.PetCount == 1);
        Assert.DoesNotContain(species, option => option.Species == "Rabbit");
    }

    [Fact]
    public async Task ASpeciesTheProductHasNeverSeen_StillGetsAUsableLabel()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var mochi = await harness.Db.Pets.SingleAsync(pet => pet.Id == Mochi);
        mochi.Species = "Axolotl";
        await harness.Db.SaveChangesAsync();

        var species = await harness.Discovery.GetSpeciesAsync(null);

        Assert.Contains(species, option => option.Label == "Axolotl");
    }

    [Fact]
    public async Task TheSpeciesFilterNarrowsSuggestions()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var cats = await harness.Discovery.GetSuggestedPetsAsync(null, "Cat", null);

        Assert.All(cats.Items, item => Assert.Equal("Cat", item.Species));
        Assert.DoesNotContain(cats.Items, item => item.Name == "Buddy");
    }

    // ---- Latest Moments -------------------------------------------------

    [Fact]
    public async Task LatestMoments_ShowsPublicMomentsFromDiscoverablePets()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 20);

        var page = await harness.Discovery.GetLatestMomentsAsync(null, null, null, null);

        Assert.Equal(
            new[] { "Buddy at the park", "Mochi on the sofa" },
            page.Items.Select(item => item.Title).ToArray());
    }

    [Fact]
    public async Task LatestMoments_ExcludesAPetThatIsNotDiscoverable()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Carol, Shy, "Shy in the sun", 10);

        var page = await harness.Discovery.GetLatestMomentsAsync(null, null, null, null);

        Assert.Empty(page.Items);
    }

    [Fact]
    public async Task LatestMoments_ExcludesPrivateAndArchivedMoments()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            Alice, Mochi, "Vet visit", 10, MemoryVisibility.Private);
        await harness.AddMomentAsync(Alice, Mochi, "Archived", 20, archived: true);

        var page = await harness.Discovery.GetLatestMomentsAsync(null, null, null, null);

        Assert.Empty(page.Items);
    }

    [Fact]
    public async Task LatestMoments_ShowsAMultiPetMomentOnce()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(
            Alice, Mochi, "Beach day", 10, alsoAbout: new[] { Coco });

        var page = await harness.Discovery.GetLatestMomentsAsync(null, null, null, null);

        Assert.Single(page.Items);
        Assert.Equal(2, page.Items.Single().Subjects.Count);
    }

    [Fact]
    public async Task LatestMoments_FiltersBlockedHouseholdsForASignedInViewer()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.AddMomentAsync(Bob, Buddy, "Buddy at the park", 10);
        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        var forAlice = await harness.Discovery.GetLatestMomentsAsync(Alice, null, null, null);
        var forAnyone = await harness.Discovery.GetLatestMomentsAsync(null, null, null, null);

        Assert.Empty(forAlice.Items);

        // Still public to the internet: a block is a relationship control, not
        // DRM over a page anybody can open signed out.
        Assert.Single(forAnyone.Items);
    }

    [Fact]
    public async Task LatestMoments_PagesStablyWithoutRepeating()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        for (var index = 0; index < 7; index += 1)
        {
            await harness.AddMomentAsync(Alice, Mochi, $"Moment {index}", index * 10);
        }

        var seen = new List<string>();
        string? cursor = null;

        do
        {
            var page = await harness.Discovery.GetLatestMomentsAsync(null, null, cursor, 3);
            seen.AddRange(page.Items.Select(item => item.Title));
            cursor = page.NextCursor;
        }
        while (cursor is not null);

        Assert.Equal(7, seen.Count);
        Assert.Equal(7, seen.Distinct().Count());
    }

    [Fact]
    public async Task LatestMoments_CarriesLikeStateForASignedInViewer()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        var momentId = await harness.AddMomentAsync(Alice, Mochi, "Mochi on the sofa", 10);
        await harness.Likes.LikeAsync(Bob, momentId);

        var forBob = await harness.Discovery.GetLatestMomentsAsync(Bob, null, null, null);
        var forAnyone = await harness.Discovery.GetLatestMomentsAsync(null, null, null, null);

        Assert.True(forBob.Items.Single().ViewerHasLiked);
        Assert.Equal(1, forBob.Items.Single().LikeCount);

        // A visitor sees the same count and no personal state — there is nobody
        // for "you liked this" to be true of.
        Assert.Equal(1, forAnyone.Items.Single().LikeCount);
        Assert.False(forAnyone.Items.Single().ViewerHasLiked);
    }

    // ---- Search ---------------------------------------------------------

    [Fact]
    public async Task SearchFindsAPetByNamePrefix()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "Moch", null, null, null);

        Assert.Contains(results.Pets, pet => pet.Name == "Mochi");
    }

    [Fact]
    public async Task SearchFindsAHouseholdByHandlePrefix()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "tanfam", null, null, null);

        Assert.Contains(results.Owners, owner => owner.Handle == "TanFamily");
    }

    [Fact]
    public async Task SearchFindsAHouseholdBySocialDisplayNamePrefix()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "the lim", null, null, null);

        Assert.Contains(results.Owners, owner => owner.Handle == "LimFamily");
    }

    [Fact]
    public async Task SearchIgnoresCasingInTheBox()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var upper = await harness.Discovery.SearchAsync(null, "TANFAM", null, null, null);
        var lower = await harness.Discovery.SearchAsync(null, "tanfam", null, null, null);

        Assert.Equal(
            lower.Owners.Select(owner => owner.Handle).ToArray(),
            upper.Owners.Select(owner => owner.Handle).ToArray());
    }

    [Fact]
    public async Task SearchNeedsTwoCharactersBeforeItAnswers()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var single = await harness.Discovery.SearchAsync(null, "m", null, null, null);
        var empty = await harness.Discovery.SearchAsync(null, "  ", null, null, null);

        // Not an error: somebody mid-type is not a bad request.
        Assert.Empty(single.Pets);
        Assert.Empty(single.Owners);
        Assert.Empty(empty.Owners);
    }

    [Fact]
    public async Task SearchMatchesAPrefixAndNotTheMiddleOfAName()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "ochi", null, null, null);

        // 'LIKE %ochi%' would find Mochi and read the whole table doing it. A
        // public endpoint cannot afford that, so prefix is the contract.
        Assert.DoesNotContain(results.Pets, pet => pet.Name == "Mochi");
    }

    [Fact]
    public async Task SearchTreatsWildcardsAsCharactersRatherThanPatterns()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "%%", null, null, null);

        // Without escaping, "%" would match every pet in the database.
        Assert.Empty(results.Pets);
        Assert.Empty(results.Owners);
    }

    [Fact]
    public async Task SearchNeverAnswersForACodeOrAContactDetail()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        foreach (var forbidden in new[]
        {
            "s-pubmochi",   // safety code
            "pubmochi",     // public code
            "alice@example.com",
            "+60123456789",
            "Alice Tan"     // the ACCOUNT name, not the social one
        })
        {
            var results = await harness.Discovery.SearchAsync(null, forbidden, null, null, null);

            Assert.Empty(results.Pets);
            Assert.Empty(results.Owners);
        }
    }

    [Fact]
    public async Task SearchExcludesAHouseholdThatHidesFromDiscovery()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "carol", null, null, null);

        // Still reachable at /u/carolpets by anybody with the link. That
        // distinction is the point of IsDiscoverable.
        Assert.Empty(results.Owners);
    }

    [Fact]
    public async Task SearchExcludesABlockedHouseholdForASignedInViewer()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.Graph.BlockAsync(Alice, "limfamily", null);

        var forAlice = await harness.Discovery.SearchAsync(Alice, "limfam", null, null, null);
        var forAnyone = await harness.Discovery.SearchAsync(null, "limfam", null, null, null);

        Assert.Empty(forAlice.Owners);
        Assert.Single(forAnyone.Owners);
    }

    [Fact]
    public async Task SearchTellsYouWhichHouseholdsYouAlreadyFollow()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();
        await harness.FollowAsync(Alice, "limfamily");

        var results = await harness.Discovery.SearchAsync(Alice, "limfam", null, null, null);

        Assert.True(results.Owners.Single().ViewerFollows);
    }

    [Fact]
    public async Task SearchCanBeNarrowedToOneKindOfResult()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var petsOnly = await harness.Discovery.SearchAsync(null, "moch", "pets", null, null);
        var ownersOnly = await harness.Discovery.SearchAsync(null, "tanfam", "owners", null, null);

        Assert.NotEmpty(petsOnly.Pets);
        Assert.Empty(petsOnly.Owners);
        Assert.NotEmpty(ownersOnly.Owners);
        Assert.Empty(ownersOnly.Pets);
    }

    [Fact]
    public async Task SearchClampsHowMuchItWillReturn()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "moch", null, null, 100_000);

        Assert.True(results.Pets.Count <= 25);
    }

    [Fact]
    public async Task ASearchResultCarriesNoContactOrSafetyField()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        var results = await harness.Discovery.SearchAsync(null, "moch", null, null, null);
        var serialized = System.Text.Json.JsonSerializer.Serialize(results);

        foreach (var forbidden in new[]
        {
            "+60123456789", "alice@example.com", "Alice Tan", "s-pubmochi"
        })
        {
            Assert.DoesNotContain(forbidden, serialized, StringComparison.OrdinalIgnoreCase);
        }
    }
}
