namespace MyPetLink.Api.Common;

// Single source of truth for server-generated physical-tag entry links.
// New QR payloads use /q, NFC payloads use /n, and /t remains a permanent
// compatibility route for already-manufactured tags.
public static class TagLinks
{
    public static string QrPath(string tagCode) => BuildPath("q", tagCode);
    public static string NfcPath(string tagCode) => BuildPath("n", tagCode);
    public static string LegacyPath(string tagCode) => BuildPath("t", tagCode);

    // Compatibility aliases for existing callers and printed-tag tests.
    public static string ScanPath(string tagCode) => LegacyPath(tagCode);
    public static string? ScanUrl(string? baseUrl, string tagCode) =>
        LegacyUrl(baseUrl, tagCode);

    public static string? QrUrl(string? baseUrl, string tagCode) =>
        BuildUrl(baseUrl, QrPath(tagCode));
    public static string? NfcUrl(string? baseUrl, string tagCode) =>
        BuildUrl(baseUrl, NfcPath(tagCode));
    public static string? LegacyUrl(string? baseUrl, string tagCode) =>
        BuildUrl(baseUrl, LegacyPath(tagCode));

    private static string BuildPath(string route, string tagCode)
    {
        return $"/{route}/{Uri.EscapeDataString(tagCode.Trim())}";
    }

    // Plain HTTP is tolerated only for loopback development hosts. Public
    // manufacturing payloads must always use HTTPS.
    private static string? BuildUrl(string? baseUrl, string path)
    {
        var normalizedBase = baseUrl?.Trim().TrimEnd('/');

        if (string.IsNullOrEmpty(normalizedBase)
            || !Uri.TryCreate(normalizedBase, UriKind.Absolute, out var parsed))
        {
            return null;
        }

        var isHttps = parsed.Scheme == Uri.UriSchemeHttps;
        var isLocalHttp = parsed.Scheme == Uri.UriSchemeHttp && parsed.IsLoopback;

        if (!isHttps && !isLocalHttp)
        {
            return null;
        }

        return $"{normalizedBase}{path}";
    }
}
