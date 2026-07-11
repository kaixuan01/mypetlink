using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace MyPetLink.Api.Storage;

public sealed class CloudflareR2StorageService : IObjectStorageService
{
    private readonly Lazy<IAmazonS3> _client;
    private readonly CloudflareR2Options _options;

    public CloudflareR2StorageService(IOptions<CloudflareR2Options> options)
    {
        _options = options.Value;
        _client = new Lazy<IAmazonS3>(CreateClient);
    }

    public PresignedUrlResult CreatePresignedUploadUrl(CreatePresignedUploadUrlRequest request)
    {
        EnsureSafeObjectRequest(request.BucketName, request.ObjectKey);

        var expiresAt = DateTimeOffset.UtcNow.Add(request.ExpiresIn);
        var url = _client.Value.GetPreSignedURL(new GetPreSignedUrlRequest
        {
            BucketName = request.BucketName,
            Key = request.ObjectKey,
            Verb = HttpVerb.PUT,
            ContentType = request.ContentType,
            Expires = expiresAt.UtcDateTime
        });

        return new PresignedUrlResult(url, expiresAt);
    }

    public PresignedUrlResult CreatePresignedDownloadUrl(CreatePresignedDownloadUrlRequest request)
    {
        EnsureSafeObjectRequest(request.BucketName, request.ObjectKey);

        var expiresAt = DateTimeOffset.UtcNow.Add(request.ExpiresIn);
        var presignedRequest = new GetPreSignedUrlRequest
        {
            BucketName = request.BucketName,
            Key = request.ObjectKey,
            Verb = HttpVerb.GET,
            Expires = expiresAt.UtcDateTime
        };

        if (!string.IsNullOrWhiteSpace(request.ResponseContentType))
        {
            presignedRequest.ResponseHeaderOverrides.ContentType = request.ResponseContentType;
        }

        if (!string.IsNullOrWhiteSpace(request.ResponseFileName))
        {
            presignedRequest.ResponseHeaderOverrides.ContentDisposition =
                $"attachment; filename=\"{SanitizeDownloadFileName(request.ResponseFileName)}\"";
        }

        return new PresignedUrlResult(_client.Value.GetPreSignedURL(presignedRequest), expiresAt);
    }

    public async Task<StoredObjectMetadata?> GetObjectMetadataAsync(
        string bucketName,
        string objectKey,
        CancellationToken cancellationToken = default)
    {
        EnsureSafeObjectRequest(bucketName, objectKey);

        try
        {
            var response = await _client.Value.GetObjectMetadataAsync(
                new GetObjectMetadataRequest
                {
                    BucketName = bucketName,
                    Key = objectKey
                },
                cancellationToken);

            return new StoredObjectMetadata(
                response.ContentLength,
                response.Headers.ContentType,
                response.ETag);
        }
        catch (AmazonS3Exception exception) when (exception.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    public async Task DeleteObjectAsync(
        string bucketName,
        string objectKey,
        CancellationToken cancellationToken = default)
    {
        EnsureSafeObjectRequest(bucketName, objectKey);

        await _client.Value.DeleteObjectAsync(
            new DeleteObjectRequest
            {
                BucketName = bucketName,
                Key = objectKey
            },
            cancellationToken);
    }

    public string GetPublicUrl(string objectKey)
    {
        return MediaUrlBuilder.BuildPublicUrl(_options.PublicBaseUrl, objectKey);
    }

    private IAmazonS3 CreateClient()
    {
        var serviceUrl = _options.GetServiceUrl();

        if (string.IsNullOrWhiteSpace(serviceUrl)
            || string.IsNullOrWhiteSpace(_options.AccessKeyId)
            || string.IsNullOrWhiteSpace(_options.SecretAccessKey))
        {
            throw new InvalidOperationException("Cloudflare R2 storage is not configured.");
        }

        var config = new AmazonS3Config
        {
            ServiceURL = serviceUrl,
            ForcePathStyle = true,
            AuthenticationRegion = "auto"
        };

        return new AmazonS3Client(
            new BasicAWSCredentials(_options.AccessKeyId, _options.SecretAccessKey),
            config);
    }

    private static void EnsureSafeObjectRequest(string bucketName, string objectKey)
    {
        if (string.IsNullOrWhiteSpace(bucketName))
        {
            throw new InvalidOperationException("Storage bucket name is not configured.");
        }

        if (string.IsNullOrWhiteSpace(objectKey)
            || objectKey.StartsWith("/", StringComparison.Ordinal)
            || objectKey.Contains("..", StringComparison.Ordinal)
            || objectKey.Contains('\\', StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Storage object key is invalid.");
        }
    }

    private static string SanitizeDownloadFileName(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var sanitized = new string(value.Select(item => invalid.Contains(item) ? '_' : item).ToArray());
        return string.IsNullOrWhiteSpace(sanitized) ? "mypetlink-file" : sanitized;
    }
}

public static class MediaUrlBuilder
{
    // The single source of truth for turning a stored object key into a public
    // media URL. Everything that renders a public photo (pet profile/cover,
    // moment media, QR safety, tag scan) resolves through here so the same
    // MediaFile always produces the same absolute URL.
    public static string BuildPublicUrl(string? publicBaseUrl, string? objectKey)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
        {
            return "";
        }

        var trimmedKey = objectKey.Trim();

        // Already a full URL (a value that was resolved earlier): return it as-is
        // instead of prefixing the base again.
        if (IsAbsoluteHttpUrl(trimmedKey))
        {
            return trimmedKey;
        }

        // The public base must be an absolute http(s) URL. If it is missing or
        // misconfigured (for example set to a bucket name), never fall back to a
        // relative value: the browser would resolve it against the current page
        // and request the wrong host (e.g. mypetlink.com.my/<bucket>/pets/...).
        if (!IsAbsoluteHttpUrl(publicBaseUrl))
        {
            return "";
        }

        var normalizedBase = publicBaseUrl!.Trim().TrimEnd('/');

        // Split on '/' with RemoveEmptyEntries so a leading slash or duplicate
        // slashes in the object key never produce a malformed or double-slashed
        // URL. The bucket name is intentionally never part of the object key.
        return $"{normalizedBase}/{EscapeObjectKey(trimmedKey)}";
    }

    public static string EscapeObjectKey(string objectKey)
    {
        return string.Join(
            '/',
            objectKey.Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Select(Uri.EscapeDataString));
    }

    private static bool IsAbsoluteHttpUrl(string? value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}

