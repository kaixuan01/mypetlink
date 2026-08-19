using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

/// <summary>
/// The template version is the only lever that invalidates an already-cached
/// card when a layout changes: the rest of the cache key (public code, profile
/// version, variant) stays identical. These tests pin the current identities so
/// a future layout change cannot silently ship behind a stale cache again.
/// </summary>
public sealed class SocialCardTemplateVersionTests
{
    [Fact]
    public void PortraitCards_UseTheCurrentTemplateGeneration()
    {
        Assert.Equal("pet-share-card-v6", PublicProfileSocialCardVariants.ShareCardTemplateVersion);
        Assert.Equal("pet-birthday-card-v6", PublicProfileSocialCardVariants.BirthdayTemplateVersion);
        Assert.Equal("pet-adoption-card-v6", PublicProfileSocialCardVariants.AdoptionTemplateVersion);
    }

    [Fact]
    public void OpenGraphCard_KeepsItsOwnUnchangedIdentity()
    {
        // The Open Graph layout was not part of the portrait layout fix, so its
        // cached cards must not be invalidated.
        Assert.Equal("social-card-v3", PublicProfileVersion.TemplateVersion);
        Assert.Equal(
            "social-card-v3",
            PublicProfileSocialCardVariant.OpenGraph.TemplateVersion());
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.ShareCard, "pet-share-card-v6")]
    [InlineData(PublicProfileSocialCardVariant.Birthday, "pet-birthday-card-v6")]
    [InlineData(PublicProfileSocialCardVariant.Adoption, "pet-adoption-card-v6")]
    [InlineData(PublicProfileSocialCardVariant.OpenGraph, "social-card-v3")]
    public void EveryVariant_ReportsItsOwnTemplateVersion(
        PublicProfileSocialCardVariant variant,
        string expected)
    {
        Assert.Equal(expected, variant.TemplateVersion());
        Assert.Contains(expected, variant.CacheIdentity());
    }

    [Fact]
    public void CacheIdentities_StayDistinctPerVariant()
    {
        var identities = new[]
        {
            PublicProfileSocialCardVariant.OpenGraph.CacheIdentity(),
            PublicProfileSocialCardVariant.ShareCard.CacheIdentity(),
            PublicProfileSocialCardVariant.Birthday.CacheIdentity(),
            PublicProfileSocialCardVariant.Adoption.CacheIdentity(),
        };

        Assert.Equal(identities.Length, identities.Distinct().Count());
    }

    [Theory]
    [InlineData(PublicProfileSocialCardVariant.ShareCard, "pet-share-card-v5")]
    [InlineData(PublicProfileSocialCardVariant.Birthday, "pet-birthday-card-v5")]
    [InlineData(PublicProfileSocialCardVariant.Adoption, "pet-adoption-card-v5")]
    public void PortraitCacheIdentities_DifferFromThePreviousGeneration(
        PublicProfileSocialCardVariant variant,
        string previousTemplateVersion)
    {
        // A card cached under the previous identity can never be served for the
        // current one, which is what releases the pre-fix drawings.
        Assert.DoesNotContain(previousTemplateVersion, variant.CacheIdentity());
    }

    [Fact]
    public void EdgeMirrorsEveryTemplateVersionExactly()
    {
        // The edge rejects an origin response whose template version does not
        // match its own, so a one-sided bump would fail every portrait card
        // rather than serving a stale one. Keep the two files in step.
        var edge = File.ReadAllText(EdgeModulePath());

        foreach (var expected in new[]
                 {
                     PublicProfileVersion.TemplateVersion,
                     PublicProfileSocialCardVariants.ShareCardTemplateVersion,
                     PublicProfileSocialCardVariants.BirthdayTemplateVersion,
                     PublicProfileSocialCardVariants.AdoptionTemplateVersion,
                 })
        {
            Assert.Contains($"templateVersion: \"{expected}\"", edge);
        }

        foreach (var stale in new[]
                 {
                     "pet-share-card-v5",
                     "pet-birthday-card-v5",
                     "pet-adoption-card-v5",
                 })
        {
            Assert.DoesNotContain(stale, edge);
        }
    }

    private static string EdgeModulePath()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null
               && !File.Exists(Path.Combine(directory.FullName, "migration.sql")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        var path = Path.Combine(
            directory!.FullName,
            "apps", "web", "edge", "publicProfileEdge.ts");
        Assert.True(File.Exists(path), $"Edge module not found at {path}.");
        return path;
    }
}
