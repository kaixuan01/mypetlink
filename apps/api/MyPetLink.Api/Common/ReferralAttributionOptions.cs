using Microsoft.Extensions.Options;

namespace MyPetLink.Api.Common;

/// <summary>
/// Deployment-owned launch policy for accepting a saved first-touch referral.
/// The server is authoritative; the browser expiry is only storage hygiene.
/// </summary>
public sealed class ReferralAttributionOptions
{
    public const string SectionName = "ReferralAttribution";
    public const int DefaultWindowDays = 90;

    public int WindowDays { get; set; } = DefaultWindowDays;
}

public sealed class ReferralAttributionOptionsValidator
    : IValidateOptions<ReferralAttributionOptions>
{
    public ValidateOptionsResult Validate(string? name, ReferralAttributionOptions options) =>
        options.WindowDays is >= 1 and <= 3650
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(
                "ReferralAttribution:WindowDays must be between 1 and 3650.");
}
