using System.Globalization;

namespace MyPetLink.Api.Common;

public static class PartnerNavigationUrls
{
    public static string? Normalize(string? value, bool waze)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (value.Length > 2048 || value.Any(char.IsControl)
            || !Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri)
            || uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort
            || !string.IsNullOrEmpty(uri.UserInfo)) throw Invalid(waze);

        var host = uri.IdnHost.ToLowerInvariant();
        var path = uri.AbsolutePath;
        // Exact hosts and Maps paths: never accept arbitrary google.com links,
        // redirect endpoints, credentials or suffix lookalikes.
        var supported = waze
            ? (host is "waze.com" or "www.waze.com" or "ul.waze.com")
                && (path == "/ul" || path.StartsWith("/ul/", StringComparison.Ordinal)
                    || path == "/live-map" || path.StartsWith("/live-map/", StringComparison.Ordinal))
            : ((host is "google.com" or "www.google.com" or "google.com.my" or "www.google.com.my")
                && (path == "/maps" || path.StartsWith("/maps/", StringComparison.Ordinal)))
                || ((host is "maps.google.com" or "maps.google.com.my") && (path == "/" || path == "/maps" || path.StartsWith("/maps/", StringComparison.Ordinal)))
                || (host == "maps.app.goo.gl" && path.Length > 1)
                || (host == "goo.gl" && path.StartsWith("/maps/", StringComparison.Ordinal));
        if (!supported) throw Invalid(waze);
        return uri.AbsoluteUri;
    }

    public static string Google(decimal latitude, decimal longitude) =>
        $"https://www.google.com/maps/dir/?api=1&destination={Point(latitude, longitude)}";
    public static string Waze(decimal latitude, decimal longitude) =>
        $"https://www.waze.com/ul?ll={Point(latitude, longitude)}&navigate=yes";
    private static string Point(decimal latitude, decimal longitude) =>
        latitude.ToString(CultureInfo.InvariantCulture) + "," + longitude.ToString(CultureInfo.InvariantCulture);
    private static ApiException Invalid(bool waze) => new(400, "validation_failed",
        "Enter a supported HTTPS navigation link.", new Dictionary<string, string[]>
        { [waze ? "wazeUrl" : "googleMapsUrl"] = ["Enter a supported HTTPS navigation link for this provider."] });
}
