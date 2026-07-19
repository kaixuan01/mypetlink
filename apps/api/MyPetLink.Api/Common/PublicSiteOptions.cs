namespace MyPetLink.Api.Common;

// Canonical public web app base URL (for example "https://mypetlink.pages.dev"
// or the custom domain). Bound from the "PublicSite" configuration section.
//
// This is the base for links to PUBLIC PAGES of the web app — distinct from
// CloudflareR2Options.PublicBaseUrl, which is the media CDN. The server needs
// it whenever it must emit an absolute public link, currently the manufacturer
// production export that encodes the Physical Tag Scan link (/t/{tagCode})
// into QR and NFC content. Set PublicSite__BaseUrl per environment; it is
// intentionally empty by default so a misconfigured environment fails loudly
// instead of printing tags that point at the wrong host.
public sealed class PublicSiteOptions
{
    public const string SectionName = "PublicSite";

    public string BaseUrl { get; init; } = "";
}
