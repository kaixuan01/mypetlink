namespace MyPetLink.Api.Common;

public static class NamedEnumValues
{
    public static bool TryParseDefined<TEnum>(string? value, out TEnum parsed)
        where TEnum : struct, Enum
    {
        parsed = default;
        var normalized = value?.Trim();

        if (string.IsNullOrWhiteSpace(normalized)
            || IsNumeric(normalized)
            || !Enum.TryParse(normalized, ignoreCase: true, out parsed)
            || !Enum.IsDefined(typeof(TEnum), parsed))
        {
            parsed = default;
            return false;
        }

        return true;
    }

    public static TEnum ParseOrUnknown<TEnum>(string? value, TEnum unknown)
        where TEnum : struct, Enum =>
        TryParseDefined<TEnum>(value, out var parsed) ? parsed : unknown;

    private static bool IsNumeric(string value) =>
        value.Length > 0
        && (char.IsDigit(value[0]) || value[0] is '+' or '-');
}
