using System.Text;

namespace MyPetLink.Api.Common;

/// <summary>
/// The merchant part of an automatic consignment agreement reference, as in
/// <c>ANKPETS-CONS-2026-001</c>. A prefix is chosen once per merchant and frozen
/// by its first agreement: renaming the merchant never renames a reference.
/// </summary>
public static class ConsignmentPrefixRules
{
    public const int MinLength = 2;
    public const int MaxLength = 12;

    // Words that describe the legal form rather than the business.
    private static readonly HashSet<string> LegalWords = new(StringComparer.Ordinal)
    {
        "SDN", "BHD", "BERHAD", "PLT", "LLP", "LTD", "LIMITED", "INC", "CO", "COMPANY", "ENTERPRISE", "ENTERPRISES",
    };

    /// <summary>Uppercase ASCII letters and digits only; everything else is dropped.</summary>
    public static string Normalize(string? value)
    {
        var builder = new StringBuilder();
        foreach (var ch in (value ?? "").ToUpperInvariant())
            if (ch is >= 'A' and <= 'Z' or >= '0' and <= '9') builder.Append(ch);
        return builder.ToString();
    }

    public static bool IsValid(string? prefix) =>
        prefix is { Length: >= MinLength and <= MaxLength } && Normalize(prefix) == prefix && prefix[0] is >= 'A' and <= 'Z';

    /// <summary>
    /// A readable starting point from the merchant's name: whole words up to the length
    /// limit, legal-form words left out. Uniqueness is the caller's job.
    /// </summary>
    public static string Suggest(string? tradingName, string? legalName)
    {
        var name = string.IsNullOrWhiteSpace(tradingName) ? legalName : tradingName;
        var words = (name ?? "").Split([' ', '-', '_', '.', ',', '&', '/', '(', ')', '\''], StringSplitOptions.RemoveEmptyEntries)
            .Select(Normalize).Where(w => w.Length > 0 && !LegalWords.Contains(w)).ToList();
        var builder = new StringBuilder();
        foreach (var word in words)
        {
            if (builder.Length + word.Length > MaxLength)
            {
                if (builder.Length == 0) builder.Append(word[..MaxLength]);
                break;
            }
            builder.Append(word);
        }
        var prefix = builder.ToString();
        if (prefix.Length > 0 && prefix[0] is >= '0' and <= '9') prefix = ("P" + prefix)[..Math.Min(MaxLength, prefix.Length + 1)];
        return prefix.Length >= MinLength ? prefix : "PARTNER";
    }

    /// <summary>The first of <paramref name="prefix"/>, PREFIX2, PREFIX3… that <paramref name="taken"/> does not hold.</summary>
    public static string FirstAvailable(string prefix, Func<string, bool> taken)
    {
        if (!taken(prefix)) return prefix;
        for (var n = 2; ; n++)
        {
            var suffix = n.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var candidate = prefix[..Math.Min(prefix.Length, MaxLength - suffix.Length)] + suffix;
            if (!taken(candidate)) return candidate;
        }
    }

    public const string Delimiter = "-CONS-";

    public static string Reference(string prefix, int year, long sequence) =>
        $"{prefix}{Delimiter}{year:0000}-{sequence:000}";

    /// <summary>
    /// The prefix an existing reference already claims, compared the way prefixes are stored:
    /// the delimiter in any letter case (references typed by hand before they were automatic,
    /// such as <c>legacy-cons-2025-001</c>), the stem reduced to uppercase letters and digits.
    /// Null when there is no usable stem; the reference itself is never changed.
    /// </summary>
    public static string? ReferenceStem(string? reference)
    {
        var at = reference?.IndexOf(Delimiter, StringComparison.OrdinalIgnoreCase) ?? -1;
        if (at <= 0) return null;
        var stem = Normalize(reference![..at]);
        return stem.Length == 0 ? null : stem;
    }
}
