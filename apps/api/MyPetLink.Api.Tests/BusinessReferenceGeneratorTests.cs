using MyPetLink.Api.Common;

namespace MyPetLink.Api.Tests;

public sealed class BusinessReferenceGeneratorTests
{
    [Fact]
    public void CreatesAllReferenceTypesFromTheEventTimeInMalaysia()
    {
        var generator = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(1234, 2345, 3456));
        var eventAtUtc = DateTimeOffset.Parse("2026-07-27T16:00:00Z");

        Assert.Equal("MPL-ORD-260728000000-1234", generator.CreateOrderNumber(eventAtUtc));
        Assert.Equal("MPL-RCP-260728000000-2345", generator.CreateReceiptNumber(eventAtUtc));
        Assert.Equal("MPL-BAT-260728000000-3456", generator.CreateBatchNumber(eventAtUtc));
    }

    [Fact]
    public void SameSecondUsesTheFourDigitSuffixForUniqueness()
    {
        var generator = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(1000, 9999));
        var eventAtUtc = DateTimeOffset.Parse("2026-07-27T07:08:09Z");

        Assert.Equal("MPL-ORD-260727150809-1000", generator.CreateOrderNumber(eventAtUtc));
        Assert.Equal("MPL-ORD-260727150809-9999", generator.CreateOrderNumber(eventAtUtc));
    }

    [Fact]
    public void RejectsMissingNonUtcAndInvalidSuffixInputs()
    {
        var generator = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(1234));

        Assert.Throws<ArgumentOutOfRangeException>(() => generator.CreateOrderNumber(default));
        Assert.Throws<ArgumentException>(() =>
            generator.CreateReceiptNumber(DateTimeOffset.Parse("2026-07-27T15:00:00+08:00")));

        var invalidSuffix = new BusinessReferenceGenerator(
            new SequenceBusinessReferenceSuffixSource(42));
        Assert.Throws<InvalidOperationException>(() =>
            invalidSuffix.CreateBatchNumber(DateTimeOffset.Parse("2026-07-27T07:00:00Z")));
    }
}

internal sealed class SequenceBusinessReferenceSuffixSource(
    params int[] values) : IBusinessReferenceSuffixSource
{
    private readonly int[] _values = values.Length == 0 ? [1000] : values;
    private int _index;

    public int NextFourDigitSuffix()
    {
        var index = Math.Min(Interlocked.Increment(ref _index) - 1, _values.Length - 1);
        return _values[index];
    }
}

internal sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => utcNow;
}
