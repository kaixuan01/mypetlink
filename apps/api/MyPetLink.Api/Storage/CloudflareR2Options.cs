using Microsoft.Extensions.Options;

namespace MyPetLink.Api.Storage;

public sealed class CloudflareR2Options
{
    public const string SectionName = "CloudflareR2";

    public string? AccountId { get; init; }
    public string? AccessKeyId { get; init; }
    public string? SecretAccessKey { get; init; }
    public string? ServiceUrl { get; init; }
    public string PublicBucketName { get; init; } = "mypetlink-public-media";
    public string PrivateBucketName { get; init; } = "mypetlink-private-files";
    public string PublicBaseUrl { get; init; } = "https://media.mypetlink.com.my";
    public int PresignedUploadExpiryMinutes { get; init; } = 5;
    public int PresignedDownloadExpiryMinutes { get; init; } = 5;

    public string GetServiceUrl()
    {
        if (!string.IsNullOrWhiteSpace(ServiceUrl))
        {
            return ServiceUrl.Trim().TrimEnd('/');
        }

        return string.IsNullOrWhiteSpace(AccountId)
            ? ""
            : $"https://{AccountId.Trim()}.r2.cloudflarestorage.com";
    }
}

public sealed class CloudflareR2OptionsValidator : IValidateOptions<CloudflareR2Options>
{
    private readonly IConfiguration _configuration;

    public CloudflareR2OptionsValidator(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public ValidateOptionsResult Validate(string? name, CloudflareR2Options options)
    {
        var provider = _configuration[$"{StorageOptions.SectionName}:Provider"];
        var r2Enabled = string.Equals(provider, "CloudflareR2", StringComparison.OrdinalIgnoreCase);

        if (!r2Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        var failures = new List<string>();
        Require(options.GetServiceUrl(), $"{CloudflareR2Options.SectionName}:ServiceUrl or AccountId", failures);
        Require(options.AccessKeyId, $"{CloudflareR2Options.SectionName}:AccessKeyId", failures);
        Require(options.SecretAccessKey, $"{CloudflareR2Options.SectionName}:SecretAccessKey", failures);
        Require(options.PublicBucketName, $"{CloudflareR2Options.SectionName}:PublicBucketName", failures);
        Require(options.PrivateBucketName, $"{CloudflareR2Options.SectionName}:PrivateBucketName", failures);
        Require(options.PublicBaseUrl, $"{CloudflareR2Options.SectionName}:PublicBaseUrl", failures);

        // PublicBaseUrl must be an absolute http(s) URL (for example
        // https://media.mypetlink.com.my). A non-URL value such as a bucket name
        // would cause public photo URLs to be emitted as relative paths, which
        // the browser then requests from the wrong host.
        if (!string.IsNullOrWhiteSpace(options.PublicBaseUrl) && !IsAbsoluteHttpUrl(options.PublicBaseUrl))
        {
            failures.Add(
                $"{CloudflareR2Options.SectionName}:PublicBaseUrl must be an absolute http(s) URL, " +
                "for example https://media.mypetlink.com.my.");
        }

        // Public and private media must live in different buckets so profile and
        // cover photos are never stored in (or served from) the private bucket.
        if (!string.IsNullOrWhiteSpace(options.PublicBucketName)
            && !string.IsNullOrWhiteSpace(options.PrivateBucketName)
            && string.Equals(
                options.PublicBucketName.Trim(),
                options.PrivateBucketName.Trim(),
                StringComparison.OrdinalIgnoreCase))
        {
            failures.Add(
                $"{CloudflareR2Options.SectionName}:PublicBucketName and " +
                $"{CloudflareR2Options.SectionName}:PrivateBucketName must be different buckets.");
        }

        if (options.PresignedUploadExpiryMinutes <= 0 || options.PresignedUploadExpiryMinutes > 60)
        {
            failures.Add($"{CloudflareR2Options.SectionName}:PresignedUploadExpiryMinutes must be between 1 and 60.");
        }

        if (options.PresignedDownloadExpiryMinutes <= 0 || options.PresignedDownloadExpiryMinutes > 60)
        {
            failures.Add($"{CloudflareR2Options.SectionName}:PresignedDownloadExpiryMinutes must be between 1 and 60.");
        }

        return failures.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }

    private static void Require(string? value, string key, ICollection<string> failures)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            failures.Add($"{key} must be configured when Storage:Provider is CloudflareR2.");
        }
    }

    private static bool IsAbsoluteHttpUrl(string? value)
    {
        return !string.IsNullOrWhiteSpace(value)
            && Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }
}

