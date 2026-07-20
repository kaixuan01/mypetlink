namespace MyPetLink.Api.Common;

// Tag variant classification. A Smart Tag order and its physical tag are
// described by a tag type (QR vs QR + NFC) and a variant label. The label set
// is Admin-configurable through Catalog Settings (TagVariantPreset); the two
// built-in values below exist because historical records used them as a fixed
// pair:
//   - Lightweight: recommended for cats and small pets.
//   - Standard: recommended for dogs and medium/large pets.
public static class TagVariants
{
    public const string Lightweight = "Lightweight";
    public const string Standard = "Standard";

    // Canonicalizes the two built-in values (any casing, plus blank/legacy
    // shape values like "Round" that predate variants, which default to
    // Standard-cased "Standard" only when empty). Any other non-empty value is
    // a configured variant preset name and is preserved as-is — collapsing it
    // would mislabel produced inventory.
    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return Standard;
        }

        var normalized = value.Trim();

        if (normalized.Equals(Lightweight, StringComparison.OrdinalIgnoreCase))
        {
            return Lightweight;
        }

        return normalized.Equals(Standard, StringComparison.OrdinalIgnoreCase)
            ? Standard
            : normalized;
    }
}
