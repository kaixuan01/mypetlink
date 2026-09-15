using System.Text;
using System.Text.RegularExpressions;

namespace MyPetLink.Api.Common;

/// <summary>
/// The single authority for what a "general area" may contain, shared by every
/// surface that accepts one: a pet's area, a per-pet contact override, the
/// owner's default, and the owner's social area.
///
/// The field says roughly where a pet lives — "Bangsar, Kuala Lumpur" — so a
/// finder can tell whether they are near the right place, and so a visitor gets
/// a sense of where a pet is from. It is NOT an address. Nothing here derives a
/// location from a device, an IP address, or any other automatic source, and
/// nothing here stores coordinates.
///
/// <para><b>Numbers are normal in Malaysian area names.</b> SS2, USJ 9,
/// Section 17, Bandar Kinrara 5 and Taman Melawati 2 are all ordinary
/// neighbourhoods. Rejecting a value because it contains a digit would reject a
/// large share of the country, so the rules below never do that.</para>
///
/// <para>What is rejected is the small set of patterns that only appear in a
/// precise residential address: a unit or house number introduced by a keyword
/// ("No. 18", "Lot 5", "Unit A-12-3", "Blok B"), and the unit-number shape
/// itself ("A-12-3", "12-2"). This is deliberately not a postal-address
/// detector — it cannot be one, and trying would cost more false rejections than
/// it prevents. The real protections are the short length, the single line, and
/// clear helper text telling people what the field is for.</para>
/// </summary>
public static class GeneralAreaRules
{
    /// <summary>
    /// Comfortably holds "Taman Tun Dr Ismail, Kuala Lumpur"; too short for a
    /// full postal address. Previously 200, which held one easily.
    /// </summary>
    public const int MaxLength = 80;

    /// <summary>
    /// Keywords that introduce a unit or house number. Matched only when a
    /// number actually follows, so "Jalan Bangsar" and "Bandar Kinrara 5" are
    /// unaffected while "No. 18, Jalan Bangsar" is not.
    /// </summary>
    private static readonly string[] AddressNumberKeywords =
    [
        "no", "no.", "lot", "unit", "blok", "block", "apt", "apartment",
        "suite", "tingkat", "floor", "level"
    ];

    /// <summary>
    /// "No 18", "Lot 5", "Unit A-12-3", "Blok B" — a keyword followed by
    /// something containing a digit, or by a single letter then a digit group.
    /// </summary>
    private static readonly Regex KeywordThenNumber = new(
        @"\b(no|lot|unit|blok|block|apt|apartment|suite|tingkat|floor|level)\b\.?\s*[a-z]?[-\s]?\d",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// The Malaysian unit-number shape: "A-12-3", "12-2", "B-3-7". Requires at
    /// least two hyphen-joined numeric groups so ordinary hyphenated place
    /// names are untouched.
    /// </summary>
    private static readonly Regex UnitNumberPattern = new(
        @"\b[a-z]?\d{1,4}-\d{1,4}(-\d{1,4})?\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// A house number immediately before a street word: "12 Jalan ABC",
    /// "18 Lorong Kuching". A number AFTER the street word is a normal area name
    /// ("Jalan Bangsar 2", "USJ 9") and is deliberately not matched.
    /// </summary>
    private static readonly Regex NumberThenStreetWord = new(
        @"(^|,)\s*\d{1,5}[a-z]?\s+(jalan|jln|lorong|lrg|persiaran|lebuh|lebuhraya|street|st|road|rd|avenue|ave)\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// A street designation carrying a sub-numbered reference such as
    /// "Jalan Example 2/3" or "Jalan SS15/4A". The slash is what distinguishes a
    /// precise street reference from a neighbourhood name.
    /// </summary>
    private static readonly Regex StreetWithSlashedNumber = new(
        @"\b(jalan|jln|lorong|lrg|persiaran|lebuh)\b[^,]*?\d+\s*/\s*\d",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    /// <summary>
    /// Collapses whitespace, removes line breaks and control characters, and
    /// trims. Returns <c>null</c> for anything empty once cleaned, so an
    /// all-whitespace value is stored as "not set" rather than as blanks.
    /// </summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var builder = new StringBuilder(value.Length);
        var lastWasSpace = false;

        foreach (var character in value)
        {
            // Line breaks, tabs and other control characters become a single
            // space: a general area is one line, and a multi-line value is the
            // shape a pasted postal address arrives in.
            var normalized = char.IsControl(character) || char.IsWhiteSpace(character)
                ? ' '
                : character;

            if (normalized == ' ')
            {
                if (!lastWasSpace && builder.Length > 0)
                {
                    builder.Append(' ');
                }

                lastWasSpace = true;
                continue;
            }

            builder.Append(normalized);
            lastWasSpace = false;
        }

        var result = builder.ToString().Trim();
        return result.Length == 0 ? null : result;
    }

    /// <summary>
    /// Validation message for a normalized value, or <c>null</c> when it is
    /// acceptable. Call <see cref="Normalize"/> first.
    /// </summary>
    public static string? Validate(string? normalizedValue)
    {
        if (string.IsNullOrEmpty(normalizedValue))
        {
            return null;
        }

        if (normalizedValue.Length > MaxLength)
        {
            return $"Use a general area such as a neighbourhood and city, up to {MaxLength} characters.";
        }

        if (LooksLikePreciseAddress(normalizedValue))
        {
            return "Use a general area such as a neighbourhood and city, not a full street address.";
        }

        return null;
    }

    /// <summary>
    /// True when the value carries the shape of a precise residential address.
    ///
    /// Conservative on purpose: a number alone never triggers this, because
    /// numbered neighbourhoods are the norm here.
    /// </summary>
    public static bool LooksLikePreciseAddress(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return KeywordThenNumber.IsMatch(value)
            || UnitNumberPattern.IsMatch(value)
            || NumberThenStreetWord.IsMatch(value)
            || StreetWithSlashedNumber.IsMatch(value);
    }

    /// <summary>
    /// The keywords list, exposed so the frontend rule and its tests can be
    /// checked against the same source rather than a second hand-kept copy.
    /// </summary>
    public static IReadOnlyCollection<string> AddressKeywords => AddressNumberKeywords;
}
