using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyPetLink.Api.Common;
using MyPetLink.Api.Data;
using MyPetLink.Api.DTOs;
using MyPetLink.Api.Entities;
using MyPetLink.Api.Storage;

namespace MyPetLink.Api.Services;

public sealed class MediaService : SkeletonService, IMediaService
{
    private const long ImageMaxBytes = 10 * 1024 * 1024;
    private const long VideoMaxBytes = 50 * 1024 * 1024;
    private const long DocumentMaxBytes = 10 * 1024 * 1024;
    private const string StorageProvider = "CloudflareR2";

    private readonly MyPetLinkDbContext _dbContext;
    private readonly IObjectStorageService _objectStorage;
    private readonly CloudflareR2Options _r2Options;
    private readonly ILogger<MediaService> _logger;

    public MediaService(
        MyPetLinkDbContext dbContext,
        IObjectStorageService objectStorage,
        IOptions<CloudflareR2Options> r2Options,
        ILogger<MediaService> logger)
    {
        _dbContext = dbContext;
        _objectStorage = objectStorage;
        _r2Options = r2Options.Value;
        _logger = logger;
    }

    public async Task<MediaUploadResponse> InitializeUploadAsync(
        Guid? currentUserId,
        InitializeMediaUploadRequest request,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        await EnsureUserExistsAsync(userId, cancellationToken);

        var category = request.Category ?? throw ValidationFailed("category", "Upload category is required.");
        var fileName = SanitizeOriginalFileName(request.OriginalFileName);
        var extension = ValidateFileShape(category, fileName, request.ContentType, request.FileSizeBytes);

        var target = await ResolveTargetAsync(userId, category, request, cancellationToken);
        var objectKey = BuildObjectKey(category, target.PetId, target.OwnerId, extension);
        var isPublic = IsPublicCategory(category);
        var bucketName = isPublic ? _r2Options.PublicBucketName : _r2Options.PrivateBucketName;
        var mediaType = ResolveMediaType(category, request.ContentType);
        var now = DateTimeOffset.UtcNow;

        var media = new MediaFile
        {
            OwnerUserId = userId,
            PetId = target.PetId,
            OriginalFileName = fileName,
            StorageFileName = Path.GetFileName(objectKey),
            ContentType = request.ContentType.Trim(),
            FileSize = request.FileSizeBytes,
            StorageProvider = StorageProvider,
            StoragePath = objectKey,
            BucketName = bucketName,
            ObjectKey = objectKey,
            MediaType = mediaType,
            Category = category,
            IsPublic = isPublic,
            UploadStatus = MediaUploadStatus.Pending,
            Width = request.Width,
            Height = request.Height,
            DurationSeconds = request.DurationSeconds,
            CreatedAt = now,
            UploadedAt = now
        };

        if (target.OwnerType.HasValue && target.OwnerId.HasValue)
        {
            media.Links.Add(new MediaFileLink
            {
                OwnerType = target.OwnerType.Value,
                OwnerId = target.OwnerId.Value,
                SortOrder = await GetNextSortOrderAsync(target.OwnerType.Value, target.OwnerId.Value, cancellationToken),
                AltText = fileName,
                CreatedAt = now
            });
        }

        _dbContext.MediaFiles.Add(media);
        await _dbContext.SaveChangesAsync(cancellationToken);

        var expiresIn = TimeSpan.FromMinutes(Math.Max(1, _r2Options.PresignedUploadExpiryMinutes));
        var presigned = _objectStorage.CreatePresignedUploadUrl(new CreatePresignedUploadUrlRequest(
            bucketName,
            objectKey,
            media.ContentType,
            expiresIn));

        _logger.LogInformation(
            "Initialized media upload {MediaId} for category {Category} and user {UserId}.",
            media.Id,
            media.Category,
            userId);

        return new MediaUploadResponse(
            media.Id,
            category,
            mediaType,
            media.UploadStatus,
            media.IsPublic,
            presigned.Url,
            "PUT",
            new Dictionary<string, string> { ["Content-Type"] = media.ContentType },
            presigned.ExpiresAt);
    }

    public async Task<CompleteMediaUploadResponse> CompleteUploadAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var media = await LoadOwnedMediaAsync(userId, mediaId, trackChanges: true, cancellationToken);

        if (media.UploadStatus != MediaUploadStatus.Pending)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "invalid_upload_state",
                "This upload cannot be completed.");
        }

        var metadata = await _objectStorage.GetObjectMetadataAsync(
            media.BucketName,
            media.ObjectKey,
            cancellationToken);

        if (metadata is null)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "uploaded_object_missing",
                "The uploaded file could not be confirmed. Please try again.");
        }

        if (metadata.ContentLength != media.FileSize)
        {
            media.UploadStatus = MediaUploadStatus.Failed;
            await _dbContext.SaveChangesAsync(cancellationToken);

            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "uploaded_object_mismatch",
                "The uploaded file could not be confirmed. Please try again.");
        }

        if (!string.IsNullOrWhiteSpace(metadata.ContentType)
            && !string.Equals(metadata.ContentType, media.ContentType, StringComparison.OrdinalIgnoreCase))
        {
            media.UploadStatus = MediaUploadStatus.Failed;
            await _dbContext.SaveChangesAsync(cancellationToken);

            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "uploaded_object_mismatch",
                "The uploaded file could not be confirmed. Please try again.");
        }

        var now = DateTimeOffset.UtcNow;
        var mediaToDelete = new List<MediaFile>();

        media.UploadStatus = MediaUploadStatus.Ready;
        media.CompletedAt = now;
        media.UploadedAt = now;

        await ApplyCompletedAssociationAsync(userId, media, mediaToDelete, cancellationToken);
        // One SaveChanges call is atomic and can be retried by the configured
        // SQL execution strategy without a user-managed transaction boundary.
        await _dbContext.SaveChangesAsync(cancellationToken);

        foreach (var oldMedia in mediaToDelete)
        {
            await TryDeleteObjectAsync(oldMedia, cancellationToken);
        }

        _logger.LogInformation(
            "Completed media upload {MediaId} for category {Category} and user {UserId}.",
            media.Id,
            media.Category,
            userId);

        return new CompleteMediaUploadResponse(
            media.Id,
            media.Category,
            media.MediaType,
            media.UploadStatus,
            media.IsPublic,
            ResolvePublicUrl(media),
            now);
    }

    public async Task DeleteAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var media = await LoadOwnedMediaAsync(userId, mediaId, trackChanges: true, cancellationToken);

        if (media.UploadStatus == MediaUploadStatus.Deleted || media.DeletedAt.HasValue)
        {
            return;
        }

        var proofExists = await _dbContext.PaymentProofs.AnyAsync(
            proof => proof.MediaFileId == media.Id,
            cancellationToken);

        if (proofExists)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "media_in_use",
                "This file is already attached to a submitted payment record.");
        }

        await DetachMediaReferencesAsync(userId, media, cancellationToken);
        MarkDeleted(media);
        // Keep the detach and soft-delete in the same implicit transaction so
        // the provider execution strategy owns any transient retry.
        await _dbContext.SaveChangesAsync(cancellationToken);

        await TryDeleteObjectAsync(media, cancellationToken);
    }

    public async Task<MediaDownloadUrlResponse> CreatePrivateDownloadUrlAsync(
        Guid? currentUserId,
        Guid mediaId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var media = await LoadOwnedMediaAsync(userId, mediaId, trackChanges: false, cancellationToken);

        if (media.IsPublic
            || media.UploadStatus != MediaUploadStatus.Ready
            || media.DeletedAt.HasValue
            || !string.Equals(media.BucketName, _r2Options.PrivateBucketName, StringComparison.Ordinal))
        {
            throw NotFound("File was not found.");
        }

        var presigned = _objectStorage.CreatePresignedDownloadUrl(new CreatePresignedDownloadUrlRequest(
            media.BucketName,
            media.ObjectKey,
            TimeSpan.FromMinutes(Math.Max(1, _r2Options.PresignedDownloadExpiryMinutes)),
            media.OriginalFileName,
            media.ContentType));

        return new MediaDownloadUrlResponse(
            media.Id,
            presigned.Url,
            presigned.ExpiresAt,
            media.ContentType,
            media.OriginalFileName);
    }

    public async Task<MediaDownloadUrlResponse> CreateAdminPaymentProofDownloadUrlAsync(
        Guid? currentUserId,
        Guid paymentProofId,
        CancellationToken cancellationToken = default)
    {
        var userId = RequireUserId(currentUserId);
        var isAdmin = await _dbContext.AdminUsers.AnyAsync(
            admin => admin.UserId == userId && admin.IsActive && admin.DisabledAt == null,
            cancellationToken);
        if (!isAdmin)
        {
            throw new ApiException(StatusCodes.Status403Forbidden, "forbidden", "Admin access is required.");
        }

        var media = await _dbContext.PaymentProofs
            .AsNoTracking()
            .Where(proof => proof.Id == paymentProofId)
            .Select(proof => proof.MediaFile)
            .SingleOrDefaultAsync(cancellationToken);

        if (media is null
            || media.IsPublic
            || media.UploadStatus != MediaUploadStatus.Ready
            || media.DeletedAt.HasValue
            || !string.Equals(media.BucketName, _r2Options.PrivateBucketName, StringComparison.Ordinal)
            || string.IsNullOrWhiteSpace(media.ObjectKey))
        {
            throw NotFound("Payment proof file was not found.");
        }

        var presigned = _objectStorage.CreatePresignedDownloadUrl(new CreatePresignedDownloadUrlRequest(
            media.BucketName,
            media.ObjectKey,
            TimeSpan.FromMinutes(Math.Max(1, _r2Options.PresignedDownloadExpiryMinutes)),
            media.OriginalFileName,
            media.ContentType));

        return new MediaDownloadUrlResponse(
            media.Id,
            presigned.Url,
            presigned.ExpiresAt,
            media.ContentType,
            media.OriginalFileName);
    }

    public async Task<int> DeleteStalePendingUploadsAsync(
        TimeSpan olderThan,
        CancellationToken cancellationToken = default)
    {
        var cutoff = DateTimeOffset.UtcNow.Subtract(olderThan);
        var stale = await _dbContext.MediaFiles
            .Where(media =>
                media.UploadStatus == MediaUploadStatus.Pending
                && media.CreatedAt < cutoff
                && media.DeletedAt == null)
            .Take(100)
            .ToListAsync(cancellationToken);

        foreach (var media in stale)
        {
            MarkDeleted(media);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        foreach (var media in stale)
        {
            await TryDeleteObjectAsync(media, cancellationToken);
        }

        return stale.Count;
    }

    private async Task<UploadTarget> ResolveTargetAsync(
        Guid userId,
        MediaUploadCategory category,
        InitializeMediaUploadRequest request,
        CancellationToken cancellationToken)
    {
        switch (category)
        {
            case MediaUploadCategory.PetProfilePhoto:
            case MediaUploadCategory.PetCoverPhoto:
                var petId = RequireGuid(request.PetId, "petId", "Pet is required.");
                await EnsureOwnedPetAsync(userId, petId, cancellationToken);
                return new UploadTarget(petId, null, null);

            case MediaUploadCategory.MomentImage:
            case MediaUploadCategory.MomentVideo:
                var momentId = RequireGuid(request.MomentId, "momentId", "Memory is required.");
                var memory = await _dbContext.PetMemories
                    .Include(item => item.Pet)
                    .SingleOrDefaultAsync(
                        item =>
                            item.Id == momentId
                            && item.Pet.OwnerUserId == userId
                            && item.Pet.DeletedAt == null
                            && item.DeletedAt == null,
                        cancellationToken)
                    ?? throw NotFound("Memory was not found.");
                return new UploadTarget(memory.PetId, MediaOwnerType.PetMemory, memory.Id);

            case MediaUploadCategory.VaccinationDocument:
            case MediaUploadCategory.MedicalDocument:
                var documentPetId = RequireGuid(request.PetId, "petId", "Pet is required.");
                await EnsureOwnedPetAsync(userId, documentPetId, cancellationToken);

                if (request.CareRecordId.HasValue)
                {
                    var careRecord = await _dbContext.CareRecords
                        .SingleOrDefaultAsync(
                            item =>
                                item.Id == request.CareRecordId.Value
                                && item.PetId == documentPetId
                                && item.Pet.OwnerUserId == userId
                                && item.DeletedAt == null,
                            cancellationToken)
                        ?? throw NotFound("Care record was not found.");

                    return new UploadTarget(documentPetId, MediaOwnerType.CareRecord, careRecord.Id);
                }

                return new UploadTarget(documentPetId, MediaOwnerType.Pet, documentPetId);

            case MediaUploadCategory.OrderReceipt:
                var orderId = RequireGuid(request.OrderId, "orderId", "Order is required.");
                var order = await _dbContext.TagOrders
                    .SingleOrDefaultAsync(
                        item => item.Id == orderId && item.OwnerUserId == userId,
                        cancellationToken)
                    ?? throw NotFound("Order was not found.");
                return new UploadTarget(order.PetId, MediaOwnerType.TagOrder, order.Id);

            default:
                throw ValidationFailed("category", "Upload category is not supported.");
        }
    }

    private async Task ApplyCompletedAssociationAsync(
        Guid userId,
        MediaFile media,
        ICollection<MediaFile> mediaToDelete,
        CancellationToken cancellationToken)
    {
        switch (media.Category)
        {
            case MediaUploadCategory.PetProfilePhoto:
                await ReplacePetMediaAsync(userId, media, replaceProfilePhoto: true, mediaToDelete, cancellationToken);
                break;

            case MediaUploadCategory.PetCoverPhoto:
                await ReplacePetMediaAsync(userId, media, replaceProfilePhoto: false, mediaToDelete, cancellationToken);
                break;

            case MediaUploadCategory.MomentImage:
            case MediaUploadCategory.MomentVideo:
                await SetMemoryCoverIfNeededAsync(userId, media, cancellationToken);
                break;
        }
    }

    private async Task ReplacePetMediaAsync(
        Guid userId,
        MediaFile media,
        bool replaceProfilePhoto,
        ICollection<MediaFile> mediaToDelete,
        CancellationToken cancellationToken)
    {
        var petId = media.PetId ?? throw NotFound("Pet was not found.");
        var pet = await _dbContext.Pets
            .Include(item => item.ProfileMediaFile)
            .Include(item => item.CoverMediaFile)
            .SingleOrDefaultAsync(
                item => item.Id == petId && item.OwnerUserId == userId && item.DeletedAt == null,
                cancellationToken)
            ?? throw NotFound("Pet was not found.");

        var oldMedia = replaceProfilePhoto ? pet.ProfileMediaFile : pet.CoverMediaFile;

        if (replaceProfilePhoto)
        {
            pet.ProfileMediaFileId = media.Id;
        }
        else
        {
            pet.CoverMediaFileId = media.Id;
        }

        if (oldMedia is not null && oldMedia.Id != media.Id)
        {
            MarkDeleted(oldMedia);
            mediaToDelete.Add(oldMedia);
        }
    }

    private async Task SetMemoryCoverIfNeededAsync(
        Guid userId,
        MediaFile media,
        CancellationToken cancellationToken)
    {
        var memoryId = media.Links
            .Where(link => link.ArchivedAt == null && link.OwnerType == MediaOwnerType.PetMemory)
            .Select(link => (Guid?)link.OwnerId)
            .FirstOrDefault();

        if (!memoryId.HasValue)
        {
            return;
        }

        var memory = await _dbContext.PetMemories
            .Include(item => item.Pet)
            .SingleOrDefaultAsync(
                item =>
                    item.Id == memoryId.Value
                    && item.Pet.OwnerUserId == userId
                    && item.Pet.DeletedAt == null
                    && item.DeletedAt == null,
                cancellationToken)
            ?? throw NotFound("Memory was not found.");

        memory.CoverMediaFileId ??= media.Id;
    }

    private async Task DetachMediaReferencesAsync(
        Guid userId,
        MediaFile media,
        CancellationToken cancellationToken)
    {
        var pets = await _dbContext.Pets
            .Where(item =>
                item.OwnerUserId == userId
                && (item.ProfileMediaFileId == media.Id || item.CoverMediaFileId == media.Id))
            .ToListAsync(cancellationToken);

        foreach (var pet in pets)
        {
            if (pet.ProfileMediaFileId == media.Id)
            {
                pet.ProfileMediaFileId = null;
            }

            if (pet.CoverMediaFileId == media.Id)
            {
                pet.CoverMediaFileId = null;
            }
        }

        var links = await _dbContext.MediaFileLinks
            .Where(item => item.MediaFileId == media.Id && item.ArchivedAt == null)
            .ToListAsync(cancellationToken);
        var now = DateTimeOffset.UtcNow;

        foreach (var link in links)
        {
            link.ArchivedAt = now;
        }

        var memories = await _dbContext.PetMemories
            .Include(item => item.Pet)
            .Where(item => item.CoverMediaFileId == media.Id && item.Pet.OwnerUserId == userId)
            .ToListAsync(cancellationToken);

        foreach (var memory in memories)
        {
            memory.CoverMediaFileId = await _dbContext.MediaFileLinks
                .Where(link =>
                    link.OwnerType == MediaOwnerType.PetMemory
                    && link.OwnerId == memory.Id
                    && link.MediaFileId != media.Id
                    && link.ArchivedAt == null
                    && link.MediaFile.UploadStatus == MediaUploadStatus.Ready
                    && link.MediaFile.DeletedAt == null)
                .OrderBy(link => link.SortOrder)
                .Select(link => (Guid?)link.MediaFileId)
                .FirstOrDefaultAsync(cancellationToken);
        }
    }

    private async Task<MediaFile> LoadOwnedMediaAsync(
        Guid userId,
        Guid mediaId,
        bool trackChanges,
        CancellationToken cancellationToken)
    {
        var query = _dbContext.MediaFiles
            .Include(media => media.Links)
            .Where(media => media.Id == mediaId && media.OwnerUserId == userId);

        if (!trackChanges)
        {
            query = query.AsNoTracking();
        }

        var media = await query.SingleOrDefaultAsync(cancellationToken);
        return media ?? throw NotFound("File was not found.");
    }

    private async Task EnsureUserExistsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var exists = await _dbContext.Users.AnyAsync(
            item => item.Id == userId && item.DeletedAt == null && item.Status == UserStatus.Active,
            cancellationToken);

        if (!exists)
        {
            throw Unauthorized();
        }
    }

    private async Task EnsureOwnedPetAsync(Guid userId, Guid petId, CancellationToken cancellationToken)
    {
        var exists = await _dbContext.Pets.AnyAsync(
            item => item.Id == petId && item.OwnerUserId == userId && item.DeletedAt == null,
            cancellationToken);

        if (!exists)
        {
            throw NotFound("Pet was not found.");
        }
    }

    private async Task<int> GetNextSortOrderAsync(
        MediaOwnerType ownerType,
        Guid ownerId,
        CancellationToken cancellationToken)
    {
        var maxSortOrder = await _dbContext.MediaFileLinks
            .Where(link => link.OwnerType == ownerType && link.OwnerId == ownerId)
            .Select(link => (int?)link.SortOrder)
            .MaxAsync(cancellationToken);

        return (maxSortOrder ?? -1) + 1;
    }

    private string ResolvePublicUrl(MediaFile media)
    {
        return media.IsPublic && media.UploadStatus == MediaUploadStatus.Ready && media.DeletedAt == null
            ? MediaUrlBuilder.BuildPublicUrl(_r2Options.PublicBaseUrl, media.ObjectKey)
            : "";
    }

    private async Task TryDeleteObjectAsync(MediaFile media, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(media.BucketName) || string.IsNullOrWhiteSpace(media.ObjectKey))
        {
            return;
        }

        try
        {
            await _objectStorage.DeleteObjectAsync(media.BucketName, media.ObjectKey, cancellationToken);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            _logger.LogWarning(
                exception,
                "Could not delete media object for media {MediaId}.",
                media.Id);
        }
    }

    private static string BuildObjectKey(MediaUploadCategory category, Guid? petId, Guid? ownerId, string extension)
    {
        var randomName = $"{Guid.NewGuid():N}{extension}";

        return category switch
        {
            MediaUploadCategory.PetProfilePhoto => $"pets/{petId}/profile/{randomName}",
            MediaUploadCategory.PetCoverPhoto => $"pets/{petId}/covers/{randomName}",
            MediaUploadCategory.MomentImage or MediaUploadCategory.MomentVideo => $"pets/{petId}/moments/{ownerId}/{randomName}",
            MediaUploadCategory.VaccinationDocument or MediaUploadCategory.MedicalDocument => $"pet-documents/{randomName}",
            MediaUploadCategory.OrderReceipt => $"order-receipts/{randomName}",
            _ => throw ValidationFailed("category", "Upload category is not supported.")
        };
    }

    private static string ValidateFileShape(
        MediaUploadCategory category,
        string fileName,
        string contentType,
        long fileSizeBytes)
    {
        var normalizedContentType = contentType.Trim().ToLowerInvariant();
        var extension = Path.GetExtension(fileName).ToLowerInvariant();

        if (string.IsNullOrWhiteSpace(extension))
        {
            throw ValidationFailed("originalFileName", "File extension is required.");
        }

        var rules = GetRules(category);

        if (fileSizeBytes <= 0)
        {
            throw ValidationFailed("fileSizeBytes", "File cannot be empty.");
        }

        if (fileSizeBytes > rules.MaxBytes)
        {
            throw new ApiException(
                StatusCodes.Status413PayloadTooLarge,
                "file_too_large",
                rules.TooLargeMessage);
        }

        if (!rules.ContentTypes.TryGetValue(normalizedContentType, out var allowedExtensions)
            || !allowedExtensions.Contains(extension, StringComparer.OrdinalIgnoreCase))
        {
            throw new ApiException(
                StatusCodes.Status415UnsupportedMediaType,
                "unsupported_media_type",
                "This file type is not supported.");
        }

        return extension;
    }

    private static UploadRules GetRules(MediaUploadCategory category)
    {
        return category switch
        {
            MediaUploadCategory.PetProfilePhoto
                or MediaUploadCategory.PetCoverPhoto
                or MediaUploadCategory.MomentImage => UploadRules.Images,
            MediaUploadCategory.MomentVideo => UploadRules.Video,
            MediaUploadCategory.VaccinationDocument
                or MediaUploadCategory.MedicalDocument
                or MediaUploadCategory.OrderReceipt => UploadRules.Documents,
            _ => throw ValidationFailed("category", "Upload category is not supported.")
        };
    }

    private static MediaFileType ResolveMediaType(MediaUploadCategory category, string contentType)
    {
        if (category == MediaUploadCategory.MomentVideo)
        {
            return MediaFileType.Video;
        }

        if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            && category is not (MediaUploadCategory.VaccinationDocument
                or MediaUploadCategory.MedicalDocument
                or MediaUploadCategory.OrderReceipt))
        {
            return MediaFileType.Image;
        }

        return category is MediaUploadCategory.PetProfilePhoto
            or MediaUploadCategory.PetCoverPhoto
            or MediaUploadCategory.MomentImage
                ? MediaFileType.Image
                : MediaFileType.Document;
    }

    private static bool IsPublicCategory(MediaUploadCategory category)
    {
        return category is MediaUploadCategory.PetProfilePhoto
            or MediaUploadCategory.PetCoverPhoto
            or MediaUploadCategory.MomentImage
            or MediaUploadCategory.MomentVideo;
    }

    private static void MarkDeleted(MediaFile media)
    {
        var now = DateTimeOffset.UtcNow;
        media.UploadStatus = MediaUploadStatus.Deleted;
        media.DeletedAt ??= now;
    }

    private static Guid RequireGuid(Guid? value, string fieldName, string message)
    {
        if (!value.HasValue || value.Value == Guid.Empty)
        {
            throw ValidationFailed(fieldName, message);
        }

        return value.Value;
    }

    private static string SanitizeOriginalFileName(string originalFileName)
    {
        var fileName = Path.GetFileName(originalFileName.Replace('\\', '/')).Trim();

        if (string.IsNullOrWhiteSpace(fileName))
        {
            throw ValidationFailed("originalFileName", "File name is required.");
        }

        return fileName.Length <= 260 ? fileName : fileName[^260..];
    }

    private static Guid RequireUserId(Guid? currentUserId)
    {
        return currentUserId ?? throw Unauthorized();
    }

    private static ApiException ValidationFailed(string field, string message)
    {
        return new ApiException(
            StatusCodes.Status400BadRequest,
            "validation_failed",
            "Please check the submitted fields.",
            new Dictionary<string, string[]> { [field] = [message] });
    }

    private static ApiException NotFound(string message)
    {
        return new ApiException(StatusCodes.Status404NotFound, "not_found", message);
    }

    private static ApiException Unauthorized()
    {
        return new ApiException(
            StatusCodes.Status401Unauthorized,
            "unauthorized",
            "Authentication is required.");
    }

    private sealed record UploadTarget(
        Guid? PetId,
        MediaOwnerType? OwnerType,
        Guid? OwnerId);

    private sealed record UploadRules(
        IReadOnlyDictionary<string, string[]> ContentTypes,
        long MaxBytes,
        string TooLargeMessage)
    {
        public static UploadRules Images { get; } = new(
            new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["image/jpeg"] = [".jpg", ".jpeg"],
                ["image/png"] = [".png"],
                ["image/webp"] = [".webp"]
            },
            ImageMaxBytes,
            "Images must be 10 MB or smaller.");

        public static UploadRules Video { get; } = new(
            new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["video/mp4"] = [".mp4"]
            },
            VideoMaxBytes,
            "Videos must be 50 MB or smaller.");

        public static UploadRules Documents { get; } = new(
            new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
            {
                ["application/pdf"] = [".pdf"],
                ["image/jpeg"] = [".jpg", ".jpeg"],
                ["image/png"] = [".png"]
            },
            DocumentMaxBytes,
            "Documents must be 10 MB or smaller.");
    }
}

