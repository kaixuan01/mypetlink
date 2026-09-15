using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The public social read surface: owner profiles, handle resolution, and the
/// cursor-paginated Moment listings.
///
/// The gating tests are the important ones. Social visibility is four separate
/// consents layered on top of each other, and each has to be able to withhold a
/// profile on its own.
/// </summary>
public sealed class PublicSocialProfileTests
{
    private static readonly Guid AliceId = Guid.Parse("f1111111-1111-1111-1111-111111111111");
    private static readonly Guid BobId = Guid.Parse("f2222222-2222-2222-2222-222222222222");
    private static readonly Guid MochiId = Guid.Parse("f3333333-3333-3333-3333-333333333333");
    private static readonly Guid CocoId = Guid.Parse("f4444444-4444-4444-4444-444444444444");

    [Fact]
    public async Task AnOwnerProfile_ShowsTheSocialIdentityAndTheEligiblePets()
    {
        using var harness = await Harness.CreateAsync();

        var profile = await harness.Social.GetOwnerProfileAsync("tanfamily");

        Assert.Equal("TanFamily", profile.Handle);
        Assert.Equal("The Tan Family", profile.DisplayName);
        Assert.Equal("Two cats, one very patient sofa.", profile.Bio);
        Assert.Equal(2, profile.Pets.Count);
        Assert.Contains(profile.Pets, pet => pet.Name == "Mochi");
    }

    [Fact]
    public async Task AnOwnerProfile_CarriesNoAccountOrFinderValue()
    {
        using var harness = await Harness.CreateAsync();

        var profile = await harness.Social.GetOwnerProfileAsync("tanfamily");
        var serialized = System.Text.Json.JsonSerializer.Serialize(profile);

        Assert.DoesNotContain("sarah.tan@example.com", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Sarah Tan", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("+60123456789", serialized, StringComparison.Ordinal);
        Assert.DoesNotContain("safety", serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("MPL-", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnOwnerWithSocialOff_HasNoPublicProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetOwnerSocialAsync(AliceId, enabled: false);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.GetOwnerProfileAsync("tanfamily"));
    }

    [Fact]
    public async Task DisablingOwnerSocial_RemovesTheAvatarFromEverySocialProjection()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AttachOwnerAvatarAsync(AliceId);

        var enabled = await harness.Social.GetOwnerProfileAsync("tanfamily");
        Assert.NotNull(enabled.AvatarUrl);

        await harness.SetOwnerSocialAsync(AliceId, enabled: false);

        // The owner profile is gone entirely...
        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.GetOwnerProfileAsync("tanfamily"));

        // ...and the pet page stops carrying the attribution, and with it the
        // avatar. Switching social off must remove the picture from every social
        // surface, not merely hide the name above it.
        var pet = await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        Assert.Null(pet.SharedBy);
    }

    [Fact]
    public async Task APetWithSocialOff_IsNotListedOnTheOwnerProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(CocoId, enabled: false);

        var profile = await harness.Social.GetOwnerProfileAsync("tanfamily");

        // Owning a pet is not a reason to publish it.
        Assert.Single(profile.Pets);
        Assert.Equal("Mochi", profile.Pets.Single().Name);
    }

    [Fact]
    public async Task APetWithAShareLinkButNoSocial_ShowsNoAttribution()
    {
        using var harness = await Harness.CreateAsync();
        await harness.SetPetSocialAsync(MochiId, enabled: false);

        var pet = await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi");

        // The share page still works — that consent is unchanged — but it credits
        // nobody, because the pet is not in the social network.
        Assert.NotNull(pet.PublicCode);
        Assert.Null(pet.SharedBy);
        Assert.False(pet.IsSocialEnabled);
    }

    [Fact]
    public async Task APetProfile_CreditsTheOwnerSocialIdentityOnly()
    {
        using var harness = await Harness.CreateAsync();

        var pet = await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi");

        Assert.NotNull(pet.SharedBy);
        Assert.Equal("TanFamily", pet.SharedBy!.Handle);
        Assert.Equal("The Tan Family", pet.SharedBy.DisplayName);

        // Never the finder-facing owner name, which is a different identity for a
        // different audience.
        Assert.NotEqual("Sarah Tan", pet.SharedBy.DisplayName);
    }

    [Fact]
    public async Task TheSmartTagBadge_IsDerivedFromAnActiveTag()
    {
        using var harness = await Harness.CreateAsync();

        Assert.False((await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi"))
            .HasSmartTagProtection);

        await harness.AddSmartTagAsync(MochiId, SmartTagStatus.Active);

        var pet = await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi");
        Assert.True(pet.HasSmartTagProtection);

        // A signal only: nothing about the tag itself is exposed.
        var serialized = System.Text.Json.JsonSerializer.Serialize(pet);
        Assert.DoesNotContain("MPL-", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnInactiveSmartTag_DoesNotEarnTheBadge()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddSmartTagAsync(MochiId, SmartTagStatus.Disabled);

        Assert.False((await harness.PublicProfiles.GetByPublicSlugAsync("mochi-pubmochi"))
            .HasSmartTagProtection);
    }

    [Fact]
    public async Task OwnerMoments_ArePagedNewestFirstWithoutRepeatingOrSkipping()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddPublicMomentsAsync(MochiId, 7);

        var first = await harness.Social.GetOwnerMomentsAsync("tanfamily", null, 3);
        Assert.Equal(3, first.Items.Count);
        Assert.NotNull(first.NextCursor);

        var second = await harness.Social.GetOwnerMomentsAsync("tanfamily", first.NextCursor, 3);
        var third = await harness.Social.GetOwnerMomentsAsync("tanfamily", second.NextCursor, 3);

        Assert.Equal(3, second.Items.Count);
        Assert.Single(third.Items);
        Assert.Null(third.NextCursor);

        var ids = first.Items.Concat(second.Items).Concat(third.Items)
            .Select(item => item.Id)
            .ToArray();

        Assert.Equal(7, ids.Length);
        Assert.Equal(7, ids.Distinct().Count());

        var publishedAt = first.Items.Concat(second.Items).Concat(third.Items)
            .Select(item => item.PublishedAt)
            .ToArray();
        Assert.Equal(publishedAt.OrderByDescending(value => value), publishedAt);
    }

    [Fact]
    public async Task AMultiPetMoment_AppearsOnceOnTheOwnerProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddPublicMomentAsync(MochiId, "Beach day", [CocoId]);

        var page = await harness.Social.GetOwnerMomentsAsync("tanfamily", null, 20);

        // One Moment, however many of the owner's pets it features.
        Assert.Single(page.Items);
        Assert.Equal(2, page.Items.Single().Subjects.Count);
    }

    [Fact]
    public async Task AMultiPetMoment_AppearsOnceOnEachSubjectPetProfile()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddPublicMomentAsync(MochiId, "Beach day", [CocoId]);

        var mochi = await harness.Social.GetPetMomentsAsync("mochi-pubmochi", null, 20);
        var coco = await harness.Social.GetPetMomentsAsync("coco-pubcoco", null, 20);

        Assert.Single(mochi.Items);
        Assert.Single(coco.Items);
    }

    [Fact]
    public async Task APrivateMoment_NeverAppearsInASocialListing()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddPrivateMomentAsync(MochiId);

        Assert.Empty((await harness.Social.GetOwnerMomentsAsync("tanfamily", null, 20)).Items);
        Assert.Empty((await harness.Social.GetPetMomentsAsync("mochi-pubmochi", null, 20)).Items);
    }

    [Fact]
    public async Task ThePageSize_IsClampedSoAListingCannotBeUnbounded()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddPublicMomentsAsync(MochiId, SocialCursor.MaxPageSize + 5);

        var page = await harness.Social.GetOwnerMomentsAsync("tanfamily", null, 100_000);

        Assert.Equal(SocialCursor.MaxPageSize, page.Items.Count);
        Assert.NotNull(page.NextCursor);
    }

    [Fact]
    public async Task AMalformedCursor_ReturnsTheFirstPageRatherThanAnError()
    {
        // Cursors end up in shared URLs and browser history. A stale one should
        // show the first page, not an error screen.
        using var harness = await Harness.CreateAsync();
        await harness.AddPublicMomentsAsync(MochiId, 3);

        var page = await harness.Social.GetOwnerMomentsAsync("tanfamily", "not-a-cursor", 10);

        Assert.Equal(3, page.Items.Count);
    }

    [Fact]
    public async Task AHandle_ResolvesToItself()
    {
        using var harness = await Harness.CreateAsync();

        var resolution = await harness.Social.ResolveHandleAsync("tanfamily");

        Assert.Equal("current", resolution.State);
        Assert.Equal("TanFamily", resolution.CurrentHandle);
    }

    [Fact]
    public async Task AnOldHandle_ResolvesToTheCurrentOne()
    {
        using var harness = await Harness.CreateAsync();
        await harness.RenameHandleAsync(AliceId, "tanhousehold");

        var resolution = await harness.Social.ResolveHandleAsync("tanfamily");

        Assert.Equal("moved", resolution.State);
        Assert.Equal("tanhousehold", resolution.CurrentHandle);
    }

    [Fact]
    public async Task AnOldHandle_RevealsNothingAboutTheAccountBehindIt()
    {
        using var harness = await Harness.CreateAsync();
        await harness.RenameHandleAsync(AliceId, "tanhousehold");

        var resolution = await harness.Social.ResolveHandleAsync("tanfamily");
        var serialized = System.Text.Json.JsonSerializer.Serialize(resolution);

        // Only the destination handle. Never who held it, when, or an account id.
        Assert.DoesNotContain(AliceId.ToString(), serialized, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sarah", serialized, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task AnUnknownHandle_IsNotFound()
    {
        using var harness = await Harness.CreateAsync();

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ResolveHandleAsync("nobody"));
    }

    [Fact]
    public async Task AnOldHandle_StopsResolvingOnceItsAccountLeavesSocial()
    {
        using var harness = await Harness.CreateAsync();
        await harness.RenameHandleAsync(AliceId, "tanhousehold");
        await harness.SetOwnerSocialAsync(AliceId, enabled: false);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Social.ResolveHandleAsync("tanfamily"));
    }

    [Fact]
    public async Task AnotherOwnerMoments_AreNotReturnedForThisHandle()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddPublicMomentsAsync(MochiId, 2);

        var bobPage = await harness.Social.GetOwnerMomentsAsync("limfamily", null, 20);

        Assert.Empty(bobPage.Items);
    }

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            Social = new PublicSocialProfileService(
                db,
                Options.Create(new CloudflareR2Options()),
                new SocialMomentProjection(db, Options.Create(new CloudflareR2Options())));
            PublicProfiles = new PublicProfileService(
                db,
                Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }

        public PublicSocialProfileService Social { get; }

        public PublicProfileService PublicProfiles { get; }

        private int _momentSequence;

        public static async Task<Harness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);

            AddOwner(db, AliceId, "sarah.tan@example.com", "Sarah Tan", "TanFamily", "The Tan Family");
            AddOwner(db, BobId, "lim@example.com", "Wei Lim", "LimFamily", "The Lim Family");
            await db.SaveChangesAsync();

            AddPet(db, MochiId, AliceId, "Mochi", "pubmochi");
            AddPet(db, CocoId, AliceId, "Coco", "pubcoco");
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
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = id,
                    // The finder-facing name: a real name, deliberately.
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
                    Bio = "Two cats, one very patient sofa.",
                    IsSocialEnabled = true,
                    IsDiscoverable = true,
                    AllowFollowers = true
                }
            });
        }

        private static void AddPet(
            MyPetLinkDbContext db,
            Guid petId,
            Guid ownerId,
            string name,
            string publicCode)
        {
            var slug = $"{name.ToLowerInvariant()}-{publicCode}";

            db.Pets.Add(new Pet
            {
                Id = petId,
                OwnerUserId = ownerId,
                Slug = slug,
                Name = name,
                Species = "Cat",
                PublicProfile = new PetPublicProfile
                {
                    PetId = petId,
                    PublicCode = publicCode,
                    SlugSnapshot = slug,
                    IsPublicProfileEnabled = true,
                    ShowMoments = true,
                    ShowTimeline = true
                },
                SocialProfile = new PetSocialProfile
                {
                    PetId = petId,
                    IsSocialEnabled = true,
                    IsDiscoverable = true
                },
                SafetySetting = new PetSafetySetting
                {
                    PetId = petId,
                    SafetyCode = $"s-{publicCode}",
                    QrSafetyEnabled = true
                }
            });
        }

        public async Task SetOwnerSocialAsync(Guid userId, bool enabled)
        {
            var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
            profile.IsSocialEnabled = enabled;
            await Db.SaveChangesAsync();
        }

        public async Task SetPetSocialAsync(Guid petId, bool enabled)
        {
            var profile = await Db.PetSocialProfiles.SingleAsync(item => item.PetId == petId);
            profile.IsSocialEnabled = enabled;
            await Db.SaveChangesAsync();
        }

        public async Task AttachOwnerAvatarAsync(Guid userId)
        {
            var media = new MediaFile
            {
                OwnerUserId = userId,
                OriginalFileName = "avatar.jpg",
                StorageFileName = "avatar.jpg",
                ContentType = "image/jpeg",
                FileSize = 1024,
                StorageProvider = "CloudflareR2",
                StoragePath = "owner-avatars/abc.jpg",
                BucketName = "mypetlink-public-media",
                ObjectKey = "owner-avatars/abc.jpg",
                MediaType = MediaFileType.Image,
                Category = MediaUploadCategory.OwnerAvatar,
                IsPublic = true,
                UploadStatus = MediaUploadStatus.Ready
            };
            Db.MediaFiles.Add(media);

            var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);
            profile.AvatarMediaFileId = media.Id;
            await Db.SaveChangesAsync();
        }

        public async Task AddSmartTagAsync(Guid petId, SmartTagStatus status)
        {
            Db.SmartTags.Add(new SmartTag
            {
                TagCode = $"MPL-TEST-{petId:N}"[..13],
                PetId = petId,
                OwnerUserId = AliceId,
                Status = status,
                HasNfc = true
            });
            await Db.SaveChangesAsync();
        }

        public async Task RenameHandleAsync(Guid userId, string newHandle)
        {
            var profile = await Db.OwnerSocialProfiles.SingleAsync(item => item.UserId == userId);

            Db.OwnerHandleHistories.Add(new OwnerHandleHistory
            {
                UserId = userId,
                Handle = profile.Handle!,
                NormalizedHandle = profile.NormalizedHandle!,
                ChangedAt = DateTimeOffset.UtcNow
            });

            profile.Handle = newHandle;
            profile.NormalizedHandle = newHandle.ToLowerInvariant();
            await Db.SaveChangesAsync();
        }

        public Task AddPublicMomentsAsync(Guid petId, int count)
        {
            for (var index = 0; index < count; index++)
            {
                AddMoment(petId, $"Moment {index}", MemoryVisibility.Public, []);
            }

            return Db.SaveChangesAsync();
        }

        public Task AddPublicMomentAsync(Guid petId, string title, Guid[] additionalPetIds)
        {
            AddMoment(petId, title, MemoryVisibility.Public, additionalPetIds);
            return Db.SaveChangesAsync();
        }

        public Task AddPrivateMomentAsync(Guid petId)
        {
            AddMoment(petId, "Private", MemoryVisibility.Private, []);
            return Db.SaveChangesAsync();
        }

        private void AddMoment(
            Guid petId,
            string title,
            MemoryVisibility visibility,
            Guid[] additionalPetIds)
        {
            var moment = new PetMemory
            {
                PetId = petId,
                AuthorUserId = Db.Pets.Single(pet => pet.Id == petId).OwnerUserId,
                Title = title,
                Type = "Memory",
                Visibility = visibility,
                PublishedAt = visibility == MemoryVisibility.Public
                    ? new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero)
                        .AddMinutes(_momentSequence++)
                    : null
            };

            Db.PetMemories.Add(moment);
            Db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = petId });

            foreach (var additional in additionalPetIds)
            {
                Db.MomentPets.Add(new MomentPet { MomentId = moment.Id, PetId = additional });
            }
        }

        public void Dispose() => Db.Dispose();
    }
}
