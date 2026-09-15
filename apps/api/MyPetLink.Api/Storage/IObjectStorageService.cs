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

    /// <summary>
    /// Reads an object back into memory, or returns <c>null</c> when it is not
    /// there. Used by derivative generation, which must read the original the
    /// browser uploaded directly to storage.
    /// </summary>
    /// <param name="maxBytes">
    /// Hard ceiling on what will be buffered. A response larger than this is
    /// abandoned and <c>null</c> is returned, so a wrong or tampered object can
    /// never be read into unbounded memory.
    /// </param>
    Task<byte[]?> GetObjectBytesAsync(
        string bucketName,
        string objectKey,
        long maxBytes,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Writes an object from the server. Only used for content the server
    /// generated itself — derivatives — never for content a client supplied,
    /// which continues to go through a presigned upload.
    /// </summary>
    Task PutObjectAsync(
        string bucketName,
        string objectKey,
        byte[] content,
        string contentType,
        CancellationToken cancellationToken = default);

    string GetPublicUrl(string objectKey);
}

