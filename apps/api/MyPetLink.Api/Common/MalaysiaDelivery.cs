namespace MyPetLink.Api.Common;

public sealed record MalaysiaStateDefinition(
    string Code,
    string Name,
    string ZoneCode,
    string ZoneName,
    IReadOnlyCollection<string> Aliases);

public static class MalaysiaDelivery
{
    public const string CountryName = "Malaysia";
    public const string Currency = "MYR";
    public const string DefaultMethodName = "Standard Delivery";

    public static readonly IReadOnlyCollection<MalaysiaStateDefinition> States =
    [
        State("JHR", "Johor", "PEN", DeliveryLabels.WestMalaysia),
        State("KDH", "Kedah", "PEN", DeliveryLabels.WestMalaysia),
        State("KTN", "Kelantan", "PEN", DeliveryLabels.WestMalaysia),
        State("MLK", "Melaka", "PEN", DeliveryLabels.WestMalaysia, "Malacca"),
        State("NSN", "Negeri Sembilan", "PEN", DeliveryLabels.WestMalaysia),
        State("PHG", "Pahang", "PEN", DeliveryLabels.WestMalaysia),
        State("PRK", "Perak", "PEN", DeliveryLabels.WestMalaysia),
        State("PLS", "Perlis", "PEN", DeliveryLabels.WestMalaysia),
        State("PNG", "Pulau Pinang", "PEN", DeliveryLabels.WestMalaysia, "Penang"),
        State("SGR", "Selangor", "PEN", DeliveryLabels.WestMalaysia),
        State("TRG", "Terengganu", "PEN", DeliveryLabels.WestMalaysia),
        State("KUL", "Kuala Lumpur", "PEN", DeliveryLabels.WestMalaysia, "KL", "Kuala Lumpur W.P."),
        State("PJY", "Putrajaya", "PEN", DeliveryLabels.WestMalaysia),
        State("SBH", "Sabah", "SBH", "Sabah"),
        State("SWK", "Sarawak", "SWK", "Sarawak"),
        State("LBN", "Labuan", "LBN", "Labuan")
    ];

    public static readonly IReadOnlyDictionary<string, string> Zones =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["PEN"] = DeliveryLabels.WestMalaysia,
            ["SBH"] = "Sabah",
            ["SWK"] = "Sarawak",
            ["LBN"] = "Labuan"
        };

    public static MalaysiaStateDefinition? ResolveState(string? value)
    {
        var normalized = value?.Trim();
        if (string.IsNullOrEmpty(normalized)) return null;
        return States.SingleOrDefault(state =>
            state.Code.Equals(normalized, StringComparison.OrdinalIgnoreCase)
            || state.Name.Equals(normalized, StringComparison.OrdinalIgnoreCase)
            || state.Aliases.Any(alias => alias.Equals(normalized, StringComparison.OrdinalIgnoreCase)));
    }

    private static MalaysiaStateDefinition State(
        string code, string name, string zoneCode, string zoneName, params string[] aliases) =>
        new(code, name, zoneCode, zoneName, aliases);
}
