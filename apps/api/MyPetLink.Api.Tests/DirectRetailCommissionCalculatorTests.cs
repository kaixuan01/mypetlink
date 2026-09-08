using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

public sealed class DirectRetailCommissionCalculatorTests
{
    [Fact]
    public void OneTag_RoundsHalfCentAwayFromZero()
    {
        var result = DirectRetailCommissionCalculator.Calculate([29.90m], 15m);

        Assert.Equal(29.90m, result.BaseAmount);
        Assert.Equal(4.49m, result.Amount);
    }

    [Fact]
    public void ThreeTags_RoundsOnceOverTheOrderTotal()
    {
        var result = DirectRetailCommissionCalculator.Calculate(
            [29.90m, 29.90m, 29.90m], 15m);

        Assert.Equal(89.70m, result.BaseAmount);
        Assert.Equal(13.46m, result.Amount);
        Assert.NotEqual(13.47m, result.Amount);
    }

    [Fact]
    public void RejectsInvalidInputs()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            DirectRetailCommissionCalculator.Calculate([-0.01m], 15m));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            DirectRetailCommissionCalculator.Calculate([10m], 100.01m));
    }
}
