namespace MyPetLink.Api.Common;

/// <summary>
/// The single commission money rule for merchant orders. Commission applies
/// to merchandise after discounts; delivery, taxes and payment fees are not
/// inputs and therefore cannot accidentally become commissionable.
/// </summary>
public static class MerchantCommissionCalculator
{
    public static MerchantCommissionCalculation Calculate(
        decimal merchandiseSubtotal,
        decimal discountTotal,
        decimal commissionPercentage)
    {
        if (merchandiseSubtotal < 0m)
            throw new ArgumentOutOfRangeException(nameof(merchandiseSubtotal));
        if (discountTotal < 0m || discountTotal > merchandiseSubtotal)
            throw new ArgumentOutOfRangeException(nameof(discountTotal));
        if (commissionPercentage < 0m || commissionPercentage > 100m)
            throw new ArgumentOutOfRangeException(nameof(commissionPercentage));

        var baseAmount = MerchantSalesTotals.Round(merchandiseSubtotal - discountTotal);
        var amount = MerchantSalesTotals.Round(baseAmount * commissionPercentage / 100m);
        return new MerchantCommissionCalculation(baseAmount, amount);
    }
}

public readonly record struct MerchantCommissionCalculation(
    decimal BaseAmount,
    decimal Amount);
