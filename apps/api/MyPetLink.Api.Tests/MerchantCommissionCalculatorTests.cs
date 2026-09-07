using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

public sealed class MerchantCommissionCalculatorTests
{
    [Fact]
    public void UsesDiscountedMerchandiseAndExcludesNonInputs()
    {
        var result = MerchantCommissionCalculator.Calculate(1250m, 200m, 5m);

        Assert.Equal(1050m, result.BaseAmount);
        Assert.Equal(52.50m, result.Amount);
    }

    [Fact]
    public void RoundsHalfCentsAwayFromZeroUsingTheSalesMoneyConvention()
    {
        var result = MerchantCommissionCalculator.Calculate(10.01m, 0m, 2.5m);

        Assert.Equal(0.25m, result.Amount);
    }

    [Theory]
    [InlineData(-1, 0, 5)]
    [InlineData(10, -1, 5)]
    [InlineData(10, 11, 5)]
    [InlineData(10, 0, -1)]
    [InlineData(10, 0, 101)]
    public void RejectsInvalidFinancialInputs(decimal subtotal, decimal discount, decimal percentage)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            MerchantCommissionCalculator.Calculate(subtotal, discount, percentage));
    }
}
