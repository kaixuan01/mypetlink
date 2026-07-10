namespace MyPetLink.Api.Storage;

public sealed record CreatePresignedUploadUrlRequest(
    string BucketName,
    string ObjectKey,
    string ContentType,
    TimeSpan ExpiresIn);

public sealed record CreatePresignedDownloadUrlRequest(
    string BucketName,
    string ObjectKey,
    TimeSpan ExpiresIn,
    string? ResponseFileName,
    string? ResponseContentType);

public sealed record PresignedUrlResult(
    string Url,
    DateTimeOffset ExpiresAt);

public sealed record StoredObjectMetadata(
    long ContentLength,
    string? ContentType,
    string? ETag);

public interface IObjectStorageService
{
    PresignedUrlResult CreatePresignedUploadUrl(CreatePresignedUploadUrlRequest request);

    PresignedUrlResult CreatePresignedDownloadUrl(CreatePresignedDownloadUrlRequest request);

    Task<StoredObjectMetadata?> GetObjectMetadataAsync(
        string bucketName,
        string objectKey,
        CancellationToken cancellationToken = default);

    Task DeleteObjectAsync(
        string bucketName,
        string objectKey,
        CancellationToken cancellationToken = default);

    string GetPublicUrl(string objectKey);
}

