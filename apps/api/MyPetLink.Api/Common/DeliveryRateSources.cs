namespace MyPetLink.Api.Common;

/// <summary>
/// Where an effective delivery fee came from. These are display labels and
/// stored snapshot values, so they are code constants rather than settings.
/// </summary>
public static class DeliveryRateSources
{
    public const string ZoneDefault = "ZoneDefault";
    public const string StateOverride = "StateOverride";

    public const string ZoneDefaultLabel = "Zone default";
    public const string StateOverrideLabel = "State override";

    public static string LabelFor(string source) =>
        string.Equals(source, StateOverride, StringComparison.Ordinal)
            ? StateOverrideLabel
            : ZoneDefaultLabel;
}
