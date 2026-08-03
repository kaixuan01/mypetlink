using Microsoft.Extensions.Options;

namespace MyPetLink.Api.Common;

/// <summary>
/// Worker tuning for the unpaid-reservation expiry sweep. Governance category
/// B (infrastructure / worker tuning) — deployment owns how often the sweep
/// runs and how large a batch is. The business payment window itself is a
/// database setting owned by Admin, not an App Setting.
/// </summary>
public sealed class OrderReservationOptions
{
    public const string SectionName = "OrderReservation";

    /// <summary>Allows an environment to disable the sweep entirely.</summary>
    public bool ExpiryEnabled { get; set; } = true;

    public int PollIntervalSeconds { get; set; } = 60;

    public int BatchSize { get; set; } = 25;

    public static IEnumerable<string> Validate(OrderReservationOptions options)
    {
        if (options.PollIntervalSeconds is < 5 or > 3600)
        {
            yield return "OrderReservation:PollIntervalSeconds must be between 5 and 3600.";
        }

        if (options.BatchSize is < 1 or > 200)
        {
            yield return "OrderReservation:BatchSize must be between 1 and 200.";
        }
    }
}

public sealed class OrderReservationOptionsValidator
    : IValidateOptions<OrderReservationOptions>
{
    public ValidateOptionsResult Validate(
        string? name,
        OrderReservationOptions options)
    {
        var failures = OrderReservationOptions.Validate(options).ToArray();
        return failures.Length == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(failures);
    }
}
