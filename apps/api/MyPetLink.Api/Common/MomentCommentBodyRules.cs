using System.Globalization;
using System.Text;

namespace MyPetLink.Api.Common;

/// <summary>
/// The single plain-text contract for Moment comments.
///
/// <see cref="string.Length"/> counts UTF-16 code units, matching a browser
/// textarea's maxLength behavior. ZWJ is deliberately retained so composed
/// emoji remain intact; other invisible format controls are removed.
/// </summary>
public static class MomentCommentBodyRules
{
    public const int MaxLength = 500;

    private static readonly HashSet<char> BidiControls =
    [
        '\u202A', '\u202B', '\u202C', '\u202D', '\u202E',
        '\u2066', '\u2067', '\u2068', '\u2069'
    ];

    public static string Normalize(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return "";
        }

        var source = value.Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Replace('\t', ' ');
        var result = new StringBuilder(source.Length);

        foreach (var character in source)
        {
            if (character == '\n')
            {
                result.Append(character);
                continue;
            }

            if (character == '\u200D')
            {
                result.Append(character);
                continue;
            }

            var category = char.GetUnicodeCategory(character);
            if (char.IsControl(character)
                || category == UnicodeCategory.Format
                || BidiControls.Contains(character))
            {
                continue;
            }

            result.Append(character);
        }

        return result.ToString().Trim();
    }

    public static string RequireValid(string? value)
    {
        var normalized = Normalize(value);

        if (normalized.Length == 0 || !HasVisibleContent(normalized))
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "comment_body_required",
                "Write something before posting your comment.");
        }

        if (normalized.Length > MaxLength)
        {
            throw new ApiException(
                StatusCodes.Status422UnprocessableEntity,
                "comment_body_too_long",
                $"Comments can be up to {MaxLength} characters.");
        }

        return normalized;
    }

    private static bool HasVisibleContent(string value)
    {
        foreach (var rune in value.EnumerateRunes())
        {
            var category = Rune.GetUnicodeCategory(rune);
            if (!Rune.IsWhiteSpace(rune)
                && category is not UnicodeCategory.Format
                && category is not UnicodeCategory.Control
                && category is not UnicodeCategory.NonSpacingMark
                && category is not UnicodeCategory.EnclosingMark)
            {
                return true;
            }
        }

        return false;
    }
}
