namespace MyPetLink.Api.Common;

/// <summary>
/// Calculates once over total net product revenue. Shipping and payment fees
/// are intentionally not inputs, and line amounts must already include their
/// authoritative discounts.
/// </summary>
public static class DirectRetailCommissionCalculator
{
    public static DirectRetailCommissionCalculation Calculate(
        IEnumerable<decimal> finalLineAmounts,
        decimal percentage)
    {
        if (finalLineAmounts is null) throw new ArgumentNullException(nameof(finalLineAmounts));
        if (percentage < 0m || percentage > 100m)
            throw new ArgumentOutOfRangeException(nameof(percentage));

        var values = finalLineAmounts.ToArray();
        if (values.Any(value => value < 0m))
            throw new ArgumentOutOfRangeException(nameof(finalLineAmounts));

        var baseAmount = Round(values.Sum());
        var amount = Round(baseAmount * percentage / 100m);
        return new DirectRetailCommissionCalculation(baseAmount, amount);
    }

    private static decimal Round(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}

public readonly record struct DirectRetailCommissionCalculation(
    decimal BaseAmount,
    decimal Amount);
