using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

public sealed class ReferralCodesTests
{
    [Theory]
    [InlineData("amanda", "AMANDA")]
    [InlineData(" A12 ", "A12")]
    [InlineData("ABC123", "ABC123")]
    public void NormalizesAllowedCodes(string input, string expected)
    {
        Assert.True(ReferralCodes.TryNormalize(input, out var actual));
        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData("AB")]
    [InlineData("A-B")]
    [InlineData("ADMIN")]
    [InlineData("api")]
    [InlineData("LOGIN")]
    [InlineData("WWW")]
    [InlineData("AUTH")]
    public void RejectsMalformedAndReservedCodes(string input)
    {
        Assert.False(ReferralCodes.TryNormalize(input, out _));
    }
}
