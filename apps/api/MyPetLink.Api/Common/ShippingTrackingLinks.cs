namespace MyPetLink.Api.Common;

public static class ShippingTrackingLinks
{
    public const string Placeholder = "{trackingNumber}";

    public static bool IsValidTemplate(string? template)
    {
        if (string.IsNullOrWhiteSpace(template))
        {
            return true;
        }

        var trimmed = template.Trim();
        if (CountOccurrences(trimmed, Placeholder) != 1)
        {
            return false;
        }

        var withoutPlaceholder = trimmed.Replace(Placeholder, "", StringComparison.Ordinal);
        if (withoutPlaceholder.Contains('{') || withoutPlaceholder.Contains('}'))
        {
            return false;
        }

        return TryCreateHttpsUri(
            trimmed.Replace(Placeholder, "MPLTEST123", StringComparison.Ordinal),
            out _);
    }

    public static string? Build(string? template, string? trackingNumber)
    {
        if (!IsValidTemplate(template) || string.IsNullOrWhiteSpace(trackingNumber))
        {
            return null;
        }

        var encoded = Uri.EscapeDataString(trackingNumber.Trim());
        var candidate = template!.Trim().Replace(Placeholder, encoded, StringComparison.Ordinal);
        return TryCreateHttpsUri(candidate, out var uri) ? uri.AbsoluteUri : null;
    }

    private static bool TryCreateHttpsUri(string value, out Uri uri)
    {
        if (Uri.TryCreate(value, UriKind.Absolute, out var parsed)
            && string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(parsed.Host)
            && string.IsNullOrEmpty(parsed.UserInfo))
        {
            uri = parsed;
            return true;
        }

        uri = null!;
        return false;
    }

    private static int CountOccurrences(string value, string needle)
    {
        var count = 0;
        var index = 0;
        while ((index = value.IndexOf(needle, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += needle.Length;
        }

        return count;
    }
}
