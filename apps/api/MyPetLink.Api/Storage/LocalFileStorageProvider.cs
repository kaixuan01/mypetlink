using System.Security.Cryptography;
using Microsoft.Extensions.Options;

namespace MyPetLink.Api.Storage;

public sealed class LocalFileStorageProvider : IFileStorageProvider
{
    private readonly IHostEnvironment _environment;
    private readonly StorageOptions _options;

    public LocalFileStorageProvider(IOptions<StorageOptions> options, IHostEnvironment environment)
    {
        _options = options.Value;
        _environment = environment;
    }

    public async Task<StoredFileResult> SaveAsync(
        StoreFileRequest request,
        CancellationToken cancellationToken = default)
    {
        var uploadedAt = DateTimeOffset.UtcNow;
        var extension = Path.GetExtension(request.OriginalFileName);
        var storageFileName = $"{Guid.NewGuid():N}{extension}";
        var relativePath = Path.Combine(uploadedAt.ToString("yyyy"), uploadedAt.ToString("MM"), storageFileName);
        var root = Path.IsPathRooted(_options.LocalRoot)
            ? _options.LocalRoot
            : Path.Combine(_environment.ContentRootPath, _options.LocalRoot);
        var fullPath = Path.Combine(root, relativePath);

        Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);

        await using var destination = File.Create(fullPath);
        using var sha256 = SHA256.Create();
        await using var hashingStream = new CryptoStream(destination, sha256, CryptoStreamMode.Write);
        await request.Content.CopyToAsync(hashingStream, cancellationToken);
        hashingStream.FlushFinalBlock();

        var fileInfo = new FileInfo(fullPath);
        var hash = Convert.ToHexString(sha256.Hash ?? Array.Empty<byte>()).ToLowerInvariant();

        return new StoredFileResult(
            request.OriginalFileName,
            storageFileName,
            request.ContentType,
            fileInfo.Length,
            "Local",
            relativePath.Replace(Path.DirectorySeparatorChar, '/'),
            hash,
            uploadedAt);
    }
}
