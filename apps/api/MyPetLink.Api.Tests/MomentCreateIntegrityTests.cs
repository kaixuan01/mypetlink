using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

/// <summary>
/// Creating a Moment with media, end to end through the real media and Moment
/// services, against a storage double that can succeed or fail per file.
///
/// The lifecycle these pin:
///   1. every file is uploaded UNLINKED — initializing and completing an upload
///      attaches it to nothing, so nothing is ever shown half-uploaded;
///   2. one create names those files, and the Moment, its subjects and its
///      media links are written in one save — or not at all;
///   3. a create attempt's idempotency key makes every retry of it return the
///      same Moment instead of writing another.
/// </summary>
public sealed class MomentCreateIntegrityTests
{
    internal static readonly Guid OwnerId = Guid.Parse("b1111111-1111-1111-1111-111111111111");
    internal static readonly Guid OtherOwnerId = Guid.Parse("b2222222-2222-2222-2222-222222222222");
    internal static readonly Guid PetId = Guid.Parse("b3333333-3333-3333-3333-333333333333");
    internal static readonly Guid SecondPetId = Guid.Parse("b4444444-4444-4444-4444-444444444444");
    internal static readonly Guid OtherPetId = Guid.Parse("b5555555-5555-5555-5555-555555555555");

    // ---- The lifecycle -----------------------------------------------------

    [Fact]
    public async Task CreateWithNoMedia_WritesOneMoment()
    {
        using var harness = await Harness.CreateAsync();

        var created = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap"));

        Assert.Empty(created.Media);
        Assert.Single(await harness.Db.PetMemories.ToListAsync());
    }

    [Fact]
    public async Task UploadedFiles_AreAttachedToNothing_UntilTheCreateThatNamesThem()
    {
        using var harness = await Harness.CreateAsync();

        var first = await harness.UploadAsync("one.jpg");
        var second = await harness.UploadAsync("two.jpg");
        var third = await harness.UploadAsync("three.jpg");

        // Ready, and linked to nothing: no Moment exists, nothing is public.
        Assert.Empty(await harness.Db.MediaFileLinks.ToListAsync());
        Assert.Empty(await harness.Db.PetMemories.ToListAsync());
        Assert.Empty((await harness.ShareProfile()).Memories);

        var created = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [first, second, third]));

        Assert.Equal([first, second, third], created.Media.Select(media => media.Id).ToArray());
        Assert.Equal(first, created.CoverMediaId);
        var shared = Assert.Single((await harness.ShareProfile()).Memories);
        Assert.Equal(3, shared.Media.Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public async Task AFailedUpload_LeavesNoMoment_AndNothingPublic(int failingIndex)
    {
        using var harness = await Harness.CreateAsync();
        var uploaded = new List<Guid>();

        for (var index = 0; index < 3; index++)
        {
            if (index == failingIndex)
            {
                // The object never arrives; completion refuses, and the client
                // (cleanupOnFailure) deletes the pending record.
                var pending = await harness.InitializeAsync($"file{index}.jpg");
                await Assert.ThrowsAsync<ApiException>(() => harness.Media.CompleteUploadAsync(OwnerId, pending));
                await harness.Media.DeleteAsync(OwnerId, pending);
                break;
            }

            uploaded.Add(await harness.UploadAsync($"file{index}.jpg"));
        }

        // The client stops here: no create was sent. Nothing exists to see.
        Assert.Empty(await harness.Db.PetMemories.ToListAsync());
        Assert.Empty(await harness.Db.MediaFileLinks.ToListAsync());
        Assert.Empty((await harness.ShareProfile()).Memories);
        Assert.All(
            await harness.Db.MediaFiles.Where(media => !uploaded.Contains(media.Id)).ToListAsync(),
            media => Assert.NotNull(media.DeletedAt));
        Assert.Single(harness.Storage.DeletedObjects);
    }

    [Fact]
    public async Task RetryAfterAFailedUpload_UploadsOnlyTheMissingFile_AndCreatesOneMoment()
    {
        using var harness = await Harness.CreateAsync();
        var key = Guid.NewGuid().ToString();
        var first = await harness.UploadAsync("one.jpg");
        var failed = await harness.InitializeAsync("two.jpg");
        await Assert.ThrowsAsync<ApiException>(() => harness.Media.CompleteUploadAsync(OwnerId, failed));

        // Retry: the first file is reused, the second uploaded again.
        var second = await harness.UploadAsync("two.jpg");
        var created = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [first, second], key));

        Assert.Equal([first, second], created.Media.Select(media => media.Id).ToArray());
        Assert.Single(await harness.Db.PetMemories.ToListAsync());
    }

    // ---- All or nothing ------------------------------------------------------

    [Theory]
    [InlineData("pending")]
    [InlineData("other-owner")]
    [InlineData("other-pet")]
    [InlineData("deleted")]
    public async Task ACreateNamingUnusableMedia_IsRefused_AndWritesNothing(string problem)
    {
        using var harness = await Harness.CreateAsync();
        var good = await harness.UploadAsync("good.jpg");
        var bad = problem switch
        {
            "pending" => await harness.InitializeAsync("pending.jpg"),
            "other-owner" => await harness.UploadAsync("theirs.jpg", OtherOwnerId, OtherPetId),
            "other-pet" => await harness.UploadAsync("second.jpg", OwnerId, SecondPetId),
            _ => await harness.UploadThenDeleteAsync("gone.jpg")
        };

        var error = await Assert.ThrowsAsync<ApiException>(() => harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [good, bad], "attempt-1")));

        Assert.Equal("validation_failed", error.Code);
        // It used to save the Moment first and attach after: a public Moment
        // with no media was left behind by every rejected attach.
        Assert.Empty(await harness.Db.PetMemories.ToListAsync());
        Assert.Empty(await harness.Db.MediaFileLinks.ToListAsync());
        Assert.Empty((await harness.ShareProfile()).Memories);
    }

    // ---- Once per attempt ----------------------------------------------------

    [Fact]
    public async Task ARetryWithTheSameKey_ReturnsTheSameMoment_AndWritesNothing()
    {
        using var harness = await Harness.CreateAsync();
        var file = await harness.UploadAsync("one.jpg");

        var first = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [file], "attempt-1"));
        // The answer was lost; the client retries the same attempt.
        var second = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [file], "attempt-1"));

        Assert.Equal(first.Id, second.Id);
        Assert.Single(await harness.Db.PetMemories.ToListAsync());
        Assert.Single(await harness.Db.MediaFileLinks.ToListAsync());
        Assert.Single((await harness.ShareProfile()).Memories);
    }

    [Fact]
    public async Task AReplay_IsTheFirstRequest_WhateverTheRetrySays()
    {
        using var harness = await Harness.CreateAsync();

        var first = await harness.Memories.CreateAsync(OwnerId, PetId, Request("First", key: "attempt-1"));
        var replay = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Edited meanwhile", key: "attempt-1"));

        Assert.Equal(first.Id, replay.Id);
        Assert.Equal("First", replay.Title);
    }

    [Fact]
    public async Task AReplay_IsNotChargedAgainstThePrivateAllowance()
    {
        using var harness = await Harness.CreateAsync(maxPrivateMomentsPerPet: 1);

        var first = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Only me", key: "attempt-1"));
        var replay = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Only me", key: "attempt-1"));

        Assert.Equal(first.Id, replay.Id);
        // A genuinely new private Moment is still refused at the limit.
        var limited = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.CreateAsync(OwnerId, PetId, Request("Another", key: "attempt-2")));
        Assert.Equal("plan_limit_reached", limited.Code);
    }

    [Fact]
    public async Task AReplay_StillAnswers_AfterThePetIsArchived()
    {
        using var harness = await Harness.CreateAsync();
        var first = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap", key: "attempt-1"));
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        pet.LifecycleStatus = PetLifecycleStatus.Archived;
        await harness.Db.SaveChangesAsync();

        var replay = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap", key: "attempt-1"));

        Assert.Equal(first.Id, replay.Id);
    }

    [Fact]
    public async Task AKeyReusedForAnotherPet_IsRefused()
    {
        using var harness = await Harness.CreateAsync();
        await harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap", key: "attempt-1"));

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.CreateAsync(OwnerId, SecondPetId, Request("Nap", key: "attempt-1")));

        Assert.Equal(StatusCodes.Status409Conflict, error.StatusCode);
        Assert.Equal("idempotency_key_reused", error.Code);
        Assert.Single(await harness.Db.PetMemories.ToListAsync());
    }

    [Fact]
    public async Task Keys_BelongToTheirAuthor()
    {
        using var harness = await Harness.CreateAsync();

        var mine = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Mine", key: "same-key"));
        var theirs = await harness.Memories.CreateAsync(OtherOwnerId, OtherPetId, Request("Theirs", key: "same-key"));

        Assert.NotEqual(mine.Id, theirs.Id);
        Assert.Equal(2, await harness.Db.PetMemories.CountAsync());
    }

    [Fact]
    public async Task WithoutAKey_EachRequestIsItsOwnMoment()
    {
        using var harness = await Harness.CreateAsync();

        await harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap"));
        await harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap"));

        Assert.Equal(2, await harness.Db.PetMemories.CountAsync());
    }

    [Fact]
    public async Task AnOverlongKey_IsRefused()
    {
        using var harness = await Harness.CreateAsync();

        var error = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.CreateAsync(OwnerId, PetId, Request("Nap", key: new string('k', 81))));

        Assert.Equal("validation_failed", error.Code);
    }

    // ---- Privacy through failure and retry -----------------------------------

    [Fact]
    public async Task AnOnlyMeMoment_StaysPrivate_ThroughAFailedUploadAndItsRetry()
    {
        using var harness = await Harness.CreateAsync();
        var first = await harness.UploadAsync("one.jpg");
        var failed = await harness.InitializeAsync("two.jpg");
        await Assert.ThrowsAsync<ApiException>(() => harness.Media.CompleteUploadAsync(OwnerId, failed));
        var second = await harness.UploadAsync("two.jpg");

        var created = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Only me", MemoryVisibility.Private, [first, second], "attempt-1"));

        Assert.Equal(MemoryVisibility.Private, created.Visibility);
        Assert.Null((await harness.Db.PetMemories.SingleAsync()).PublishedAt);
        Assert.Empty((await harness.ShareProfile()).Memories);
    }

    // ---- Uploads for Moments link nothing, and stay owner-only ---------------

    [Fact]
    public async Task AnUploadNamingAMoment_ChecksOwnership_ButLinksNothing()
    {
        using var harness = await Harness.CreateAsync();
        var existing = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Beach day", MemoryVisibility.Public));

        // What a create-then-upload client (an older page) sends.
        var mediaId = await harness.UploadAsync("late.jpg", momentId: existing.Id);

        Assert.Empty(await harness.Db.MediaFileLinks.ToListAsync());
        Assert.Empty((await harness.Memories.GetAsync(OwnerId, existing.Id)).Media);

        // It joins the Moment only when a save names it.
        var updated = await harness.Memories.UpdateAsync(OwnerId, existing.Id, UpdateMedia([mediaId]));
        Assert.Equal([mediaId], updated.Media.Select(media => media.Id).ToArray());
    }

    [Fact]
    public async Task NobodyCanUploadForAnotherOwnersPetOrMoment()
    {
        using var harness = await Harness.CreateAsync();
        var theirMoment = await harness.Memories.CreateAsync(OtherOwnerId, OtherPetId, Request("Theirs"));

        await Assert.ThrowsAsync<ApiException>(() => harness.InitializeAsync("x.jpg", OwnerId, OtherPetId));
        await Assert.ThrowsAsync<ApiException>(() => harness.InitializeAsync("x.jpg", OwnerId, PetId, theirMoment.Id));
        Assert.Empty(await harness.Db.MediaFiles.Where(media => media.OwnerUserId == OwnerId).ToListAsync());
    }

    [Fact]
    public async Task NobodyCanAttachAnotherOwnersUploadToTheirMoment()
    {
        using var harness = await Harness.CreateAsync();
        var mine = await harness.Memories.CreateAsync(OwnerId, PetId, Request("Mine"));
        var theirFile = await harness.UploadAsync("theirs.jpg", OtherOwnerId, OtherPetId);

        await Assert.ThrowsAsync<ApiException>(() =>
            harness.Memories.UpdateAsync(OwnerId, mine.Id, UpdateMedia([theirFile])));
        Assert.Empty(await harness.Db.MediaFileLinks.ToListAsync());
    }

    // ---- Editing -------------------------------------------------------------

    [Fact]
    public async Task AFailedUploadWhileEditing_LeavesTheMomentExactlyAsItWas()
    {
        using var harness = await Harness.CreateAsync();
        var kept = await harness.UploadAsync("kept.jpg");
        var moment = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [kept], "attempt-1"));

        // The edit adds two files; the first uploads, the second fails, so the
        // client never sends the update.
        await harness.UploadAsync("added.jpg");
        var failed = await harness.InitializeAsync("broken.jpg");
        await Assert.ThrowsAsync<ApiException>(() => harness.Media.CompleteUploadAsync(OwnerId, failed));

        var unchanged = await harness.Memories.GetAsync(OwnerId, moment.Id);
        Assert.Equal([kept], unchanged.Media.Select(media => media.Id).ToArray());
        Assert.Equal([kept], (await harness.ShareProfile()).Memories.Single().Media.Select(media => media.Id).ToArray());
    }

    [Fact]
    public async Task AnEditReplacesTheMediaList_InOneSave()
    {
        using var harness = await Harness.CreateAsync();
        var a = await harness.UploadAsync("a.jpg");
        var b = await harness.UploadAsync("b.jpg");
        var moment = await harness.Memories.CreateAsync(
            OwnerId, PetId, Request("Beach day", MemoryVisibility.Public, [a, b]));
        var c = await harness.UploadAsync("c.jpg");

        var updated = await harness.Memories.UpdateAsync(OwnerId, moment.Id, UpdateMedia([b, c]));

        Assert.Equal([b, c], updated.Media.Select(media => media.Id).ToArray());
        Assert.Equal(b, updated.CoverMediaId);
    }

    // ---- helpers ---------------------------------------------------------------

    internal static CreateMemoryRequest Request(
        string title,
        MemoryVisibility visibility = MemoryVisibility.Private,
        IReadOnlyCollection<Guid>? media = null,
        string? key = null) =>
        new(title, new DateOnly(2026, 9, 28), "Other", null, visibility, null, false, null, media, null, key);

    private static UpdateMemoryRequest UpdateMedia(IReadOnlyCollection<Guid> media) =>
        new(null, null, null, null, null, null, null, null, media);

    internal sealed class Harness : IDisposable
    {
        private Harness(MyPetLinkDbContext db, FakeStorage storage)
        {
            Db = db;
            Storage = storage;
            var r2 = new CloudflareR2Options
            {
                PublicBucketName = "public",
                PrivateBucketName = "private",
                PublicBaseUrl = "https://media.test",
                PresignedUploadExpiryMinutes = 5,
                PresignedDownloadExpiryMinutes = 5
            };
            Media = new MediaService(
                db,
                storage,
                Options.Create(r2),
                Options.Create(new SocialOptions()),
                new ImageDerivativeGenerator(),
                NullLogger<MediaService>.Instance);
            Memories = new MemoryService(db, Options.Create(r2));
            ShareProfiles = new PublicProfileService(db, Options.Create(r2));
        }

        public MyPetLinkDbContext Db { get; }
        public FakeStorage Storage { get; }
        public MediaService Media { get; }
        public MemoryService Memories { get; }
        public PublicProfileService ShareProfiles { get; }

        public Task<PublicPetProfileResponse> ShareProfile() => ShareProfiles.GetByPublicSlugAsync("milo-pubmilo");

        public static async Task<Harness> CreateAsync(int maxPrivateMomentsPerPet = 20)
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            var db = new MyPetLinkDbContext(options);
            Seed(db, maxPrivateMomentsPerPet);
            await db.SaveChangesAsync();
            return new Harness(db, new FakeStorage());
        }

        internal static void Seed(MyPetLinkDbContext db, int maxPrivateMomentsPerPet = 20)
        {
            foreach (var (userId, email, pets) in new[]
            {
                (OwnerId, "owner@example.com", new[] { (PetId, "Milo"), (SecondPetId, "Coco") }),
                (OtherOwnerId, "other@example.com", new[] { (OtherPetId, "Luna") })
            })
            {
                db.Users.Add(new User
                {
                    Id = userId,
                    Email = email,
                    NormalizedEmail = email.ToUpperInvariant(),
                    DisplayName = email,
                    Status = UserStatus.Active,
                    OwnerProfile = new OwnerProfile
                    {
                        UserId = userId,
                        OwnerDisplayName = email,
                        Plan = new Plan
                        {
                            Code = $"Free-{userId:N}",
                            Name = "Free",
                            PriceLabel = "RM0",
                            Limit = new PlanLimit
                            {
                                MaxPets = 10,
                                MaxPrivateMemoriesPerPet = maxPrivateMomentsPerPet,
                                MaxMediaPerMemory = 5,
                                MaxFamilyMembers = 1,
                                MaxCareRecords = 100,
                                ScanHistoryDays = 0
                            }
                        }
                    }
                });

                foreach (var (petId, name) in pets)
                {
                    var code = $"pub{name.ToLowerInvariant()}";
                    db.Pets.Add(new Pet
                    {
                        Id = petId,
                        OwnerUserId = userId,
                        Name = name,
                        Species = "Dog",
                        Slug = $"{name.ToLowerInvariant()}-{code}",
                        PublicProfile = new PetPublicProfile
                        {
                            PetId = petId,
                            PublicCode = code,
                            SlugSnapshot = $"{name.ToLowerInvariant()}-{code}",
                            IsPublicProfileEnabled = true,
                            ShowMoments = true,
                            ShowTimeline = true
                        }
                    });
                }
            }
        }

        public async Task<Guid> InitializeAsync(
            string fileName,
            Guid? userId = null,
            Guid? petId = null,
            Guid? momentId = null)
        {
            var response = await Media.InitializeUploadAsync(
                userId ?? OwnerId,
                new InitializeMediaUploadRequest(
                    momentId.HasValue ? null : petId ?? PetId,
                    momentId,
                    null,
                    null,
                    MediaUploadCategory.MomentImage,
                    fileName,
                    "image/jpeg",
                    1024,
                    800,
                    600,
                    null));
            return response.MediaId;
        }

        /// <summary>Initialize, put the object as the browser would, complete.</summary>
        public async Task<Guid> UploadAsync(
            string fileName,
            Guid? userId = null,
            Guid? petId = null,
            Guid? momentId = null)
        {
            var mediaId = await InitializeAsync(fileName, userId, petId, momentId);
            var media = await Db.MediaFiles.AsNoTracking().SingleAsync(item => item.Id == mediaId);
            Storage.Arrive(media.BucketName, media.ObjectKey, media.FileSize, media.ContentType);
            await Media.CompleteUploadAsync(userId ?? OwnerId, mediaId);
            return mediaId;
        }

        public async Task<Guid> UploadThenDeleteAsync(string fileName)
        {
            var mediaId = await UploadAsync(fileName);
            await Media.DeleteAsync(OwnerId, mediaId);
            return mediaId;
        }

        public void Dispose() => Db.Dispose();
    }

    internal sealed class FakeStorage : IObjectStorageService
    {
        private readonly Dictionary<(string, string), StoredObjectMetadata> _objects = new();

        public List<(string BucketName, string ObjectKey)> DeletedObjects { get; } = [];

        public void Arrive(string bucket, string key, long size, string contentType) =>
            _objects[(bucket, key)] = new StoredObjectMetadata(size, contentType, "etag");

        public PresignedUrlResult CreatePresignedUploadUrl(CreatePresignedUploadUrlRequest request) =>
            new($"https://upload.test/{request.ObjectKey}", DateTimeOffset.UtcNow.Add(request.ExpiresIn));

        public PresignedUrlResult CreatePresignedDownloadUrl(CreatePresignedDownloadUrlRequest request) =>
            new($"https://download.test/{request.ObjectKey}", DateTimeOffset.UtcNow.Add(request.ExpiresIn));

        public Task<StoredObjectMetadata?> GetObjectMetadataAsync(string bucketName, string objectKey, CancellationToken cancellationToken = default)
        {
            _objects.TryGetValue((bucketName, objectKey), out var metadata);
            return Task.FromResult(metadata);
        }

        public Task DeleteObjectAsync(string bucketName, string objectKey, CancellationToken cancellationToken = default)
        {
            DeletedObjects.Add((bucketName, objectKey));
            _objects.Remove((bucketName, objectKey));
            return Task.CompletedTask;
        }

        public Task<byte[]?> GetObjectBytesAsync(string bucketName, string objectKey, long maxBytes, CancellationToken cancellationToken = default) =>
            Task.FromResult<byte[]?>(null);

        public Task PutObjectAsync(string bucketName, string objectKey, byte[] content, string contentType, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public string GetPublicUrl(string objectKey) => $"https://media.test/{objectKey}";
    }
}
