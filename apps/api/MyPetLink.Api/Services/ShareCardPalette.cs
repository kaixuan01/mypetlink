using SkiaSharp;

namespace MyPetLink.Api.Services;

/// <summary>
/// Bounded palette for the portrait Share Card, chosen by the pet's Public
/// Profile theme.
///
/// There is one canonical Share Card layout. A theme only swaps colours from
/// this allowlist — never arbitrary owner-supplied values, and never a
/// different template. Anything a finder or reader must be able to read stays
/// out of the palette entirely: the brand lockup, the dark primary text, and
/// the QR modules are fixed so a theme can never make a card unscannable or
/// illegible.
/// </summary>
public sealed record ShareCardPalette(
    SKColor Background,
    SKColor BlobPrimary,
    SKColor BlobSecondary,
    SKColor HeroFrame,
    SKColor AvatarRing,
    SKColor SupportingText,
    SKColor TaglineFill,
    SKColor TaglineText,
    SKColor QrSurround)
{
    /// <summary>Text and marks that must not follow a theme.</summary>
    public static readonly SKColor PrimaryText = SKColor.Parse("#102247");

    public static readonly SKColor QrModule = SKColor.Parse("#0D1B3D");

    /// <summary>The palette used for an unknown, missing, or retired theme.</summary>
    public static ShareCardPalette Default { get; } = new(
        Background: SKColor.Parse("#FFF8E8"),
        BlobPrimary: SKColor.Parse("#CCEFE4").WithAlpha(190),
        BlobSecondary: SKColor.Parse("#D7E8FF").WithAlpha(200),
        HeroFrame: SKColor.Parse("#FFFFFF"),
        AvatarRing: SKColor.Parse("#1570EF").WithAlpha(70),
        SupportingText: SKColor.Parse("#53627F"),
        TaglineFill: SKColor.Parse("#E8F3FF"),
        TaglineText: SKColor.Parse("#1B4FA8"),
        QrSurround: SKColor.Parse("#E8F3FF").WithAlpha(150));

    private static readonly IReadOnlyDictionary<string, ShareCardPalette> Palettes =
        new Dictionary<string, ShareCardPalette>(StringComparer.OrdinalIgnoreCase)
        {
            ["default"] = Default,
            ["mint"] = new(
                Background: SKColor.Parse("#F3FCF6"),
                BlobPrimary: SKColor.Parse("#C8F1DC").WithAlpha(200),
                BlobSecondary: SKColor.Parse("#DFF7EA").WithAlpha(210),
                HeroFrame: SKColor.Parse("#FFFFFF"),
                AvatarRing: SKColor.Parse("#2F8F63").WithAlpha(80),
                SupportingText: SKColor.Parse("#3F6B57"),
                TaglineFill: SKColor.Parse("#DFF7EA"),
                TaglineText: SKColor.Parse("#215C42"),
                QrSurround: SKColor.Parse("#DFF7EA").WithAlpha(160)),
            ["peach"] = new(
                Background: SKColor.Parse("#FFF6EF"),
                BlobPrimary: SKColor.Parse("#FFD7C2").WithAlpha(200),
                BlobSecondary: SKColor.Parse("#FFE4DA").WithAlpha(210),
                HeroFrame: SKColor.Parse("#FFFFFF"),
                AvatarRing: SKColor.Parse("#C75D48").WithAlpha(80),
                SupportingText: SKColor.Parse("#7A5245"),
                TaglineFill: SKColor.Parse("#FFE4DA"),
                TaglineText: SKColor.Parse("#9A4231"),
                QrSurround: SKColor.Parse("#FFE4DA").WithAlpha(160)),
            ["sky"] = new(
                Background: SKColor.Parse("#F4FAFF"),
                BlobPrimary: SKColor.Parse("#BDE4FF").WithAlpha(200),
                BlobSecondary: SKColor.Parse("#DCECFF").WithAlpha(210),
                HeroFrame: SKColor.Parse("#FFFFFF"),
                AvatarRing: SKColor.Parse("#1570EF").WithAlpha(80),
                SupportingText: SKColor.Parse("#3F5C7D"),
                TaglineFill: SKColor.Parse("#DCECFF"),
                TaglineText: SKColor.Parse("#12508F"),
                QrSurround: SKColor.Parse("#DCECFF").WithAlpha(160)),
            ["lavender"] = new(
                Background: SKColor.Parse("#FBF8FF"),
                BlobPrimary: SKColor.Parse("#DED2FF").WithAlpha(200),
                BlobSecondary: SKColor.Parse("#EDE7FF").WithAlpha(210),
                HeroFrame: SKColor.Parse("#FFFFFF"),
                AvatarRing: SKColor.Parse("#7357C6").WithAlpha(80),
                SupportingText: SKColor.Parse("#5C4E7A"),
                TaglineFill: SKColor.Parse("#EDE7FF"),
                TaglineText: SKColor.Parse("#503B94"),
                QrSurround: SKColor.Parse("#EDE7FF").WithAlpha(160)),
        };

    /// <summary>Every theme key this renderer recognises.</summary>
    public static IReadOnlyCollection<string> KnownThemes => (IReadOnlyCollection<string>)Palettes.Keys;

    /// <summary>
    /// Resolves a palette for a theme key. Anything unrecognised falls back to
    /// the MyPetLink default rather than failing the render, so a theme retired
    /// in the future cannot break existing cards.
    /// </summary>
    public static ShareCardPalette Resolve(string? theme)
        => theme is not null && Palettes.TryGetValue(theme.Trim(), out var palette)
            ? palette
            : Default;
}
