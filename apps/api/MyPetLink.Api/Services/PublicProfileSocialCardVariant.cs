namespace MyPetLink.Api.Services;

public enum PublicProfileSocialCardVariant
{
    OpenGraph,
    ShareCard
}

public static class PublicProfileSocialCardVariants
{
    public const string OpenGraphQueryValue = "open-graph";
    public const string ShareCardQueryValue = "share-card";

    // The Open Graph layout is already versioned through PublicProfileVersion.
    // Share Card has its own template version so its API cache can be invalidated
    // without changing the production Open Graph image URL or bytes.
    public const string ShareCardTemplateVersion = "pet-share-card-v1";

    public static PublicProfileSocialCardVariant Parse(string? value)
    {
        return string.Equals(value, ShareCardQueryValue, StringComparison.OrdinalIgnoreCase)
            ? PublicProfileSocialCardVariant.ShareCard
            : PublicProfileSocialCardVariant.OpenGraph;
    }

    public static string CacheIdentity(this PublicProfileSocialCardVariant variant)
    {
        return variant == PublicProfileSocialCardVariant.ShareCard
            ? $"{ShareCardQueryValue}:{ShareCardTemplateVersion}"
            : $"{OpenGraphQueryValue}:{PublicProfileVersion.TemplateVersion}";
    }

    public static string TemplateVersion(this PublicProfileSocialCardVariant variant)
    {
        return variant == PublicProfileSocialCardVariant.ShareCard
            ? ShareCardTemplateVersion
            : PublicProfileVersion.TemplateVersion;
    }
}
