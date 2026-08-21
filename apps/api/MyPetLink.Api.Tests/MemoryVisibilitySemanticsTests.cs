using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class MemoryVisibilitySemanticsTests
{
    private static readonly Guid OwnerId = Guid.Parse("a1111111-1111-1111-1111-111111111111");
    private static readonly Guid PetId = Guid.Parse("a2222222-2222-2222-2222-222222222222");

    [Theory]
    [InlineData(MemoryVisibility.Private, MemoryVisibility.Private, false)]
    [InlineData(MemoryVisibility.Public, MemoryVisibility.Public, true)]
    [InlineData(MemoryVisibility.FamilyOnly, MemoryVisibility.Private, false)]
    public async Task CreateAsync_NormalizesAudienceAndDerivesCompatibilityFlag(
        MemoryVisibility requestedVisibility,
        MemoryVisibility expectedVisibility,
        bool expectedShowOnPublicProfile)
    {
        using var harness = await Harness.CreateAsync();

        var response = await harness.Memories.CreateAsync(
            OwnerId,
            PetId,
            CreateRequest(
                requestedVisibility,
                showOnPublicProfile: !expectedShowOnPublicProfile,
                showInLifeTimeline: true));

        var saved = await harness.Db.PetMemories.SingleAsync();
        Assert.Equal(expectedVisibility, saved.Visibility);
        Assert.Equal(expectedShowOnPublicProfile, saved.ShowOnPublicProfile);
        Assert.True(saved.ShowInLifeTimeline);
        Assert.Equal(expectedVisibility, response.Visibility);
        Assert.Equal(expectedShowOnPublicProfile, response.ShowOnPublicProfile);
        Assert.True(response.ShowInLifeTimeline);
    }

    [Fact]
    public async Task UpdateAsync_NormalizesLegacyFamilyOnlyAndKeepsTimelinePlacement()
    {
        using var harness = await Harness.CreateAsync();
        var memory = await harness.AddMemoryAsync(
            "Legacy family memory",
            MemoryVisibility.FamilyOnly,
            showOnPublicProfile: true,
            showInLifeTimeline: true);

        var response = await harness.Memories.UpdateAsync(
            OwnerId,
            memory.Id,
            UpdateRequest(caption: "Updated safely"));

        var saved = await harness.Db.PetMemories.SingleAsync(item => item.Id == memory.Id);
        Assert.Equal(MemoryVisibility.Private, saved.Visibility);
        Assert.False(saved.ShowOnPublicProfile);
        Assert.True(saved.ShowInLifeTimeline);
        Assert.Equal(MemoryVisibility.Private, response.Visibility);
        Assert.False(response.ShowOnPublicProfile);
        Assert.True(response.ShowInLifeTimeline);
    }

    [Fact]
    public async Task UpdateAsync_PrivateTimelinePlacementPersistsWithoutBecomingPublic()
    {
        using var harness = await Harness.CreateAsync(showMoments: true, showTimeline: true);
        var memory = await harness.AddMemoryAsync(
            "Private timeline memory",
            MemoryVisibility.Private,
            showOnPublicProfile: false,
            showInLifeTimeline: false);

        var response = await harness.Memories.UpdateAsync(
            OwnerId,
            memory.Id,
            UpdateRequest(
                visibility: MemoryVisibility.Private,
                showOnPublicProfile: true,
                showInLifeTimeline: true));

        Assert.Equal(MemoryVisibility.Private, response.Visibility);
        Assert.False(response.ShowOnPublicProfile);
        Assert.True(response.ShowInLifeTimeline);
        Assert.Empty((await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123")).Memories);
    }

    [Fact]
    public async Task ListPrivate_IncludesLegacyFamilyOnlyAsEffectivePrivate()
    {
        using var harness = await Harness.CreateAsync();
        await harness.AddMemoryAsync("Private", MemoryVisibility.Private, false, false);
        await harness.AddMemoryAsync("Family", MemoryVisibility.FamilyOnly, false, true);
        await harness.AddMemoryAsync("Public", MemoryVisibility.Public, true, false);

        var (items, total) = await harness.Memories.ListForPetAsync(
            OwnerId,
            PetId,
            page: 1,
            pageSize: 10,
            visibility: "Private",
            includeArchived: false);

        Assert.Equal(2, total);
        Assert.All(items, item => Assert.Equal(MemoryVisibility.Private, item.Visibility));
        Assert.Contains(items, item => item.Title == "Family" && item.ShowInLifeTimeline);
    }

    [Fact]
    public async Task PublicProjection_EnforcesFullGalleryTimelineMatrixAndMediaBoundary()
    {
        using var harness = await Harness.CreateAsync();
        var publicTimeline = await harness.AddMemoryAsync(
            "Public timeline",
            MemoryVisibility.Public,
            showOnPublicProfile: false,
            showInLifeTimeline: true);
        await harness.AddMemoryAsync(
            "Public gallery only",
            MemoryVisibility.Public,
            showOnPublicProfile: false,
            showInLifeTimeline: false);
        var privateTimeline = await harness.AddMemoryAsync(
            "Private timeline",
            MemoryVisibility.Private,
            showOnPublicProfile: true,
            showInLifeTimeline: true);
        var familyTimeline = await harness.AddMemoryAsync(
            "Family timeline",
            MemoryVisibility.FamilyOnly,
            showOnPublicProfile: true,
            showInLifeTimeline: true);
        var publicMediaId = await harness.AddMediaAsync(publicTimeline, "public-timeline.jpg");
        await harness.AddMediaAsync(privateTimeline, "private-timeline.jpg");
        await harness.AddMediaAsync(familyTimeline, "family-timeline.jpg");

        var cases = new[]
        {
            new { ShowMoments = true, ShowTimeline = true, Gallery = new[] { "Public gallery only", "Public timeline" }, Timeline = new[] { "Public timeline" } },
            new { ShowMoments = true, ShowTimeline = false, Gallery = new[] { "Public gallery only", "Public timeline" }, Timeline = Array.Empty<string>() },
            new { ShowMoments = false, ShowTimeline = true, Gallery = Array.Empty<string>(), Timeline = new[] { "Public timeline" } },
            new { ShowMoments = false, ShowTimeline = false, Gallery = Array.Empty<string>(), Timeline = Array.Empty<string>() }
        };

        var profile = await harness.Db.PetPublicProfiles.SingleAsync();
        foreach (var testCase in cases)
        {
            profile.ShowMoments = testCase.ShowMoments;
            profile.ShowTimeline = testCase.ShowTimeline;
            await harness.Db.SaveChangesAsync();

            var response = await harness.PublicProfiles.GetByPublicSlugAsync("milo-pub123");
            var gallery = response.ShowMoments
                ? response.Memories.Select(item => item.Title).Order().ToArray()
                : Array.Empty<string>();
            var timeline = response.ShowTimeline
                ? response.Memories
                    .Where(item => item.ShowInLifeTimeline)
                    .Select(item => item.Title)
                    .Order()
                    .ToArray()
                : Array.Empty<string>();

            Assert.Equal(testCase.ShowMoments, response.ShowMoments);
            Assert.Equal(testCase.ShowTimeline, response.ShowTimeline);
            Assert.Equal(testCase.Gallery, gallery);
            Assert.Equal(testCase.Timeline, timeline);
            Assert.All(response.Memories, item => Assert.Equal(MemoryVisibility.Public, item.Visibility));
            Assert.All(response.Memories, item => Assert.Equal(testCase.ShowMoments, item.ShowOnPublicProfile));
            Assert.DoesNotContain(response.Memories, item => item.Title is "Private timeline" or "Family timeline");

            var publicMedia = response.Memories.SelectMany(item => item.Media).Select(item => item.Id).ToArray();
            if (response.Memories.Any(item => item.Title == "Public timeline"))
            {
                Assert.Contains(publicMediaId, publicMedia);
            }
            Assert.All(publicMedia, id => Assert.Equal(publicMediaId, id));
        }
    }

    private static CreateMemoryRequest CreateRequest(
        MemoryVisibility visibility,
        bool showOnPublicProfile,
        bool showInLifeTimeline) => new(
        Title: "A moment",
        Date: new DateOnly(2026, 8, 21),
        Type: "Memory",
        Caption: null,
        Visibility: visibility,
        ShowOnPublicProfile: showOnPublicProfile,
        ShowInLifeTimeline: showInLifeTimeline,
        TimelineNote: null,
        MediaFileIds: []);

    private static UpdateMemoryRequest UpdateRequest(
        string? caption = null,
        MemoryVisibility? visibility = null,
        bool? showOnPublicProfile = null,
        bool? showInLifeTimeline = null) => new(
        Title: null,
        Date: null,
        Type: null,
        Caption: caption,
        Visibility: visibility,
        ShowOnPublicProfile: showOnPublicProfile,
        ShowInLifeTimeline: showInLifeTimeline,
        TimelineNote: null,
        MediaFileIds: null);

    private sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db)
        {
            Db = db;
            Memories = new MemoryService(db, Options.Create(new CloudflareR2Options()));
            PublicProfiles = new PublicProfileService(db, Options.Create(new CloudflareR2Options()));
        }

        public MyPetLinkDbContext Db { get; }
        public MemoryService Memories { get; }
        public PublicProfileService PublicProfiles { get; }

        public static async Task<Harness> CreateAsync(
            bool showMoments = true,
            bool showTimeline = true)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var plan = new Plan
            {
                Code = "Free",
                Name = "Free",
                PriceLabel = "RM0",
                Limit = new PlanLimit
                {
                    MaxPets = 10,
                    MaxMemoriesPerPet = 20,
                    MaxMediaPerMemory = 5,
                    MaxFamilyMembers = 1,
                    MaxCareRecords = 100,
                    ScanHistoryDays = 0
                }
            };
            var owner = new User
            {
                Id = OwnerId,
                Email = "owner@example.com",
                NormalizedEmail = "OWNER@EXAMPLE.COM",
                DisplayName = "Owner",
                Status = UserStatus.Active,
                OwnerProfile = new OwnerProfile
                {
                    UserId = OwnerId,
                    OwnerDisplayName = "Owner",
                    Plan = plan
                }
            };
            var pet = new Pet
            {
                Id = PetId,
                OwnerUserId = OwnerId,
                OwnerUser = owner,
                Slug = "milo-pub123",
                Name = "Milo",
                Species = "Dog",
                PublicProfile = new PetPublicProfile
                {
                    PublicCode = "pub123",
                    SlugSnapshot = "milo-pub123",
                    IsPublicProfileEnabled = true,
                    ShowMoments = showMoments,
                    ShowTimeline = showTimeline
                }
            };

            db.Plans.Add(plan);
            db.Users.Add(owner);
            db.Pets.Add(pet);
            await db.SaveChangesAsync();
            return new Harness(db);
        }

        public async Task<PetMemory> AddMemoryAsync(
            string title,
            MemoryVisibility visibility,
            bool showOnPublicProfile,
            bool showInLifeTimeline)
        {
            var memory = new PetMemory
            {
                PetId = PetId,
                Title = title,
                MomentDate = new DateOnly(2026, 8, 21),
                Type = "Memory",
                Visibility = visibility,
                ShowOnPublicProfile = showOnPublicProfile,
                ShowInLifeTimeline = showInLifeTimeline
            };
            Db.PetMemories.Add(memory);
            await Db.SaveChangesAsync();
            return memory;
        }

        public async Task<Guid> AddMediaAsync(PetMemory memory, string fileName)
        {
            var media = new MediaFile
            {
                OwnerUserId = OwnerId,
                PetId = PetId,
                OriginalFileName = fileName,
                StorageFileName = fileName,
                ContentType = "image/jpeg",
                FileSize = 1024,
                StorageProvider = "R2",
                StoragePath = $"moments/{fileName}",
                BucketName = "public",
                ObjectKey = $"moments/{fileName}",
                MediaType = MediaFileType.Image,
                Category = MediaUploadCategory.MomentImage,
                IsPublic = true,
                UploadStatus = MediaUploadStatus.Ready,
                Sha256 = new string('a', 64)
            };
            Db.MediaFiles.Add(media);
            Db.MediaFileLinks.Add(new MediaFileLink
            {
                MediaFileId = media.Id,
                MediaFile = media,
                OwnerType = MediaOwnerType.PetMemory,
                OwnerId = memory.Id,
                SortOrder = 0,
                AltText = fileName
            });
            await Db.SaveChangesAsync();
            return media.Id;
        }

        public void Dispose() => Db.Dispose();
    }
}
