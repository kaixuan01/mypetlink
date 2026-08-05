namespace MyPetLink.Api.Common;

/// <summary>
/// The one place merchant money is calculated.
///
/// Discounts are applied at exactly one level each: a line discount reduces its
/// own line, and the order discount reduces the merchandise subtotal. Nothing
/// is discounted twice, and no client-supplied subtotal or total is ever read.
///
/// Every amount is rounded to two decimals away from zero as it is produced, so
/// a total never disagrees with the lines a merchant can add up by hand.
/// </summary>
public static class MerchantSalesTotals
{
    public sealed record LineInput(int Quantity, decimal WholesaleUnitPrice, decimal LineDiscount);

    public sealed record LineResult(decimal GrossLineAmount, decimal LineSubtotal);

    public sealed record TotalsResult(
        decimal MerchandiseSubtotal,
        decimal DiscountTotal,
        decimal DeliveryFee,
        decimal GrandTotal);

    public static decimal Round(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);

    public static LineResult CalculateLine(LineInput line)
    {
        var gross = Round(line.WholesaleUnitPrice * line.Quantity);
        var subtotal = Round(gross - line.LineDiscount);
        return new LineResult(gross, subtotal);
    }

    public static TotalsResult Calculate(
        IEnumerable<LineInput> lines,
        decimal orderDiscount,
        decimal deliveryFee)
    {
        var merchandiseSubtotal = Round(
            lines.Sum(line => CalculateLine(line).LineSubtotal));

        var discount = Round(orderDiscount);
        var delivery = Round(deliveryFee);
        var grandTotal = Round(merchandiseSubtotal - discount + delivery);

        return new TotalsResult(merchandiseSubtotal, discount, delivery, grandTotal);
    }
}
