using System.Security.Cryptography;

namespace MyPetLink.Api.Common;

public interface IBusinessReferenceGenerator
{
    string CreateOrderNumber(DateTimeOffset createdAtUtc);
    string CreateReceiptNumber(DateTimeOffset paymentConfirmedAtUtc);
    string CreateBatchNumber(DateTimeOffset generatedAtUtc);
}

public interface IBusinessReferenceSuffixSource
{
    int NextFourDigitSuffix();
}

public sealed class CryptographicBusinessReferenceSuffixSource : IBusinessReferenceSuffixSource
{
    public int NextFourDigitSuffix() => RandomNumberGenerator.GetInt32(1000, 10_000);
}

public sealed class BusinessReferenceGenerator : IBusinessReferenceGenerator
{
    private static readonly TimeSpan MalaysiaOffset = TimeSpan.FromHours(8);
    private readonly IBusinessReferenceSuffixSource _suffixSource;

    public BusinessReferenceGenerator(IBusinessReferenceSuffixSource suffixSource)
    {
        _suffixSource = suffixSource;
    }

    public string CreateOrderNumber(DateTimeOffset createdAtUtc) =>
        Create("ORD", createdAtUtc, nameof(createdAtUtc));

    public string CreateReceiptNumber(DateTimeOffset paymentConfirmedAtUtc) =>
        Create("RCP", paymentConfirmedAtUtc, nameof(paymentConfirmedAtUtc));

    public string CreateBatchNumber(DateTimeOffset generatedAtUtc) =>
        Create("BAT", generatedAtUtc, nameof(generatedAtUtc));

    private string Create(string type, DateTimeOffset eventAtUtc, string parameterName)
    {
        if (eventAtUtc == default)
        {
            throw new ArgumentOutOfRangeException(
                parameterName,
                "A real event timestamp is required to create a business reference.");
        }

        if (eventAtUtc.Offset != TimeSpan.Zero)
        {
            throw new ArgumentException(
                "Business-reference timestamps must be supplied in UTC.",
                parameterName);
        }

        var suffix = _suffixSource.NextFourDigitSuffix();
        if (suffix is < 1000 or > 9999)
        {
            throw new InvalidOperationException(
                "The business-reference suffix source returned a value outside the four-digit range.");
        }

        var malaysiaTime = eventAtUtc.ToOffset(MalaysiaOffset);
        return $"MPL-{type}-{malaysiaTime:yyMMddHHmmss}-{suffix:0000}";
    }
}
