using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Tests;

public sealed class MediaServiceTests
{
    private static readonly Guid UserId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OtherUserId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid PetId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private static readonly Guid OtherPetId = Guid.Parse("44444444-4444-4444-4444-444444444444");
    private static readonly Guid MomentId = Guid.Parse("55555555-5555-5555-5555-555555555555");

    [Fact]
    public async Task InitializeUploadAsync_ForValidImage_CreatesPendingPublicMedia()
    {
        using var harness = await MediaHarness.CreateAsync();

        var response = await harness.Service.InitializeUploadAsync(
            UserId,
            ProfileImageRequest());

        var media = await harness.Db.MediaFiles.SingleAsync(item => item.Id == response.MediaId);

        Assert.Equal(MediaUploadStatus.Pending, response.Status);
        Assert.True(response.IsPublic);
        Assert.Equal("PUT", response.Method);
        Assert.Equal("image/jpeg", response.RequiredHeaders["Content-Type"]);
        Assert.Equal("mypetlink-public-media", media.BucketName);
        Assert.Equal($"pets/{PetId}/profile/", media.ObjectKey[..$"pets/{PetId}/profile/".Length]);
        Assert.EndsWith(".jpg", media.ObjectKey);
        Assert.NotEqual("profile.jpg", media.StorageFileName);
    }

    [Fact]
    public async Task InitializeUploadAsync_ForUnsupportedMime_ThrowsUnsupportedMediaType()
    {
        using var harness = await MediaHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.InitializeUploadAsync(
                UserId,
                ProfileImageRequest(contentType: "text/html")));

        Assert.Equal(StatusCodes.Status415UnsupportedMediaType, exception.StatusCode);
        Assert.Equal("unsupported_media_type", exception.Code);
    }

    [Fact]
    public async Task InitializeUploadAsync_ForUnsupportedExtension_ThrowsUnsupportedMediaType()
    {
        using var harness = await MediaHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.InitializeUploadAsync(
                UserId,
                ProfileImageRequest(fileName: "profile.svg", contentType: "image/svg+xml")));

        Assert.Equal(StatusCodes.Status415UnsupportedMediaType, exception.StatusCode);
        Assert.Equal("unsupported_media_type", exception.Code);
    }

    [Fact]
    public async Task InitializeUploadAsync_ForOversizedImage_ThrowsPayloadTooLarge()
    {
        using var harness = await MediaHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.InitializeUploadAsync(
                UserId,
                ProfileImageRequest(fileSizeBytes: 10 * 1024 * 1024 + 1)));

        Assert.Equal(StatusCodes.Status413PayloadTooLarge, exception.StatusCode);
        Assert.Equal("file_too_large", exception.Code);
    }

    [Fact]
    public async Task InitializeUploadAsync_WithoutPet_ThrowsValidationError()
    {
        using var harness = await MediaHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.InitializeUploadAsync(
                UserId,
                new InitializeMediaUploadRequest(
                    null,
                    null,
                    null,
                    null,
                    MediaUploadCategory.PetProfilePhoto,
                    "profile.jpg",
                    "image/jpeg",
                    1024,
                    800,
                    600,
                    null)));

        Assert.Equal(StatusCodes.Status400BadRequest, exception.StatusCode);
        Assert.Equal("validation_failed", exception.Code);
    }

    [Fact]
    public async Task InitializeUploadAsync_ForPetOwnedByAnotherUser_ReturnsNotFound()
    {
        using var harness = await MediaHarness.CreateAsync();

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.InitializeUploadAsync(
                UserId,
                ProfileImageRequest(petId: OtherPetId)));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
    }

    [Fact]
    public async Task CompleteUploadAsync_WhenObjectMissing_ThrowsUnprocessable()
    {
        using var harness = await MediaHarness.CreateAsync();
        var initialized = await harness.Service.InitializeUploadAsync(UserId, ProfileImageRequest());

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteUploadAsync(UserId, initialized.MediaId));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, exception.StatusCode);
        Assert.Equal("uploaded_object_missing", exception.Code);
    }

    [Fact]
    public async Task CompleteUploadAsync_ForValidUpload_MarksReadyAndActivatesProfileImage()
    {
        using var harness = await MediaHarness.CreateAsync();
        var initialized = await harness.Service.InitializeUploadAsync(UserId, ProfileImageRequest());
        var media = await harness.Db.MediaFiles.SingleAsync(item => item.Id == initialized.MediaId);

        harness.Storage.AddObject(media.BucketName, media.ObjectKey, media.FileSize, media.ContentType);

        var completed = await harness.Service.CompleteUploadAsync(UserId, initialized.MediaId);
        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);

        Assert.Equal(MediaUploadStatus.Ready, completed.Status);
        Assert.Equal(initialized.MediaId, pet.ProfileMediaFileId);
        Assert.Equal(
            $"https://media.mypetlink.com.my/{media.ObjectKey}",
            completed.PublicUrl);
    }

    [Fact]
    public async Task CompleteUploadAsync_ForNonPendingUpload_ThrowsInvalidState()
    {
        using var harness = await MediaHarness.CreateAsync();
        var initialized = await harness.Service.InitializeUploadAsync(UserId, ProfileImageRequest());
        var media = await harness.Db.MediaFiles.SingleAsync(item => item.Id == initialized.MediaId);
        harness.Storage.AddObject(media.BucketName, media.ObjectKey, media.FileSize, media.ContentType);
        await harness.Service.CompleteUploadAsync(UserId, initialized.MediaId);

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CompleteUploadAsync(UserId, initialized.MediaId));

        Assert.Equal(StatusCodes.Status422UnprocessableEntity, exception.StatusCode);
        Assert.Equal("invalid_upload_state", exception.Code);
    }

    [Fact]
    public async Task CompleteUploadAsync_WhenReplacingProfileImage_MarksOldMediaDeletedAfterNewReady()
    {
        using var harness = await MediaHarness.CreateAsync();
        var first = await InitializeAndCompleteProfileImageAsync(harness, "first.jpg", 100);
        var second = await InitializeAndCompleteProfileImageAsync(harness, "second.jpg", 200);

        var pet = await harness.Db.Pets.SingleAsync(item => item.Id == PetId);
        var oldMedia = await harness.Db.MediaFiles.SingleAsync(item => item.Id == first.MediaId);

        Assert.Equal(second.MediaId, pet.ProfileMediaFileId);
        Assert.Equal(MediaUploadStatus.Deleted, oldMedia.UploadStatus);
        Assert.Contains(harness.Storage.DeletedObjects, item => item.ObjectKey == first.ObjectKey);
    }

    [Fact]
    public async Task DeleteAsync_ForAnotherOwner_ReturnsNotFound()
    {
        using var harness = await MediaHarness.CreateAsync();
        var completed = await InitializeAndCompleteProfileImageAsync(harness, "profile.jpg", 100);

        var exception = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.DeleteAsync(OtherUserId, completed.MediaId));

        Assert.Equal(StatusCodes.Status404NotFound, exception.StatusCode);
        Assert.Equal("not_found", exception.Code);
    }

    [Fact]
    public async Task CreatePrivateDownloadUrlAsync_RequiresOwnerAndReturnsSignedUrl()
    {
        using var harness = await MediaHarness.CreateAsync();
        var privateMedia = new MediaFile
        {
            OwnerUserId = UserId,
            PetId = PetId,
            OriginalFileName = "receipt.pdf",
            StorageFileName = "receipt.pdf",
            ContentType = "application/pdf",
            FileSize = 100,
            StorageProvider = "CloudflareR2",
            StoragePath = "order-receipts/receipt.pdf",
            BucketName = "mypetlink-private-files",
            ObjectKey = "order-receipts/receipt.pdf",
            MediaType = MediaFileType.Document,
            Category = MediaUploadCategory.OrderReceipt,
            UploadStatus = MediaUploadStatus.Ready
        };
        harness.Db.MediaFiles.Add(privateMedia);
        await harness.Db.SaveChangesAsync();

        var unauthorized = await Assert.ThrowsAsync<ApiException>(() =>
            harness.Service.CreatePrivateDownloadUrlAsync(OtherUserId, privateMedia.Id));
        var response = await harness.Service.CreatePrivateDownloadUrlAsync(UserId, privateMedia.Id);

        Assert.Equal(StatusCodes.Status404NotFound, unauthorized.StatusCode);
        Assert.StartsWith("https://signed-download.test/", response.DownloadUrl);
        Assert.Equal("application/pdf", response.ContentType);
    }

    [Theory]
    [InlineData("PetProfilePhoto", "mypetlink-public-media", true)]
    [InlineData("PetCoverPhoto", "mypetlink-public-media", true)]
    [InlineData("MomentImage", "mypetlink-public-media", true)]
    [InlineData("VaccinationDocument", "mypetlink-private-files", false)]
    [InlineData("MedicalDocument", "mypetlink-private-files", false)]
    public async Task InitializeUploadAsync_MapsCategoryToCorrectBucket(
        string category,
        string expectedBucket,
        bool expectedPublic)
    {
        using var harness = await MediaHarness.CreateAsync();
        var uploadCategory = Enum.Parse<MediaUploadCategory>(category);
        var isDocument = uploadCategory is MediaUploadCategory.VaccinationDocument
            or MediaUploadCategory.MedicalDocument;

        var request = new InitializeMediaUploadRequest(
            uploadCategory == MediaUploadCategory.MomentImage ? null : PetId,
            uploadCategory == MediaUploadCategory.MomentImage ? MomentId : null,
            null,
            null,
            uploadCategory,
            isDocument ? "record.pdf" : "photo.jpg",
            isDocument ? "application/pdf" : "image/jpeg",
            1024,
            800,
            600,
            null);

        var response = await harness.Service.InitializeUploadAsync(UserId, request);
        var media = await harness.Db.MediaFiles.SingleAsync(item => item.Id == response.MediaId);

        Assert.Equal(expectedBucket, media.BucketName);
        Assert.Equal(expectedPublic, media.IsPublic);
        // The bucket name is never part of the object key.
        Assert.DoesNotContain("mypetlink-public-media", media.ObjectKey);
        Assert.DoesNotContain("mypetlink-private-files", media.ObjectKey);
    }

    [Fact]
    public void BuildPublicUrl_EncodesObjectKeySegments()
    {
        var url = MediaUrlBuilder.BuildPublicUrl(
            "https://media.mypetlink.com.my/",
            "pets/demo pet/profile/cute photo.jpg");

        Assert.Equal(
            "https://media.mypetlink.com.my/pets/demo%20pet/profile/cute%20photo.jpg",
            url);
    }

    [Fact]
    public void BuildPublicUrl_DoesNotIncludeBucketNameInPath()
    {
        var url = MediaUrlBuilder.BuildPublicUrl(
            "https://media.mypetlink.com.my",
            "pets/abc/profile/photo.jpg");

        Assert.Equal("https://media.mypetlink.com.my/pets/abc/profile/photo.jpg", url);
        Assert.DoesNotContain("mypetlink-public-media", url);
        Assert.DoesNotContain("mypetlink-private-files", url);
    }

    [Fact]
    public void BuildPublicUrl_NormalizesLeadingSlashInObjectKey()
    {
        var url = MediaUrlBuilder.BuildPublicUrl(
            "https://media.mypetlink.com.my",
            "/pets/abc/profile/photo.jpg");

        Assert.Equal("https://media.mypetlink.com.my/pets/abc/profile/photo.jpg", url);
    }

    [Fact]
    public void BuildPublicUrl_WithTrailingSlashBase_DoesNotDoubleSlash()
    {
        var url = MediaUrlBuilder.BuildPublicUrl(
            "https://media.mypetlink.com.my/",
            "pets/abc/profile/photo.jpg");

        Assert.Equal("https://media.mypetlink.com.my/pets/abc/profile/photo.jpg", url);
        Assert.DoesNotContain(".my//", url);
    }

    [Fact]
    public void BuildPublicUrl_WithAbsoluteObjectKey_ReturnsItUnchanged()
    {
        var absolute = "https://media.mypetlink.com.my/pets/abc/profile/photo.jpg";

        var url = MediaUrlBuilder.BuildPublicUrl("https://media.mypetlink.com.my", absolute);

        Assert.Equal(absolute, url);
    }

    [Theory]
    [InlineData("")]
    [InlineData("mypetlink-private-files")]
    [InlineData("media.mypetlink.com.my")]
    public void BuildPublicUrl_WhenBaseIsNotAbsoluteUrl_ReturnsEmpty(string base_)
    {
        // A missing or misconfigured base (e.g. a bucket name) must never produce
        // a relative URL that the browser would resolve against the wrong host.
        var url = MediaUrlBuilder.BuildPublicUrl(base_, "pets/abc/profile/photo.jpg");

        Assert.Equal("", url);
    }

    [Fact]
    public void CloudflareR2OptionsValidator_RequiresSecretsWhenProviderIsR2()
    {
        var validator = R2Validator();

        var result = validator.Validate(
            Options.DefaultName,
            new CloudflareR2Options { AccountId = "account" });

        Assert.True(result.Failed);
    }

    [Fact]
    public void CloudflareR2OptionsValidator_RejectsNonAbsolutePublicBaseUrl()
    {
        var validator = R2Validator();

        var result = validator.Validate(
            Options.DefaultName,
            ValidR2Options(publicBaseUrl: "mypetlink-private-files"));

        Assert.True(result.Failed);
        Assert.Contains(result.Failures, message => message.Contains("PublicBaseUrl"));
    }

    [Fact]
    public void CloudflareR2OptionsValidator_RejectsSamePublicAndPrivateBucket()
    {
        var validator = R2Validator();

        var result = validator.Validate(
            Options.DefaultName,
            ValidR2Options(privateBucketName: "mypetlink-public-media"));

        Assert.True(result.Failed);
    }

    [Fact]
    public void CloudflareR2OptionsValidator_AcceptsValidConfiguration()
    {
        var validator = R2Validator();

        var result = validator.Validate(Options.DefaultName, ValidR2Options());

        Assert.True(result.Succeeded);
    }

    private static CloudflareR2OptionsValidator R2Validator()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Storage:Provider"] = "CloudflareR2"
            })
            .Build();

        return new CloudflareR2OptionsValidator(configuration);
    }

    private static CloudflareR2Options ValidR2Options(
        string publicBaseUrl = "https://media.mypetlink.com.my",
        string privateBucketName = "mypetlink-private-files")
    {
        return new CloudflareR2Options
        {
            AccountId = "account-id",
            AccessKeyId = "access-key",
            SecretAccessKey = "secret-key",
            PublicBucketName = "mypetlink-public-media",
            PrivateBucketName = privateBucketName,
            PublicBaseUrl = publicBaseUrl,
            PresignedUploadExpiryMinutes = 5,
            PresignedDownloadExpiryMinutes = 5
        };
    }

    private static async Task<CompletedMedia> InitializeAndCompleteProfileImageAsync(
        MediaHarness harness,
        string fileName,
        long size)
    {
        var initialized = await harness.Service.InitializeUploadAsync(
            UserId,
            ProfileImageRequest(fileName: fileName, fileSizeBytes: size));
        var media = await harness.Db.MediaFiles.SingleAsync(item => item.Id == initialized.MediaId);
        harness.Storage.AddObject(media.BucketName, media.ObjectKey, media.FileSize, media.ContentType);
        await harness.Service.CompleteUploadAsync(UserId, initialized.MediaId);

        return new CompletedMedia(initialized.MediaId, media.BucketName, media.ObjectKey);
    }

    private static InitializeMediaUploadRequest ProfileImageRequest(
        Guid? petId = null,
        string fileName = "profile.jpg",
        string contentType = "image/jpeg",
        long fileSizeBytes = 1024)
    {
        return new InitializeMediaUploadRequest(
            petId ?? PetId,
            null,
            null,
            null,
            MediaUploadCategory.PetProfilePhoto,
            fileName,
            contentType,
            fileSizeBytes,
            800,
            600,
            null);
    }

    private sealed record CompletedMedia(Guid MediaId, string BucketName, string ObjectKey);

    private sealed class MediaHarness : IDisposable
    {
        private MediaHarness(MyPetLinkDbContext db, FakeObjectStorage storage)
        {
            Db = db;
            Storage = storage;
            Service = new MediaService(
                db,
                storage,
                Options.Create(new CloudflareR2Options
                {
                    AccountId = "account-id",
                    AccessKeyId = "access-key",
                    SecretAccessKey = "secret-key",
                    PublicBucketName = "mypetlink-public-media",
                    PrivateBucketName = "mypetlink-private-files",
                    PublicBaseUrl = "https://media.mypetlink.com.my",
                    PresignedUploadExpiryMinutes = 5,
                    PresignedDownloadExpiryMinutes = 5
                }),
                NullLogger<MediaService>.Instance);
        }

        public MyPetLinkDbContext Db { get; }

        public FakeObjectStorage Storage { get; }

        public MediaService Service { get; }

        public static async Task<MediaHarness> CreateAsync()
        {
            var options = new DbContextOptionsBuilder<MyPetLinkDbContext>()
                .UseInMemoryDatabase(Guid.NewGuid().ToString("N"))
                .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
                .Options;
            var db = new MyPetLinkDbContext(options);
            var storage = new FakeObjectStorage();
            var harness = new MediaHarness(db, storage);

            db.Users.AddRange(
                new User
                {
                    Id = UserId,
                    Email = "owner@example.com",
                    NormalizedEmail = "OWNER@EXAMPLE.COM",
                    DisplayName = "Owner",
                    Status = UserStatus.Active
                },
                new User
                {
                    Id = OtherUserId,
                    Email = "other@example.com",
                    NormalizedEmail = "OTHER@EXAMPLE.COM",
                    DisplayName = "Other",
                    Status = UserStatus.Active
                });
            db.Pets.AddRange(
                new Pet
                {
                    Id = PetId,
                    OwnerUserId = UserId,
                    Name = "Milo",
                    Species = "Dog",
                    Slug = "milo"
                },
                new Pet
                {
                    Id = OtherPetId,
                    OwnerUserId = OtherUserId,
                    Name = "Luna",
                    Species = "Cat",
                    Slug = "luna"
                });
            db.PetMemories.Add(new PetMemory
            {
                Id = MomentId,
                PetId = PetId,
                Title = "Beach day"
            });
            await db.SaveChangesAsync();

            return harness;
        }

        public void Dispose()
        {
            Db.Dispose();
        }
    }

    private sealed class FakeObjectStorage : IObjectStorageService
    {
        private readonly Dictionary<(string BucketName, string ObjectKey), StoredObjectMetadata> _objects = new();

        public List<(string BucketName, string ObjectKey)> DeletedObjects { get; } = [];

        public PresignedUrlResult CreatePresignedUploadUrl(CreatePresignedUploadUrlRequest request)
        {
            return new PresignedUrlResult(
                $"https://signed-upload.test/{Uri.EscapeDataString(request.BucketName)}/{Uri.EscapeDataString(request.ObjectKey)}",
                DateTimeOffset.UtcNow.Add(request.ExpiresIn));
        }

        public PresignedUrlResult CreatePresignedDownloadUrl(CreatePresignedDownloadUrlRequest request)
        {
            return new PresignedUrlResult(
                $"https://signed-download.test/{Uri.EscapeDataString(request.BucketName)}/{Uri.EscapeDataString(request.ObjectKey)}",
                DateTimeOffset.UtcNow.Add(request.ExpiresIn));
        }

        public Task<StoredObjectMetadata?> GetObjectMetadataAsync(
            string bucketName,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            _objects.TryGetValue((bucketName, objectKey), out var metadata);
            return Task.FromResult(metadata);
        }

        public Task DeleteObjectAsync(
            string bucketName,
            string objectKey,
            CancellationToken cancellationToken = default)
        {
            DeletedObjects.Add((bucketName, objectKey));
            _objects.Remove((bucketName, objectKey));
            return Task.CompletedTask;
        }

        public string GetPublicUrl(string objectKey)
        {
            return MediaUrlBuilder.BuildPublicUrl("https://media.mypetlink.com.my", objectKey);
        }

        public void AddObject(string bucketName, string objectKey, long contentLength, string contentType)
        {
            _objects[(bucketName, objectKey)] = new StoredObjectMetadata(contentLength, contentType, "etag");
        }
    }
}
