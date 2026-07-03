namespace MyPetLink.Api.Storage;

public sealed record StoreFileRequest(
    Stream Content,
    string OriginalFileName,
    string ContentType,
    string? OwnerType = null,
    Guid? OwnerId = null);

public sealed record StoredFileResult(
    string OriginalFileName,
    string StorageFileName,
    string ContentType,
    long FileSize,
    string StorageProvider,
    string StoragePath,
    string Sha256,
    DateTimeOffset UploadedAt);

public interface IFileStorageProvider
{
    Task<StoredFileResult> SaveAsync(StoreFileRequest request, CancellationToken cancellationToken = default);
}
