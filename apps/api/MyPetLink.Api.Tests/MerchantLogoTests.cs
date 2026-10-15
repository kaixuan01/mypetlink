using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Auth;
using MyPetLink.Api.Common;
using MyPetLink.Api.Controllers.Admin;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Services;
using MyPetLink.Api.Storage;
using MyPetLink.Api.Tests.Relational;
using SkiaSharp;

namespace MyPetLink.Api.Tests;

public sealed class MerchantLogoTests
{
    [Theory]
    [InlineData("image/png", "logo.png", SKEncodedImageFormat.Png)]
    [InlineData("image/jpeg", "logo.jpg", SKEncodedImageFormat.Jpeg)]
    [InlineData("image/webp", "logo.webp", SKEncodedImageFormat.Webp)]
    public async Task UploadIsPrivateUntilValidatedAndProducesIndependentPublicRaster(string type, string name, SKEncodedImageFormat format)
    {
        using var h = new Harness();
        var bytes = Image(format);
        var upload = await h.Media.InitializeUploadAsync(h.Actor, h.Request(name, type, bytes.Length));
        var row = await h.Db.MediaFiles.SingleAsync();
        var sourceKey = row.ObjectKey;
        Assert.False(upload.IsPublic); Assert.Equal(h.Options.PrivateBucketName, row.BucketName);
        Assert.Null((await h.Directory.GetListingAsync(h.Merchant.Id, default)).LogoUrl);
        h.Storage.Objects[(row.BucketName, row.ObjectKey)] = (bytes, type);
        var completed = await h.Media.CompleteUploadAsync(h.Actor, upload.MediaId);
        Assert.True(completed.IsPublic); Assert.Equal(MediaUploadStatus.Ready, completed.Status);
        Assert.StartsWith("https://media.mypetlink.com.my/merchant-logos/", completed.PublicUrl);
        Assert.DoesNotContain(h.Actor.ToString(), completed.PublicUrl);
        Assert.NotEqual(sourceKey, row.ObjectKey);
        Assert.False(h.Storage.Objects.ContainsKey((h.Options.PrivateBucketName, sourceKey)));
        // Reusing the still-valid signed PUT can affect only the old private key.
        var publicBytes = h.Storage.Objects[(row.BucketName, row.ObjectKey)].Bytes;
        h.Storage.Objects[(h.Options.PrivateBucketName, sourceKey)] = ("bad"u8.ToArray(), type);
        Assert.Equal(publicBytes, h.Storage.Objects[(row.BucketName, row.ObjectKey)].Bytes);
        using var codec = SKCodec.Create(new SKMemoryStream(publicBytes));
        Assert.Equal(SKEncodedImageFormat.Png, codec.EncodedFormat);
        Assert.InRange(codec.Info.Width, 1, 512);
    }

    [Theory]
    [InlineData("logo.svg", "image/svg+xml", 100, 415)]
    [InlineData("logo.html", "image/png", 100, 415)]
    [InlineData("logo.png", "image/png", 2097153, 413)]
    [InlineData("logo.png", "image/png", 0, 400)]
    public async Task InvalidFileShapeIsRejectedBeforeSigning(string name, string type, long size, int status)
    {
        using var h = new Harness();
        Assert.Equal(status, (await Assert.ThrowsAsync<ApiException>(() =>
            h.Media.InitializeUploadAsync(h.Actor, h.Request(name, type, size)))).StatusCode);
        Assert.Empty(h.Db.MediaFiles);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SpoofedOrTruncatedContentNeverBecomesPublic(bool spoof)
    {
        using var h = new Harness();
        var bytes = spoof ? Image(SKEncodedImageFormat.Png) : "<svg onload='alert(1)'/>"u8.ToArray();
        var upload = await h.Media.InitializeUploadAsync(h.Actor, h.Request("logo.jpg", "image/jpeg", bytes.Length));
        var row = await h.Db.MediaFiles.SingleAsync();
        h.Storage.Objects[(row.BucketName, row.ObjectKey)] = (bytes, "image/jpeg");
        Assert.Equal(415, (await Assert.ThrowsAsync<ApiException>(() => h.Media.CompleteUploadAsync(h.Actor, upload.MediaId))).StatusCode);
        Assert.False(row.IsPublic); Assert.Empty(h.Storage.Objects.Keys.Where(k => k.Bucket == h.Options.PublicBucketName));
    }

    [Fact]
    public void ExcessiveDimensionsAreRejectedAndTransparencyIsPreserved()
    {
        using var large = new SKBitmap(4097, 1);
        using var largeImage = SKImage.FromBitmap(large);
        using var data = largeImage.Encode(SKEncodedImageFormat.Png, 100);
        Assert.Throws<ApiException>(() => MerchantLogoImage.Normalize(data.ToArray(), "image/png"));
        var result = MerchantLogoImage.Normalize(Image(SKEncodedImageFormat.Png), "image/png");
        using var decoded = SKBitmap.Decode(result.Bytes);
        Assert.Equal((byte)0, decoded.GetPixel(0, 0).Alpha);
    }

    [Fact]
    public async Task OneLogoIsSharedAcrossBranchesAndHiddenMerchantsStayExcluded()
    {
        using var h = new Harness();
        Assert.Null((await h.Directory.GetListingAsync(h.Merchant.Id, default)).LogoUrl);
        var media = await h.Upload();
        await h.SetLogo(media.Id);
        Assert.Empty((await h.Directory.ListPublicAsync(1, 20, null, null, default)).Items);
        h.Merchant.ShowOnWebsite = true;
        h.AddBranches(); await h.Db.SaveChangesAsync();
        var store = Assert.Single((await h.Directory.ListPublicAsync(1, 20, null, null, default)).Items);
        Assert.Equal(2, store.Branches.Count); Assert.NotNull(store.LogoUrl);
        var json = JsonSerializer.Serialize(store, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.DoesNotContain("objectKey", json); Assert.DoesNotContain("logoMediaFileId", json);
        Assert.Null(typeof(PublicPartnerBranchResponse).GetProperty("LogoUrl"));
        h.Merchant.IsActive = false; await h.Db.SaveChangesAsync();
        Assert.Empty((await h.Directory.ListPublicAsync(1, 20, null, null, default)).Items);
    }

    [Fact]
    public async Task ReplaceAndRemoveRetireOldMediaWithoutChangingPublicationOrBranches()
    {
        using var h = new Harness(); h.AddBranches(); await h.Db.SaveChangesAsync();
        var first = await h.Upload(); await h.SetLogo(first.Id);
        var second = await h.Upload(); await h.SetLogo(second.Id);
        Assert.Equal(MediaUploadStatus.Deleted, first.UploadStatus);
        Assert.False(h.Storage.Objects.ContainsKey((first.BucketName, first.ObjectKey)));
        Assert.Equal(second.Id, h.Merchant.LogoMediaFileId);
        Assert.False(h.Merchant.ShowOnWebsite); Assert.True(h.Merchant.IsActive); Assert.Equal(2, h.Merchant.Branches.Count);
        await h.SetLogo(null);
        Assert.Null(h.Merchant.LogoMediaFileId); Assert.Null((await h.Directory.GetListingAsync(h.Merchant.Id, default)).LogoUrl);
        Assert.Equal(MediaUploadStatus.Deleted, second.UploadStatus);
        Assert.False(h.Storage.Objects.ContainsKey((second.BucketName, second.ObjectKey)));
        Assert.Equal(3, await h.Db.AuditLogs.CountAsync(a => a.Action == "merchant.logo.update"));
    }

    [Fact]
    public async Task AttachedLogoCannotBeDeletedThroughGenericMediaEndpoint()
    {
        using var h = new Harness(); var media = await h.Upload(); await h.SetLogo(media.Id);
        Assert.Equal("media_in_use", (await Assert.ThrowsAsync<ApiException>(() => h.Media.DeleteAsync(h.Actor, media.Id))).Code);
        Assert.Equal(media.Id, h.Merchant.LogoMediaFileId);
    }

    [Fact]
    public async Task AnotherAuthorizedAdministratorCanRemoveAnEarlierAdministratorsLogo()
    {
        using var h = new Harness(); var media = await h.Upload(); await h.SetLogo(media.Id);
        await h.Directory.UpdateLogoAsync(Guid.NewGuid(), h.Merchant.Id,
            new(null, Convert.ToBase64String(h.Merchant.RowVersion)), default);
        Assert.Null(h.Merchant.LogoMediaFileId);
        Assert.Equal(MediaUploadStatus.Deleted, media.UploadStatus);
        Assert.False(h.Storage.Objects.ContainsKey((media.BucketName, media.ObjectKey)));
    }

    [Fact]
    public async Task RemovingAnInvalidReferenceCannotDeleteAnotherMerchantsMedia()
    {
        using var h = new Harness(); var media = await h.Upload();
        media.Links.Single().OwnerId = Guid.NewGuid();
        h.Merchant.LogoMediaFileId = media.Id; h.Merchant.LogoMediaFile = media; await h.Db.SaveChangesAsync();
        await h.SetLogo(null);
        Assert.Null(h.Merchant.LogoMediaFileId);
        Assert.Equal(MediaUploadStatus.Ready, media.UploadStatus);
        Assert.True(h.Storage.Objects.ContainsKey((media.BucketName, media.ObjectKey)));
    }

    [Fact]
    public async Task PrivateUnrelatedPendingOrWrongMerchantMediaCannotBeAttachedOrProjected()
    {
        using var h = new Harness(); var media = await h.Upload();
        foreach (var corrupt in new Action[] {
            () => media.Category = MediaUploadCategory.OrderReceipt,
            () => { media.Category = MediaUploadCategory.MerchantLogo; media.IsPublic = false; },
            () => { media.IsPublic = true; media.UploadStatus = MediaUploadStatus.Pending; },
            () => { media.UploadStatus = MediaUploadStatus.Ready; media.Links.Single().OwnerId = Guid.NewGuid(); }
        })
        {
            corrupt(); await h.Db.SaveChangesAsync();
            Assert.Equal(400, (await Assert.ThrowsAsync<ApiException>(() => h.SetLogo(media.Id))).StatusCode);
            // Even a bad database reference cannot expose unrelated media.
            h.Merchant.LogoMediaFileId = media.Id; h.Merchant.LogoMediaFile = media;
            h.Merchant.ShowOnWebsite = true; if (h.Merchant.Branches.Count == 0) h.AddBranches(); await h.Db.SaveChangesAsync();
            Assert.Null(Assert.Single((await h.Directory.ListPublicAsync(1, 20, null, null, default)).Items).LogoUrl);
            h.Merchant.LogoMediaFileId = null; h.Merchant.LogoMediaFile = null;
        }
    }

    [Fact]
    public async Task RevokedPermissionBlocksInitializeCompleteAttachAndDelete()
    {
        using var h = new Harness(); var media = await h.Upload(); h.Access.Allowed = false;
        foreach (var action in new Func<Task>[] {
            async () => { await h.Media.InitializeUploadAsync(h.Actor, h.Request("logo.png", "image/png", 100)); },
            async () => { await h.Media.CompleteUploadAsync(h.Actor, media.Id); },
            async () => { await h.SetLogo(media.Id); },
            () => h.Media.DeleteAsync(h.Actor, media.Id)
        }) Assert.Equal(403, (await Assert.ThrowsAsync<ApiException>(action)).StatusCode);
        Assert.Contains(typeof(AdminMerchantListingController).GetMethod("UpdateLogo")!
            .GetCustomAttributes(typeof(Microsoft.AspNetCore.Authorization.AuthorizeAttribute), false),
            a => ((Microsoft.AspNetCore.Authorization.AuthorizeAttribute)a).Policy == AdminCapabilities.SalesManage);
    }

    [Fact]
    public async Task StaleMerchantTokenCannotReplaceLogoAndCleanupFailureDoesNotUndoSave()
    {
        using var h = new Harness(); var first = await h.Upload(); await h.SetLogo(first.Id);
        var second = await h.Upload(); h.Merchant.RowVersion = [2]; await h.Db.SaveChangesAsync();
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => h.Directory.UpdateLogoAsync(h.Actor,
            h.Merchant.Id, new(second.Id, "AQ=="), default))).StatusCode);
        Assert.Equal(first.Id, h.Merchant.LogoMediaFileId);
        h.Storage.FailDelete = true; await h.SetLogo(second.Id);
        Assert.Equal(second.Id, h.Merchant.LogoMediaFileId); Assert.Equal(MediaUploadStatus.Deleted, first.UploadStatus);
    }

    [RelationalFact]
    public async Task SqlProjectionAndRowversionPreserveExistingDirectoryPrivacy()
    {
        await using var scope = await RelationalDatabase.CreateAsync();
        using var h = new Harness(scope.NewContext());
        var original = Convert.ToBase64String(h.Merchant.RowVersion);
        var media = await h.Upload(); await h.SetLogo(media.Id);
        Assert.NotEqual(original, Convert.ToBase64String(h.Merchant.RowVersion));
        Assert.Equal(409, (await Assert.ThrowsAsync<ApiException>(() => h.Directory.UpdateLogoAsync(h.Actor,
            h.Merchant.Id, new(null, original), default))).StatusCode);
        h.Merchant.ShowOnWebsite = true; h.AddBranches(); await h.Db.SaveChangesAsync();
        Assert.NotNull(Assert.Single((await h.Directory.ListPublicAsync(1, 20, null, null, default)).Items).LogoUrl);
    }

    private static byte[] Image(SKEncodedImageFormat format)
    {
        using var bitmap = new SKBitmap(40, 20); bitmap.Erase(SKColors.Transparent); bitmap.SetPixel(20, 10, SKColors.Teal);
        using var image = SKImage.FromBitmap(bitmap); using var data = image.Encode(format, 90); return data.ToArray();
    }

    private sealed class Harness : IDisposable
    {
        public MyPetLinkDbContext Db { get; }
        public Guid Actor { get; } = Guid.NewGuid();
        public Merchant Merchant { get; } = MerchantDirectoryTests.Merchant();
        public CloudflareR2Options Options { get; } = new();
        public Storage Storage { get; } = new();
        public Access Access { get; } = new();
        public MediaService Media { get; }
        public MerchantDirectoryService Directory { get; }
        public Harness(MyPetLinkDbContext? db = null)
        {
            Db = db ?? new(new DbContextOptionsBuilder<MyPetLinkDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
            Db.Users.Add(new User { Id = Actor, Email = $"logo-{Actor:N}@example.test", Status = UserStatus.Active });
            Db.Merchants.Add(Merchant); Db.SaveChanges();
            Media = new(Db, Storage, Microsoft.Extensions.Options.Options.Create(Options), Microsoft.Extensions.Options.Options.Create(new SocialOptions()),
                new ImageDerivativeGenerator(), NullLogger<MediaService>.Instance, Access);
            Directory = new(Db, new AuditLogService(Db, new HttpContextAccessor()), TimeProvider.System,
                Microsoft.Extensions.Options.Options.Create(Options), Media, Access, NullLogger<MerchantDirectoryService>.Instance);
        }
        public InitializeMediaUploadRequest Request(string name, string type, long length) =>
            new(null, null, null, null, MediaUploadCategory.MerchantLogo, name, type, length, null, null, null, Merchant.Id);
        public async Task<MediaFile> Upload()
        {
            var bytes = Image(SKEncodedImageFormat.Png);
            var upload = await Media.InitializeUploadAsync(Actor, Request("logo.png", "image/png", bytes.Length));
            var row = await Db.MediaFiles.SingleAsync(m => m.Id == upload.MediaId);
            Storage.Objects[(row.BucketName, row.ObjectKey)] = (bytes, "image/png");
            await Media.CompleteUploadAsync(Actor, row.Id); return row;
        }
        public Task<AdminMerchantListingResponse> SetLogo(Guid? mediaId) => Directory.UpdateLogoAsync(Actor,
            Merchant.Id, new(mediaId, Convert.ToBase64String(Merchant.RowVersion)), default);
        public void AddBranches()
        {
            foreach (var name in new[] { "Main", "North" })
            {
                var branch = new MerchantBranch {
                MerchantId = Merchant.Id, Name = name, AddressLine1 = "1 Street", City = "KL", State = "KL", Postcode = "50000",
                Country = "Malaysia", IsActive = true, ShowOnWebsite = true, RowVersion = [1] };
                Merchant.Branches.Add(branch); Db.MerchantBranches.Add(branch);
            }
        }
        public void Dispose() => Db.Dispose();
    }
    private sealed class Access : IAdminAccessResolver
    {
        public bool Allowed = true;
        public Task<AdminAccessSnapshot> ResolveAsync(Guid? id, CancellationToken cancellationToken = default) =>
            Task.FromResult(new AdminAccessSnapshot(Guid.NewGuid(), id, Allowed, false, [], new HashSet<string> { AdminCapabilities.SalesManage }));
        public Task<AdminAccessSnapshot> ResolveCurrentAsync(CancellationToken cancellationToken = default) => ResolveAsync(null, cancellationToken);
    }
    private sealed class Storage : IObjectStorageService
    {
        public Dictionary<(string Bucket, string Key), (byte[] Bytes, string Type)> Objects = [];
        public bool FailDelete;
        public PresignedUrlResult CreatePresignedUploadUrl(CreatePresignedUploadUrlRequest request) => new("https://upload.example.test", DateTimeOffset.UtcNow.AddMinutes(5));
        public PresignedUrlResult CreatePresignedDownloadUrl(CreatePresignedDownloadUrlRequest request) => throw new NotSupportedException();
        public Task<StoredObjectMetadata?> GetObjectMetadataAsync(string bucketName, string objectKey, CancellationToken cancellationToken = default) =>
            Task.FromResult(Objects.TryGetValue((bucketName, objectKey), out var value) ? new StoredObjectMetadata(value.Bytes.Length, value.Type, "etag") : null);
        public Task<byte[]?> GetObjectBytesAsync(string bucketName, string objectKey, long maxBytes, CancellationToken cancellationToken = default) =>
            Task.FromResult(Objects.TryGetValue((bucketName, objectKey), out var value) && value.Bytes.Length <= maxBytes ? value.Bytes : null);
        public Task PutObjectAsync(string bucketName, string objectKey, byte[] content, string contentType, CancellationToken cancellationToken = default)
        { Objects[(bucketName, objectKey)] = (content, contentType); return Task.CompletedTask; }
        public Task DeleteObjectAsync(string bucketName, string objectKey, CancellationToken cancellationToken = default)
        { if (FailDelete) throw new IOException("Test deletion failure"); Objects.Remove((bucketName, objectKey)); return Task.CompletedTask; }
        public string GetPublicUrl(string objectKey) => $"https://media.mypetlink.com.my/{objectKey}";
    }
}
