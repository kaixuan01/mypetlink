using System.Text.RegularExpressions;

namespace MyPetLink.Api.Common;

public static partial class ReferralCodes
{
    public const int MinLength = 3;
    public const int MaxLength = 24;

    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "ADMIN", "API", "LOGIN", "WWW", "AUTH"
    };

    public static bool TryNormalize(string? value, out string normalized)
    {
        normalized = value?.Trim().ToUpperInvariant() ?? "";
        return CodePattern().IsMatch(normalized) && !Reserved.Contains(normalized);
    }

    [GeneratedRegex("^[A-Z0-9]{3,24}$", RegexOptions.CultureInvariant)]
    private static partial Regex CodePattern();
}
