namespace MyPetLink.Api.Common;

// Domain safeguards, not runtime pricing configuration. These bounds keep a
// manual-fulfilment order operationally realistic and prevent integer/money
// overflow while still supporting family and multi-pet purchases.
public static class TagOrderLimits
{
    public const int MaxQuantityPerLine = 10;
    public const int MaxLinesPerOrder = 20;
    public const int MaxUnitsPerOrder = 20;
}
