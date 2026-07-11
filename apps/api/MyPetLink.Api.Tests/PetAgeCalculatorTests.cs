using MyPetLink.Api.DTOs;
using MyPetLink.Api.Services;

namespace MyPetLink.Api.Tests;

public sealed class PetAgeCalculatorTests
{
    private static readonly DateOnly ReferenceDate = new(2026, 7, 11);

    [Fact]
    public void Calculate_WhenBirthdayAndEstimatedYearExist_BirthdayWins()
    {
        var result = PetAgeCalculator.Calculate(new DateOnly(2020, 1, 1), 2022, ReferenceDate);

        Assert.Equal(PetAgeSource.ExactBirthday, result.Source);
        Assert.Equal(6, result.AgeInYears);
        Assert.Equal("6 years old", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_BeforeBirthdayThisYear_SubtractsOneYear()
    {
        var result = PetAgeCalculator.Calculate(new DateOnly(2020, 12, 1), null, ReferenceDate);

        Assert.Equal(5, result.AgeInYears);
        Assert.Equal("5 years old", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_AfterBirthdayThisYear_UsesFullYearDifference()
    {
        var result = PetAgeCalculator.Calculate(new DateOnly(2020, 2, 1), null, ReferenceDate);

        Assert.Equal(6, result.AgeInYears);
        Assert.Equal("6 years old", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_ForBirthdayWithinLastYear_ReturnsUnderOneYear()
    {
        var result = PetAgeCalculator.Calculate(new DateOnly(2026, 1, 1), null, ReferenceDate);

        Assert.Equal(PetAgeSource.ExactBirthday, result.Source);
        Assert.Equal(0, result.AgeInYears);
        Assert.Equal("Under 1 year old", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_ForEstimatedBirthYear_ReturnsApproximateAge()
    {
        var result = PetAgeCalculator.Calculate(null, 2022, ReferenceDate);

        Assert.Equal(PetAgeSource.EstimatedBirthYear, result.Source);
        Assert.Equal(4, result.AgeInYears);
        Assert.Equal("About 4 years old", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_ForCurrentEstimatedBirthYear_ReturnsUnderOneYear()
    {
        var result = PetAgeCalculator.Calculate(null, 2026, ReferenceDate);

        Assert.Equal(PetAgeSource.EstimatedBirthYear, result.Source);
        Assert.Equal(0, result.AgeInYears);
        Assert.Equal("Under 1 year old", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_WithoutBirthdayOrEstimatedYear_ReturnsUnknown()
    {
        var result = PetAgeCalculator.Calculate(null, null, ReferenceDate);

        Assert.Equal(PetAgeSource.Unknown, result.Source);
        Assert.Null(result.AgeInYears);
        Assert.Equal("Age unknown", result.DisplayLabel);
    }

    [Fact]
    public void Calculate_WithFutureBirthday_DoesNotReturnAnExactAge()
    {
        var result = PetAgeCalculator.Calculate(new DateOnly(2027, 1, 1), null, ReferenceDate);

        Assert.Equal(PetAgeSource.Unknown, result.Source);
        Assert.Equal("Age unknown", result.DisplayLabel);
    }
}
