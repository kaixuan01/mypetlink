namespace MyPetLink.Api.Services;

public enum PublicProfileSocialCardVariant
{
    OpenGraph,
    ShareCard,
    Birthday,
    Adoption
}

public static class PublicProfileSocialCardVariants
{
    public const string OpenGraphQueryValue = "open-graph";
    public const string ShareCardQueryValue = "share-card";
    public const string BirthdayQueryValue = "birthday";
    public const string AdoptionQueryValue = "adoption";

    // The Open Graph layout is already versioned through PublicProfileVersion.
    // Share Card has its own template version so its API cache can be invalidated
    // without changing the production Open Graph image URL or bytes.
    public const string ShareCardTemplateVersion = "pet-share-card-v1";
    public const string BirthdayTemplateVersion = "pet-birthday-card-v1";
    public const string AdoptionTemplateVersion = "pet-adoption-card-v1";

    public static PublicProfileSocialCardVariant Parse(string? value)
    {
        if (string.Equals(value, ShareCardQueryValue, StringComparison.OrdinalIgnoreCase))
            return PublicProfileSocialCardVariant.ShareCard;
        if (string.Equals(value, BirthdayQueryValue, StringComparison.OrdinalIgnoreCase))
            return PublicProfileSocialCardVariant.Birthday;
        if (string.Equals(value, AdoptionQueryValue, StringComparison.OrdinalIgnoreCase))
            return PublicProfileSocialCardVariant.Adoption;
        return PublicProfileSocialCardVariant.OpenGraph;
    }

    public static string CacheIdentity(this PublicProfileSocialCardVariant variant)
    {
        return variant switch
        {
            PublicProfileSocialCardVariant.ShareCard => $"{ShareCardQueryValue}:{ShareCardTemplateVersion}",
            PublicProfileSocialCardVariant.Birthday => $"{BirthdayQueryValue}:{BirthdayTemplateVersion}",
            PublicProfileSocialCardVariant.Adoption => $"{AdoptionQueryValue}:{AdoptionTemplateVersion}",
            _ => $"{OpenGraphQueryValue}:{PublicProfileVersion.TemplateVersion}"
        };
    }

    public static string TemplateVersion(this PublicProfileSocialCardVariant variant)
    {
        return variant switch
        {
            PublicProfileSocialCardVariant.ShareCard => ShareCardTemplateVersion,
            PublicProfileSocialCardVariant.Birthday => BirthdayTemplateVersion,
            PublicProfileSocialCardVariant.Adoption => AdoptionTemplateVersion,
            _ => PublicProfileVersion.TemplateVersion
        };
    }
}
