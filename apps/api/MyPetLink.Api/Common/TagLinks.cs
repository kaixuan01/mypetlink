namespace MyPetLink.Api.Common;

// Single source of truth for server-generated links to the Physical Tag Scan
// Page. The route shape (/t/{tagCode}) must stay in sync with the web app's
// central route map (apps/web/src/lib/routes.ts): the same URL is what QR
// codes encode, NFC chips store, and owners scan to activate a tag — it works
// both before and after the tag is claimed, and only ever carries the public
// tag code (never a database id).
public static class TagLinks
{
    public static string ScanPath(string tagCode)
    {
        // Escaping is a no-op for real tag codes (MPL-XXXX-XXXX) and keeps the
        // stored casing byte-for-byte; it only guards against malformed legacy
        // values breaking the URL.
        return $"/t/{Uri.EscapeDataString(tagCode.Trim())}";
    }

    // Absolute scan URL, or null when the configured base URL is missing or
    // not an absolute http(s) URL. Plain http is tolerated only for loopback
    // hosts so local development works; anything public must be https.
    public static string? ScanUrl(string? baseUrl, string tagCode)
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

        return $"{normalizedBase}{ScanPath(tagCode)}";
    }
}
