using MyPetLink.Api.Common;
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
