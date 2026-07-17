using System.Text.RegularExpressions;

namespace MyPetLink.Api.Validation;

public static class PhoneNumberRules
{
    private static readonly Regex E164Pattern = new(@"^\+[1-9]\d{6,14}$", RegexOptions.Compiled);

    public static bool IsUsableE164(string? value)
        => !string.IsNullOrWhiteSpace(value) && E164Pattern.IsMatch(value.Trim());

    public static string? NormalizeSupportSearch(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        var digits = string.Concat(trimmed.Where(char.IsDigit));
        if (digits.Length < 5) return null;
        if (trimmed.StartsWith("+", StringComparison.Ordinal)) return $"+{digits}";
        if (digits.StartsWith("60", StringComparison.Ordinal)) return $"+{digits}";
        if (digits.StartsWith("0", StringComparison.Ordinal)) return $"+60{digits[1..]}";
        return digits;
    }
}
