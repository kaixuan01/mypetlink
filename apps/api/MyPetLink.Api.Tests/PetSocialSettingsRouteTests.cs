using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;

namespace MyPetLink.Api.Tests;

/// <summary>
/// That the owner's route into Social actually exists as an HTTP route.
///
/// Every other test in this area calls the service directly, which is the right
/// level for behaviour but would go on passing if the controller were deleted —
/// and "the behaviour is implemented but nothing is wired to it" is precisely
/// the defect this whole change is fixing. So these ask the running application,
/// over HTTP, whether the route is mapped and whether it is protected.
/// </summary>
public sealed class PetSocialSettingsRouteTests
{
    private static readonly Guid SomePetId = Guid.Parse("b1000000-0000-4000-8000-00000000000a");

    [Fact]
    public async Task TheOwnerPetSocialRoutes_AreMappedAndRequireAuthentication()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        var list = await client.GetAsync("/api/v1/social/me/pets");
        var update = await client.PutAsJsonAsync(
            $"/api/v1/social/me/pets/{SomePetId}",
            new UpdatePetSocialSettingsRequest(true, true, null));

        // 401, not 404. A 404 here would mean the route does not exist — the
        // exact failure that let the switches ship with no way to set them.
        Assert.Equal(HttpStatusCode.Unauthorized, list.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, update.StatusCode);
    }

    [Fact]
    public async Task ThePetSocialRoute_DoesNotAcceptAnOwnerIdFromTheClient()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        // The actor is the JWT subject and nothing else. Even unauthenticated,
        // the shape of the refusal must not differ when a caller tries to name
        // somebody: if any of these were routed differently, the route would be
        // reading an identity it must never read.
        foreach (var path in new[]
        {
            $"/api/v1/social/me/pets/{SomePetId}?ownerUserId={Guid.NewGuid()}",
            $"/api/v1/social/me/pets/{SomePetId}?actorUserId={Guid.NewGuid()}",
            $"/api/v1/social/me/pets/{SomePetId}?userId={Guid.NewGuid()}"
        })
        {
            var response = await client.PutAsJsonAsync(
                path,
                new UpdatePetSocialSettingsRequest(true, null, null));

            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
    }

    [Fact]
    public async Task ThereIsNoRouteThatSetsAnotherAccountsPetSocialSettings()
    {
        await using var factory = Factory();
        using var client = factory.CreateClient();

        // "me" is the only subject the API exposes. A route keyed by owner id
        // must not exist at all, authenticated or otherwise.
        foreach (var path in new[]
        {
            $"/api/v1/social/owners/{Guid.NewGuid()}/pets/{SomePetId}",
            $"/api/v1/social/users/{Guid.NewGuid()}/pets/{SomePetId}",
            $"/api/v1/pets/{SomePetId}/social-settings/owner/{Guid.NewGuid()}"
        })
        {
            var response = await client.PutAsJsonAsync(
                path,
                new UpdatePetSocialSettingsRequest(true, null, null));

            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        }
    }

    /// <summary>
    /// The general pet edit must not be able to publish a pet as a side effect.
    /// Social consent lives on its own route so that renaming a pet, changing
    /// its photo, or any other ordinary edit cannot carry it.
    /// </summary>
    [Fact]
    public void ThePetUpdateContract_CarriesNoSocialSwitch()
    {
        var fields = typeof(UpdatePetRequest)
            .GetProperties()
            .Select(property => property.Name)
            .ToArray();

        Assert.DoesNotContain("IsSocialEnabled", fields);
        Assert.DoesNotContain("SocialEnabled", fields);
        Assert.DoesNotContain("IsDiscoverable", fields);
        Assert.DoesNotContain("Discoverable", fields);
    }

    private static WebApplicationFactory<Program> Factory()
    {
        return new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting(
                "Jwt:SigningKey",
                "pet-social-settings-route-tests-signing-key-at-least-32-characters");
            builder.UseSetting("DevAuth:Enabled", "false");
            builder.UseSetting("CloudflareR2:AccountId", "test-account");
            builder.UseSetting("CloudflareR2:AccessKeyId", "test-access-key");
            builder.UseSetting("CloudflareR2:SecretAccessKey", "test-secret-key");
        });
    }
}

/// <summary>
/// The soft-launch runbook's cohort walkthrough, as one test.
///
/// The runbook asks an operator to configure a Social profile, put a pet into
/// Social, make it discoverable, and then confirm it turns up in Explore,
/// Search, the owner's profile, the pet's Moments and a follower's feed. Until
/// this change, step 3 had no route and the rest could not be reached.
///
/// Every step below goes through a real service the UI calls. Nothing writes
/// <c>PetSocialProfiles</c> directly, which is the whole point: a walkthrough
/// that arranges its own preconditions in the database proves the surfaces work
/// and says nothing about whether a person can get there.
/// </summary>
public sealed class PetSocialOwnerJourneyTests
{
    [Fact]
    public async Task AnOwnerCanTakeAPetAllTheWayIntoSocialAndAllTheWayBackOut()
    {
        using var harness = await SocialSurfaceHarness.CreateAsync();

        // Start from the state a real household is in on day one: the pet is
        // not in Social, whatever else is already true of it.
        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            new UpdatePetSocialSettingsRequest(false, null, null));

        await harness.AddMomentAsync(
            SocialSurfaceHarness.AliceId, SocialSurfaceHarness.MochiId, "Beach day", 10);

        // Step 3 — the step that did not exist.
        var enabled = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            new UpdatePetSocialSettingsRequest(true, null, null));
        Assert.True(enabled.IsSocialEnabled);

        // Step 4 — discovery, as a separate decision.
        var discoverable = await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            new UpdatePetSocialSettingsRequest(null, true, null));
        Assert.True(discoverable.IsDiscoverable);

        // Step 6 — Explore.
        var explore = await harness.Discovery.GetSuggestedPetsAsync(
            SocialSurfaceHarness.BobId, null, null);
        Assert.Contains(explore.Items, pet => pet.Name == "Mochi");

        // Step 7 — Search.
        var search = await harness.Discovery.SearchAsync(
            SocialSurfaceHarness.BobId, "Mochi", null, null, null);
        Assert.Contains(search.Pets, pet => pet.Name == "Mochi");

        // Step 8 — the owner's Social profile lists the pet.
        var profile = await harness.PublicProfiles.GetOwnerProfileAsync("tanfamily");
        Assert.Contains(profile.Pets, pet => pet.Name == "Mochi");

        // Step 9 — the pet's Moments are readable.
        var moments = await harness.PublicProfiles.GetPetMomentsAsync(
            "mochi-pubmochi", null, null);
        Assert.Contains(moments.Items, moment => moment.Title == "Beach day");

        // Step 10 — a follower's feed card names the pet.
        await harness.FollowAsync(SocialSurfaceHarness.BobId, "TanFamily");
        var feed = await harness.Feed.GetFeedAsync(SocialSurfaceHarness.BobId, null, null);
        Assert.Contains(
            feed.Items.SelectMany(item => item.Subjects),
            subject => subject.Name == "Mochi");

        // And all the way back out again, in one move.
        await harness.PetSettings.UpdateAsync(
            SocialSurfaceHarness.AliceId,
            SocialSurfaceHarness.MochiId,
            new UpdatePetSocialSettingsRequest(false, null, null));

        Assert.DoesNotContain(
            (await harness.Discovery.GetSuggestedPetsAsync(SocialSurfaceHarness.BobId, null, null)).Items,
            pet => pet.Name == "Mochi");
        Assert.DoesNotContain(
            (await harness.Discovery.SearchAsync(SocialSurfaceHarness.BobId, "Mochi", null, null, null)).Pets,
            pet => pet.Name == "Mochi");
        Assert.DoesNotContain(
            (await harness.PublicProfiles.GetOwnerProfileAsync("tanfamily")).Pets,
            pet => pet.Name == "Mochi");
        Assert.DoesNotContain(
            (await harness.Feed.GetFeedAsync(SocialSurfaceHarness.BobId, null, null))
                .Items.SelectMany(item => item.Subjects),
            subject => subject.Name == "Mochi");

        // The Moment itself survived all of that untouched.
        var moment = await harness.Db.PetMemories
            .AsNoTracking()
            .SingleAsync(item => item.Title == "Beach day");
        Assert.Null(moment.DeletedAt);
        Assert.Equal(MemoryVisibility.Public, moment.Visibility);
    }
}
