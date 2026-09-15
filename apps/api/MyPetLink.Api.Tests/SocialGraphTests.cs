using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Following and blocking.
///
/// The test this file exists for is
/// <see cref="ABlockedFinder_CanStillReachTheSafetyProfile"/>. Everything else
/// here is ordinary social behaviour; that one protects the product's actual
/// purpose from its social features.
/// </summary>
public sealed class SocialGraphTests
{
    private static readonly Guid AliceId = Guid.Parse("a9111111-1111-1111-1111-111111111111");
    private static readonly Guid BobId = Guid.Parse("a9222222-2222-2222-2222-222222222222");
    private static readonly Guid CarolId = Guid.Parse("a9333333-3333-3333-3333-333333333333");
    private static readonly Guid MochiId = Guid.Parse("a9444444-4444-4444-4444-444444444444");

    [Fact]
    public async Task FollowingAnAccount_MakesTheViewerAFollower()
    {
        using var harness = await Harness.CreateAsync();

        var relationship = await harness.Graph.FollowAsync(BobId, "tanfamily");

        Assert.True(relationship.IsFollowing);
        Assert.Equal(1, relationship.FollowerCount);
    }

    [Fact]
    public async Task FollowingTwice_IsIdempotent()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Graph.FollowAsync(BobId, "tanfamily");
        var second = await harness.Graph.FollowAsync(BobId, "tanfamily");

        Assert.True(second.IsFollowing);
        Assert.Equal(1, second.FollowerCount);
        Assert.Single(await harness.Db.OwnerFollows.ToListAsync());
    }

    [Fact]
    public async Task Unfollowing_RemovesTheEdgeAndIsIdempotent()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.FollowAsync(BobId, "tanfamily");

        var first = await harness.Graph.UnfollowAsync(BobId, "tanfamily");
        var second = await harness.Graph.UnfollowAsync(BobId, "tanfamily");

        Assert.False(first.IsFollowing);
        Assert.False(second.IsFollowing);
        Assert.Equal(0, second.FollowerCount);
    }

    [Fact]
    public async Task AnAccountCannotFollowItself()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(AliceId, "tanfamily"));

        Assert.Equal("cannot_follow_self", error.Code);
    }

    [Fact]
    public async Task AnAnonymousCallerCannotFollow()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(null, "tanfamily"));

        Assert.Equal(401, error.StatusCode);
    }

    [Fact]
    public async Task AProfileWithSocialOff_CannotBeFollowed()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetSocialAsync(AliceId, enabled: false);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(BobId, "tanfamily"));
    }

    [Fact]
    public async Task AProfileThatDoesNotAllowFollowers_RefusesNewOnes()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetAllowFollowersAsync(AliceId, allow: false);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(BobId, "tanfamily"));

        Assert.Equal("followers_not_allowed", error.Code);
    }

    [Fact]
    public async Task Blocking_RemovesFollowsInBothDirections()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.FollowAsync(AliceId, "limfamily");
        await harness.Graph.FollowAsync(BobId, "tanfamily");

        await harness.Graph.BlockAsync(AliceId, "limfamily", "spam");

        Assert.Empty(await harness.Db.OwnerFollows.ToListAsync());
    }

    [Fact]
    public async Task ABlockedAccount_CannotFollowTheBlocker()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(BobId, "tanfamily"));
    }

    [Fact]
    public async Task ABlockerCannotFollowTheAccountTheyBlocked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(AliceId, "limfamily"));
    }

    [Fact]
    public async Task ABlockedAccount_IsNotToldThatItWasBlocked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.FollowAsync(BobId, "tanfamily"));

        // Indistinguishable from a profile that simply is not there. Saying
        // "you were blocked" is itself a message the blocker never chose to send.
        Assert.Equal("social_profile_not_found", error.Code);
        Assert.DoesNotContain("block", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ABlockedPair_DisappearsFromEachOtherFollowerLists()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.FollowAsync(CarolId, "tanfamily");
        await harness.Graph.FollowAsync(BobId, "tanfamily");

        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        // Bob's follow was removed by the block, and Carol is unaffected.
        var viewedByBob = await harness.Graph.GetFollowersAsync(BobId, "tanfamily", null, 20);
        Assert.DoesNotContain(viewedByBob.Items, item => item.Handle == "LimFamily");
        Assert.Contains(viewedByBob.Items, item => item.Handle == "CarolPets");
    }

    [Fact]
    public async Task Unblocking_DoesNotSilentlyRestoreTheRemovedFollows()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.FollowAsync(BobId, "tanfamily");
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        var relationship = await harness.Graph.UnblockAsync(AliceId, "limfamily");

        Assert.False(relationship.HasBlocked);
        Assert.Empty(await harness.Db.OwnerFollows.ToListAsync());
    }

    [Fact]
    public async Task ABlockReason_IsNeverReturnedToAnyone()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", "kept sending nonsense");

        var relationship = await harness.Graph.GetRelationshipAsync(AliceId, "limfamily");
        var serialized = System.Text.Json.JsonSerializer.Serialize(relationship);

        Assert.DoesNotContain("nonsense", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnAccountCannotBlockItself()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Graph.BlockAsync(AliceId, "tanfamily", null));

        Assert.Equal("cannot_block_self", error.Code);
    }

    [Fact]
    public async Task FollowerLists_AreCursorPagedNewestFirst()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddFollowersAsync("tanfamily", 5);

        var first = await harness.Graph.GetFollowersAsync(null, "tanfamily", null, 2);
        Assert.Equal(2, first.Items.Count);
        Assert.NotNull(first.NextCursor);

        var second = await harness.Graph.GetFollowersAsync(null, "tanfamily", first.NextCursor, 2);
        var third = await harness.Graph.GetFollowersAsync(null, "tanfamily", second.NextCursor, 2);

        var handles = first.Items.Concat(second.Items).Concat(third.Items)
            .Select(item => item.Handle)
            .ToArray();

        Assert.Equal(5, handles.Length);
        Assert.Equal(5, handles.Distinct().Count());
        Assert.Null(third.NextCursor);
    }

    [Fact]
    public async Task AFollowerWhoLeavesSocial_DropsOutOfTheList()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.FollowAsync(BobId, "tanfamily");

        await harness.SetSocialAsync(BobId, enabled: false);

        var followers = await harness.Graph.GetFollowersAsync(null, "tanfamily", null, 20);
        Assert.Empty(followers.Items);
    }

    [Fact]
    public async Task CountsAreComputedFromTheGraphRatherThanStored()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.FollowAsync(BobId, "tanfamily");
        await harness.Graph.FollowAsync(CarolId, "tanfamily");
        await harness.Graph.FollowAsync(AliceId, "limfamily");

        var alice = await harness.Graph.GetRelationshipAsync(null, "tanfamily");

        Assert.Equal(2, alice.FollowerCount);
        Assert.Equal(1, alice.FollowingCount);

        // No counter column exists to drift from these numbers.
        Assert.DoesNotContain(
            typeof(OwnerSocialProfile).GetProperties(),
            property => property.Name.Contains("Count", StringComparison.Ordinal));
    }

    [Fact]
    public async Task AnAnonymousViewer_IsToldFollowingIsOnOfferWithoutBeingToldTheyMay()
    {
        using var harness = await Harness.CreateAsync();

        var relationship = await harness.Graph.GetRelationshipAsync(null, "tanfamily");

        // A signed-out visitor cannot follow anything. The page still needs to
        // know whether following is offered here, so it can show the way in
        // rather than nothing at all.
        Assert.False(relationship.CanFollow);
        Assert.True(relationship.AllowsFollowers);
    }

    [Fact]
    public async Task AProfileThatClosedFollowers_SaysSoToEveryone()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetAllowFollowersAsync(BobId, false);

        var anonymous = await harness.Graph.GetRelationshipAsync(null, "limfamily");
        var signedIn = await harness.Graph.GetRelationshipAsync(AliceId, "limfamily");

        Assert.False(anonymous.AllowsFollowers);
        Assert.False(signedIn.AllowsFollowers);
        Assert.False(signedIn.CanFollow);
    }

    [Fact]
    public async Task ABlockedViewer_LearnsNothingFromAllowsFollowers()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(BobId, "tanfamily", null);

        var blocked = await harness.Graph.GetRelationshipAsync(AliceId, "limfamily");
        var stranger = await harness.Graph.GetRelationshipAsync(CarolId, "limfamily");

        // Identical on every field a blocked viewer can see. CanFollow is false
        // for the blocked viewer, which is also what a closed profile returns.
        Assert.Equal(stranger.AllowsFollowers, blocked.AllowsFollowers);
        Assert.False(blocked.CanFollow);
        Assert.False(blocked.HasBlocked);
    }

    /// <summary>
    /// The audit behind the Blocked accounts screen.
    ///
    /// Blocking must stay reversible. The blocker can still open the profile
    /// they blocked — the public profile read is anonymous and carries no block
    /// filter, which is correct: a block is a relationship control, not DRM over
    /// a page that is public to the whole internet. So Unblock is reachable
    /// whenever the blocker still has the link.
    /// </summary>
    [Fact]
    public async Task ABlocker_CanStillOpenTheProfileTheyBlocked_AndSeesUnblock()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        var profile = await harness.PublicProfiles.GetOwnerProfileAsync("limfamily");
        var relationship = await harness.Graph.GetRelationshipAsync(AliceId, "limfamily");

        Assert.Equal("The Lim Family", profile.DisplayName);
        Assert.True(relationship.HasBlocked);
        Assert.False(relationship.CanFollow);
    }

    [Fact]
    public async Task TheBlockedAccountsList_IsHowABlockStaysReversible()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", "social dispute");

        var blocked = await harness.Graph.GetBlockedAccountsAsync(AliceId, null, null);

        var entry = Assert.Single(blocked.Items);
        Assert.Equal("LimFamily", entry.Handle);
        Assert.Equal("The Lim Family", entry.DisplayName);
        Assert.Null(blocked.NextCursor);
    }

    [Fact]
    public async Task TheBlockedAccountsList_NeverAnswersWhoBlockedYou()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        var fromTheBlockedSide = await harness.Graph.GetBlockedAccountsAsync(BobId, null, null);

        // Bob learns nothing. There is no route in the product that answers
        // "who has blocked me" — that is the question a block exists not to
        // answer.
        Assert.Empty(fromTheBlockedSide.Items);
    }

    [Fact]
    public async Task ABlockedAccountThatLeftSocial_IsStillListedSoItCanBeUnblocked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);
        await harness.SetSocialAsync(BobId, enabled: false);

        var blocked = await harness.Graph.GetBlockedAccountsAsync(AliceId, null, null);

        // Filtering this row out would make the block permanent by accident.
        Assert.Single(blocked.Items);
    }

    [Fact]
    public async Task ReadingYourOwnBlocks_RequiresASession()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => harness.Graph.GetBlockedAccountsAsync(null, null, null));

        Assert.Equal(StatusCodes.Status401Unauthorized, error.StatusCode);
    }

    // ---- Safety Profile to Public Profile bridge ------------------------

    [Fact]
    public async Task AnEligiblePet_OffersItsPublicProfileFromTheSafetyPage()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: true);

        var page = await harness.Safety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("mochi-pubmochi", page.PublicProfileSlug);
    }

    [Fact]
    public async Task APetWhoseHouseholdIsNotSocial_OffersNoBridge()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: true);
        await harness.SetSocialAsync(AliceId, enabled: false);

        var page = await harness.Safety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Null(page.PublicProfileSlug);

        // And the finder page itself is untouched.
        Assert.Equal("Mochi", page.Name);
        Assert.NotNull(page.Contact);
    }

    [Fact]
    public async Task APetThatIsNotSocial_OffersNoBridge()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: false);

        Assert.Null((await harness.Safety.GetBySafetyCodeAsync("s-pubmochi")).PublicProfileSlug);
    }

    [Fact]
    public async Task APetWithSharingSwitchedOff_OffersNoBridge()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: true);
        await harness.SetPublicProfileAsync(MochiId, enabled: false);

        Assert.Null((await harness.Safety.GetBySafetyCodeAsync("s-pubmochi")).PublicProfileSlug);
    }

    /// <summary>
    /// The direct-link semantics, stated where somebody will find them.
    ///
    /// A finder scanned the animal in front of them. That is the opposite of
    /// discovery, so discoverability does not gate this link — treating it as
    /// discovery would quietly turn IsDiscoverable into a private-profile
    /// switch, which it is not.
    /// </summary>
    [Fact]
    public async Task ANonDiscoverablePet_StillOffersTheBridge()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: true, discoverable: false);

        Assert.Equal(
            "mochi-pubmochi",
            (await harness.Safety.GetBySafetyCodeAsync("s-pubmochi")).PublicProfileSlug);
    }

    [Fact]
    public async Task TheBridgeNeverAppearsForAPetInLostMode_UnlessItsOwnerShares()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: true);
        await harness.SetLostModeAsync(MochiId, lost: true);

        var page = await harness.Safety.GetBySafetyCodeAsync("s-pubmochi");

        // Lost Mode does not remove the bridge — a finder confirming they have
        // the right animal is exactly who it helps — but everything
        // finder-critical stays above it on the page.
        Assert.Equal("mochi-pubmochi", page.PublicProfileSlug);
        Assert.Equal("LostMode", page.State);
        Assert.NotNull(page.Contact);
    }

    [Fact]
    public async Task ASocialBlock_NeverRemovesTheBridgeOrTheContact()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: true);
        await harness.Graph.BlockAsync(AliceId, "limfamily", "social dispute");

        var page = await harness.Safety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("mochi-pubmochi", page.PublicProfileSlug);
        Assert.Equal("+60123456789", page.Contact!.WhatsappE164);
    }

    /// <summary>
    /// The one that matters.
    ///
    /// Bob and Alice have blocked each other socially. Bob then finds Alice's
    /// lost pet and scans its tag. The Safety Profile must behave exactly as it
    /// would for any stranger, because a social argument cannot be allowed to
    /// stand between a lost animal and its way home.
    /// </summary>
    [Fact]
    public async Task ABlockedFinder_CanStillReachTheSafetyProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", "social dispute");

        var safetyPage = await harness.Safety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("Mochi", safetyPage.Name);
        Assert.NotNull(safetyPage.Contact);
        Assert.Equal("+60123456789", safetyPage.Contact!.WhatsappE164);
    }

    [Fact]
    public async Task SocialBlocking_TouchesNoSafetyOrTagRow()
    {
        using var harness = await Harness.CreateAsync();

        var safetyBefore = await harness.Db.PetSafetySettings.AsNoTracking().ToListAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);
        var safetyAfter = await harness.Db.PetSafetySettings.AsNoTracking().ToListAsync();

        Assert.Equal(safetyBefore.Count, safetyAfter.Count);
        Assert.All(safetyAfter, setting => Assert.True(setting.QrSafetyEnabled));
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            Notifications = new OwnerNotificationService(
                db, Options.Create(new CloudflareR2Options()));
            Graph = new SocialGraphService(
                db, Options.Create(new CloudflareR2Options()), Notifications);
            PublicProfiles = new PublicSocialProfileService(
                db,
                Options.Create(new CloudflareR2Options()),
                new SocialMomentProjection(db, Options.Create(new CloudflareR2Options())));
            Safety = new QrSafetyService(db, Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }

        public SocialGraphService Graph { get; }

        public OwnerNotificationService Notifications { get; }

        public PublicSocialProfileService PublicProfiles { get; }

        public QrSafetyService Safety { get; }

        public static async Task<Harness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            AddOwner(db, AliceId, "sarah.tan@example.com", "Sarah Tan", "TanFamily", "The Tan Family");
            AddOwner(db, BobId, "lim@example.com", "Wei Lim", "LimFamily", "The Lim Family");
            AddOwner(db, CarolId, "carol@example.com", "Carol Ng", "CarolPets", "Carol's Pets");
            await db.SaveChangesAsync();

            db.Pets.Add(new Pet
            {
                Id = MochiId,
                OwnerUserId = AliceId,
                Slug = "mochi-pubmochi",
                Name = "Mochi",
                Species = "Cat",
                PublicProfile = new PetPublicProfile
                {
                    PetId = MochiId,
                    PublicCode = "pubmochi",
                    SlugSnapshot = "mochi-pubmochi",
                    IsPublicProfileEnabled = true,
                    ShowOwnerName = true
                },
                SocialProfile = new PetSocialProfile
                {
                    PetId = MochiId,
                    IsSocialEnabled = true,
                    ConsentedByUserId = AliceId
                },
                SafetySetting = new PetSafetySetting
                {
                    PetId = MochiId,
                    SafetyCode = "s-pubmochi",
                    QrSafetyEnabled = true,
                    ShowWhatsapp = true
                },
                Contact = new PetContact
                {
                    PetId = MochiId,
                    UseOwnerDefaults = true
                }
            });
            await db.SaveChangesAsync();

            return new Harness(db);
        }

        private static void AddOwner(
            MyPetLinkDbContext db,
            Guid id,
            string email,
            string accountName,
            string handle,
            string displayName)
        {
            db.Users.Add(new User
            {
                Id = id,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                DisplayName = accountName,
                PhoneE164 = "+60123456789",
                WhatsappE164 = "+60123456789",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = id,
                    OwnerDisplayName = accountName,
                    Plan = new Plan
                    {
                        Code = $"Free-{id:N}",
                        Name = "Free",
                        PriceLabel = "RM0",
                        Limit = new PlanLimit
                        {
                            MaxPets = 3,
                            MaxPrivateMemoriesPerPet = 10,
                            MaxMediaPerMemory = 5,
                            MaxFamilyMembers = 1,
                            MaxCareRecords = 100,
                            ScanHistoryDays = 0
                        }
                    }
                },
                SocialProfile = new OwnerSocialProfile
                {
                    UserId = id,
                    Handle = handle,
                    NormalizedHandle = handle.ToLowerInvariant(),
                    DisplayName = displayName,
                    NormalizedDisplayName = displayName.ToLowerInvariant(),
                    IsSocialEnabled = true,
                    IsDiscoverable = true,
                    AllowFollowers = true
                }
            });
        }

        public async Task SetPetSocialAsync(
            Guid petId,
            bool enabled,
            bool discoverable = true)
        {
            var profile = await Db.PetSocialProfiles.SingleAsync(item => item.PetId == petId);
            profile.IsSocialEnabled = enabled;
            profile.IsDiscoverable = discoverable;
            await Db.SaveChangesAsync();
        }

        public async Task SetPublicProfileAsync(Guid petId, bool enabled)
        {
            var profile = await Db.PetPublicProfiles.SingleAsync(item => item.PetId == petId);
            profile.IsPublicProfileEnabled = enabled;
            await Db.SaveChangesAsync();
        }

        public async Task SetLostModeAsync(Guid petId, bool lost)
        {
            var pet = await Db.Pets.SingleAsync(item => item.Id == petId);
            pet.LostModeEnabled = lost;
            await Db.SaveChangesAsync();
        }

        public async Task SetSocialAsync(Guid userId, bool enabled)
        {
            var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
            profile.IsSocialEnabled = enabled;
            await Db.SaveChangesAsync();
        }

        public async Task SetAllowFollowersAsync(Guid userId, bool allow)
        {
            var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
            profile.AllowFollowers = allow;
            await Db.SaveChangesAsync();
        }

        /// <summary>Adds extra social accounts and has each follow the handle.</summary>
        public async Task AddFollowersAsync(string handle, int count)
        {
            var targetId = await Db.OwnerSocialProfiles
                .Where(profile => profile.NormalizedHandle == handle.ToLowerInvariant())
                .Select(profile => profile.UserId)
                .SingleAsync();

            for (var index = 0; index < count; index++)
            {
                var id = Guid.Parse($"a95{index:D5}-1111-1111-1111-111111111111");
                var name = $"Follower{index}";
                AddOwner(Db, id, $"{name}@example.com", name, $"follower{index}", name);
                await Db.SaveChangesAsync();

                Db.OwnerFollows.Add(new OwnerFollow
                {
                    FollowerUserId = id,
                    FollowedUserId = targetId,
                    CreatedAt = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero)
                        .AddMinutes(index)
                });
                await Db.SaveChangesAsync();
            }
        }

        public void Dispose() => Db.Dispose();
    }
}
