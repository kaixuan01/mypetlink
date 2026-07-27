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
        State("JHR", "Johor", "PEN", "Peninsular"),
        State("KDH", "Kedah", "PEN", "Peninsular"),
        State("KTN", "Kelantan", "PEN", "Peninsular"),
        State("MLK", "Melaka", "PEN", "Peninsular", "Malacca"),
        State("NSN", "Negeri Sembilan", "PEN", "Peninsular"),
        State("PHG", "Pahang", "PEN", "Peninsular"),
        State("PRK", "Perak", "PEN", "Peninsular"),
        State("PLS", "Perlis", "PEN", "Peninsular"),
        State("PNG", "Pulau Pinang", "PEN", "Peninsular", "Penang"),
        State("SGR", "Selangor", "PEN", "Peninsular"),
        State("TRG", "Terengganu", "PEN", "Peninsular"),
        State("KUL", "Kuala Lumpur", "PEN", "Peninsular", "KL", "Kuala Lumpur W.P."),
        State("PJY", "Putrajaya", "PEN", "Peninsular"),
        State("SBH", "Sabah", "SBH", "Sabah"),
        State("SWK", "Sarawak", "SWK", "Sarawak"),
        State("LBN", "Labuan", "LBN", "Labuan")
    ];

    public static readonly IReadOnlyDictionary<string, string> Zones =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["PEN"] = "Peninsular",
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
