namespace MyPetLink.Api.Common;

/// <summary>
/// Canonical delivery wording.
///
/// "Peninsular" is a geographer's word: accurate, but not what most Malaysian
/// customers call the region. Customers see "West Malaysia"; operators keep the
/// fuller "Peninsular Malaysia (West Malaysia)" so the two vocabularies stay
/// connected. Zone codes (PEN/SBH/SWK/LBN) are untouched — this is wording only.
///
/// Everything here is presentation. An order's stored delivery method and fee
/// remain exactly as they were snapshotted; a legacy label is only re-worded on
/// its way to the screen, never rewritten in the database.
/// </summary>
public static class DeliveryLabels
{
    /// <summary>Customer-facing region wording.</summary>
    public const string WestMalaysia = "West Malaysia";

    /// <summary>Operator-facing region wording, keeping both names visible.</summary>
    public const string WestMalaysiaAdmin = "Peninsular Malaysia (West Malaysia)";

    private const string Dash = "—";

    private static readonly IReadOnlyDictionary<string, string> CustomerRegions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["PEN"] = WestMalaysia,
            ["SBH"] = "Sabah",
            ["SWK"] = "Sarawak",
            ["LBN"] = "Labuan"
        };

    private static readonly IReadOnlyDictionary<string, string> AdminRegions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["PEN"] = WestMalaysiaAdmin,
            ["SBH"] = "Sabah",
            ["SWK"] = "Sarawak",
            ["LBN"] = "Labuan"
        };

    /// <summary>
    /// Labels MyPetLink itself has shipped for these zones. Only these are
    /// re-worded; anything an administrator typed is left exactly as entered.
    /// </summary>
    private static readonly IReadOnlyDictionary<string, string> LegacyMethodNames =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Peninsular Standard Delivery"] = "PEN",
            ["Peninsular Malaysia Standard Delivery"] = "PEN",
            ["Peninsular Malaysia Delivery"] = "PEN",
            ["Standard Delivery - Peninsular Malaysia"] = "PEN",
            ["Standard Delivery — Peninsular Malaysia"] = "PEN",
            ["Standard Delivery - Peninsular"] = "PEN",
            ["Standard Delivery — Peninsular"] = "PEN",
            ["Sabah Standard Delivery"] = "SBH",
            ["Standard Delivery - Sabah"] = "SBH",
            ["Sarawak Standard Delivery"] = "SWK",
            ["Standard Delivery - Sarawak"] = "SWK",
            ["Labuan Standard Delivery"] = "LBN",
            ["Standard Delivery - Labuan"] = "LBN"
        };

    private static readonly IReadOnlyDictionary<string, string> LegacyRegionNames =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["Peninsular"] = WestMalaysia,
            ["Peninsular Malaysia"] = WestMalaysia
        };

    /// <summary>
    /// Accepts a zone code, a zone name, or a state code, so callers can pass
    /// whatever an order happens to have stored without a lookup of their own.
    /// </summary>
    public static string ResolveZoneCode(string? value)
    {
        var trimmed = (value ?? "").Trim();
        if (trimmed.Length == 0) return "";
        if (CustomerRegions.ContainsKey(trimmed)) return trimmed.ToUpperInvariant();

        foreach (var (code, region) in CustomerRegions)
        {
            if (region.Equals(trimmed, StringComparison.OrdinalIgnoreCase)) return code;
        }

        if (LegacyRegionNames.ContainsKey(trimmed)) return "PEN";

        return MalaysiaDelivery.ResolveState(trimmed)?.ZoneCode ?? "";
    }

    /// <summary>The delivery method a customer should see for a zone.</summary>
    public static string CustomerMethodFor(string? zoneCode) =>
        CustomerRegions.TryGetValue(ResolveZoneCode(zoneCode), out var region)
            ? $"{MalaysiaDelivery.DefaultMethodName} {Dash} {region}"
            : MalaysiaDelivery.DefaultMethodName;

    /// <summary>Region wording for customers.</summary>
    public static string CustomerRegionFor(string? zoneCode) =>
        CustomerRegions.TryGetValue(ResolveZoneCode(zoneCode), out var region) ? region : "";

    /// <summary>Region wording for the Admin Portal and operational screens.</summary>
    public static string AdminRegionFor(string? zoneCode) =>
        AdminRegions.TryGetValue(ResolveZoneCode(zoneCode), out var region) ? region : "";

    /// <summary>
    /// Re-words a stored delivery method for display.
    ///
    /// A blank or MyPetLink-issued label becomes the canonical wording. A label
    /// an administrator chose is returned untouched, because renaming someone
    /// else's configuration is not this method's business.
    /// </summary>
    public static string NormalizeCustomerMethod(string? storedName, string? zoneCode = null)
    {
        var trimmed = (storedName ?? "").Trim();

        if (trimmed.Length == 0)
        {
            return CustomerMethodFor(zoneCode);
        }

        if (LegacyMethodNames.TryGetValue(trimmed, out var legacyZone))
        {
            return CustomerMethodFor(legacyZone);
        }

        // Already canonical, or an administrator's own wording.
        return trimmed;
    }

    /// <summary>Re-words a stored zone name for display, on the same terms.</summary>
    public static string NormalizeCustomerRegion(string? storedZoneName, string? zoneCode = null)
    {
        var trimmed = (storedZoneName ?? "").Trim();

        if (trimmed.Length == 0)
        {
            return CustomerRegionFor(zoneCode);
        }

        return LegacyRegionNames.TryGetValue(trimmed, out var canonical) ? canonical : trimmed;
    }

    /// <summary>
    /// Same wording for places that cannot carry an en dash safely, such as a
    /// CSV opened in a spreadsheet with the wrong encoding.
    /// </summary>
    public static string ToPlainText(string label) =>
        (label ?? "").Replace(Dash, "-");
}
