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
/// Likes on Moments.
///
/// A like is a person's gesture recorded against a piece of content. Nothing
/// here may touch a pet's safety surface, and nothing here may tell a blocked
/// account that it has been blocked.
/// </summary>
public sealed class MomentLikeTests
{
    private static readonly Guid AliceId = Guid.Parse("b1111111-1111-1111-1111-111111111111");
    private static readonly Guid BobId = Guid.Parse("b2222222-2222-2222-2222-222222222222");
    private static readonly Guid CarolId = Guid.Parse("b3333333-3333-3333-3333-333333333333");
    private static readonly Guid MochiId = Guid.Parse("b4444444-4444-4444-4444-444444444444");
    private static readonly Guid PublicMomentId = Guid.Parse("b5555555-5555-5555-5555-555555555555");
    private static readonly Guid PrivateMomentId = Guid.Parse("b6666666-6666-6666-6666-666666666666");

    [Fact]
    public async Task LikingAPublicMoment_RecordsItAndCountsIt()
    {
        using var harness = await Harness.CreateAsync();

        var result = await harness.Likes.LikeAsync(BobId, PublicMomentId);

        Assert.True(result.ViewerHasLiked);
        Assert.Equal(1, result.LikeCount);
        Assert.Single(await harness.Db.MomentLikes.ToListAsync());
    }

    [Fact]
    public async Task LikingTwice_IsIdempotent()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        var result = await harness.Likes.LikeAsync(BobId, PublicMomentId);

        Assert.Equal(1, result.LikeCount);
        Assert.Single(await harness.Db.MomentLikes.ToListAsync());
    }

    [Fact]
    public async Task Unliking_RemovesTheLikeAndIsIdempotent()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);

        var first = await harness.Likes.UnlikeAsync(BobId, PublicMomentId);
        var second = await harness.Likes.UnlikeAsync(BobId, PublicMomentId);

        Assert.False(first.ViewerHasLiked);
        Assert.Equal(0, first.LikeCount);
        Assert.Equal(0, second.LikeCount);
        Assert.Empty(await harness.Db.MomentLikes.ToListAsync());
    }

    [Fact]
    public async Task OnePersonsLike_DoesNotRemoveAnothers()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        await harness.Likes.LikeAsync(CarolId, PublicMomentId);

        var afterBobLeaves = await harness.Likes.UnlikeAsync(BobId, PublicMomentId);

        Assert.Equal(1, afterBobLeaves.LikeCount);
        Assert.False(afterBobLeaves.ViewerHasLiked);

        var carol = await harness.Likes.GetAsync(CarolId, PublicMomentId);
        Assert.True(carol.ViewerHasLiked);
    }

    [Fact]
    public async Task AnAnonymousCallerCannotLike()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(null, PublicMomentId));

        Assert.Equal(StatusCodes.Status401Unauthorized, error.StatusCode);
    }

    [Fact]
    public async Task AnAuthorMayLikeTheirOwnMoment()
    {
        using var harness = await Harness.CreateAsync();

        var result = await harness.Likes.LikeAsync(AliceId, PublicMomentId);

        Assert.True(result.ViewerHasLiked);
    }

    [Fact]
    public async Task APrivateMoment_CannotBeLiked()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(BobId, PrivateMomentId));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
        Assert.Empty(await harness.Db.MomentLikes.ToListAsync());
    }

    [Fact]
    public async Task AMomentWhoseAuthorLeftSocial_CannotBeLiked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetSocialAsync(AliceId, enabled: false);

        var error = await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(BobId, PublicMomentId));

        Assert.Equal(StatusCodes.Status404NotFound, error.StatusCode);
    }

    [Fact]
    public async Task AnUnpublishedMoment_CannotBeLiked()
    {
        using var harness = await Harness.CreateAsync();
        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == PublicMomentId);
        moment.PublishedAt = null;
        await harness.Db.SaveChangesAsync();

        await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(BobId, PublicMomentId));
    }

    [Fact]
    public async Task AMomentThatDoesNotExist_AndOneBehindABlock_GiveTheSameAnswer()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        var blocked = await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(BobId, PublicMomentId));
        var missing = await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(BobId, Guid.NewGuid()));

        // Identical status, code and message. A blocked account must not be
        // able to discover the block by probing a like.
        Assert.Equal(missing.StatusCode, blocked.StatusCode);
        Assert.Equal(missing.Code, blocked.Code);
        Assert.Equal(missing.Message, blocked.Message);
    }

    [Fact]
    public async Task ABlockerCannotLikeTheAccountTheyBlocked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Graph.BlockAsync(BobId, "tanfamily", null);

        await Assert.ThrowsAsync<ApiException>(
            () => harness.Likes.LikeAsync(BobId, PublicMomentId));
    }

    [Fact]
    public async Task ABlockedAccount_CanStillTakeBackALikeItLeftEarlier()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        await harness.Graph.BlockAsync(AliceId, "limfamily", null);

        var result = await harness.Likes.UnlikeAsync(BobId, PublicMomentId);

        // Withdrawing is never the thing to refuse: the like is Bob's, and a
        // block must not strand it where he can no longer reach it.
        Assert.False(result.ViewerHasLiked);
        Assert.Empty(await harness.Db.MomentLikes.ToListAsync());
    }

    [Fact]
    public async Task ALikeOnAMomentSinceMadePrivate_CanStillBeWithdrawn()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);

        var moment = await harness.Db.PetMemories.SingleAsync(item => item.Id == PublicMomentId);
        moment.Visibility = MemoryVisibility.Private;
        await harness.Db.SaveChangesAsync();

        var result = await harness.Likes.UnlikeAsync(BobId, PublicMomentId);

        Assert.Equal(0, result.LikeCount);
    }

    [Fact]
    public async Task CountsAreComputedFromTheRowsRatherThanStored()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        await harness.Likes.LikeAsync(CarolId, PublicMomentId);

        var result = await harness.Likes.GetAsync(null, PublicMomentId);

        Assert.Equal(2, result.LikeCount);
        Assert.False(result.ViewerHasLiked);

        // No counter column exists on the Moment for those rows to drift from.
        Assert.DoesNotContain(
            typeof(PetMemory).GetProperties(),
            property => property.Name.Contains("LikeCount", StringComparison.Ordinal));
    }

    [Fact]
    public async Task APublicListing_ReportsTheCountAndWhatTheViewerHasLiked()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        await harness.Likes.LikeAsync(CarolId, PublicMomentId);

        var forBob = await harness.PublicProfiles.GetOwnerMomentsAsync(
            "tanfamily", null, null, BobId);
        var forStranger = await harness.PublicProfiles.GetOwnerMomentsAsync(
            "tanfamily", null, null, null);

        var bobsView = Assert.Single(forBob.Items);
        var strangersView = Assert.Single(forStranger.Items);

        Assert.Equal(2, bobsView.LikeCount);
        Assert.True(bobsView.ViewerHasLiked);

        // The same content and the same count. Only "did you like this" differs,
        // and for a visitor with no session there is nobody for it to be true of.
        Assert.Equal(2, strangersView.LikeCount);
        Assert.False(strangersView.ViewerHasLiked);
    }

    [Fact]
    public async Task LikingWritesNoSafetyOrTagRow()
    {
        using var harness = await Harness.CreateAsync();

        var safetyBefore = await harness.Db.PetSafetySettings.AsNoTracking().ToListAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        var safetyAfter = await harness.Db.PetSafetySettings.AsNoTracking().ToListAsync();

        Assert.Equal(safetyBefore.Count, safetyAfter.Count);
        Assert.All(safetyAfter, setting => Assert.True(setting.QrSafetyEnabled));
        Assert.Empty(await harness.Db.TagScans.ToListAsync());
    }

    [Fact]
    public async Task ABlockedFinder_CanStillReachTheSafetyProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Likes.LikeAsync(BobId, PublicMomentId);
        await harness.Graph.BlockAsync(AliceId, "limfamily", "social dispute");

        var safetyPage = await harness.Safety.GetBySafetyCodeAsync("s-pubmochi");

        Assert.Equal("Mochi", safetyPage.Name);
        Assert.NotNull(safetyPage.Contact);
        Assert.Equal("+60123456789", safetyPage.Contact!.WhatsappE164);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            var r2 = Options.Create(new CloudflareR2Options());
            Notifications = new OwnerNotificationService(db, r2);
            Likes = new MomentLikeService(db, Notifications);
            Graph = new SocialGraphService(db, r2, Notifications);
            PublicProfiles = new PublicSocialProfileService(
                db,
                Options.Create(new CloudflareR2Options()),
                new SocialMomentProjection(db, Options.Create(new CloudflareR2Options())));
            Safety = new QrSafetyService(db, Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }

        public MomentLikeService Likes { get; }

        public OwnerNotificationService Notifications { get; }

        public SocialGraphService Graph { get; }

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
                    ShowMoments = true
                },
                SocialProfile = new PetSocialProfile { PetId = MochiId, IsSocialEnabled = true },
                SafetySetting = new PetSafetySetting
                {
                    PetId = MochiId,
                    SafetyCode = "s-pubmochi",
                    QrSafetyEnabled = true,
                    ShowWhatsapp = true
                },
                Contact = new PetContact { PetId = MochiId, UseOwnerDefaults = true }
            });

            db.PetMemories.Add(new PetMemory
            {
                Id = PublicMomentId,
                PetId = MochiId,
                AuthorUserId = AliceId,
                Title = "Beach day",
                Type = "Memory",
                Visibility = MemoryVisibility.Public,
                PublishedAt = DateTimeOffset.UtcNow.AddMinutes(-5)
            });

            db.PetMemories.Add(new PetMemory
            {
                Id = PrivateMomentId,
                PetId = MochiId,
                AuthorUserId = AliceId,
                Title = "Vet visit",
                Type = "Memory",
                Visibility = MemoryVisibility.Private
            });

            await db.SaveChangesAsync();

            return new Harness(db);
        }

        public async Task SetSocialAsync(Guid userId, bool enabled)
        {
            var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
            profile.IsSocialEnabled = enabled;
            await Db.SaveChangesAsync();
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

        public void Dispose()
        {
            Db.Dispose();
        }
    }
}
