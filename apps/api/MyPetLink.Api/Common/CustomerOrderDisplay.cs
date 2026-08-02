namespace MyPetLink.Api.Common;

public static class CustomerOrderDisplay
{
    public static string Product(string? productName, string? optionName)
    {
        var product = Clean(productName) ?? "MyPetLink Pet Tag";
        var option = Clean(optionName);
        if (option is null)
        {
            return product;
        }

        option = option.EndsWith(" Tag", StringComparison.OrdinalIgnoreCase)
            ? option[..^4].TrimEnd()
            : option;
        return product.Contains(option, StringComparison.OrdinalIgnoreCase)
            ? product
            : $"{product} · {option}";
    }

    public static string StateAndZone(string? state, string? zone)
    {
        var stateLabel = Clean(state) ?? string.Empty;
        var zoneLabel = Clean(zone);
        return zoneLabel is null || stateLabel.Equals(zoneLabel, StringComparison.OrdinalIgnoreCase)
            ? stateLabel
            : $"{stateLabel} · {zoneLabel}";
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
