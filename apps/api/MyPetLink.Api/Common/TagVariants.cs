namespace MyPetLink.Api.Common;

// Tag variant (formerly the physical shape option). A Smart Tag order and its
// physical tag are described by a tag type (QR vs QR + NFC) and a tag variant
// (weight/feel). Only two variants exist:
//   - Lightweight: recommended for cats and small pets.
//   - Standard: recommended for dogs and medium/large pets.
public static class TagVariants
{
    public const string Lightweight = "Lightweight";
    public const string Standard = "Standard";

    // Maps user/legacy input to a known variant. Anything unrecognised
    // (including old shape values like "Round"/"Circle") becomes Standard so
    // existing local/dev records keep working and pages never crash.
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Standard;
        }

        var normalized = value.Trim();

        return normalized.Equals(Lightweight, StringComparison.OrdinalIgnoreCase)
            ? Lightweight
            : Standard;
    }
}
